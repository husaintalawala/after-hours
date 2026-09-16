import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

// Private-activity behaviour tests. These modules are browser-only and reach
// storage, fetch and the Supabase client, so each one is transpiled with its
// environment edges replaced by a stub and imported as a fresh module. A data:
// URL is cached by its contents, hence the counter that makes every load
// unique — appended AFTER transpiling, because the emitter drops a trailing
// comment and every "fresh" tab silently shared one module instance.

class Store {
  data = new Map()
  get length() { return this.data.size }
  key(i) { return [...this.data.keys()][i] ?? null }
  getItem(k) { return this.data.get(k) ?? null }
  setItem(k, v) { this.data.set(k, String(v)) }
  removeItem(k) { this.data.delete(k) }
  keys() { return [...this.data.keys()] }
}

let seq = 0
function load(source) {
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText + `\nexport const __instance = ${++seq}\n`
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
}
/** Lets fire-and-forget work (a consent re-read after a 4xx) finish inside the test that started it. */
const settle = () => new Promise((r) => setTimeout(r, 5))
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')

function loadActivity() {
  return load(read('../src/lib/activity.ts')
    .replace('import { activityAvailable, installActivityScope, mirrorActivity } from "./activity-scope"',
      'const activityAvailable = () => process.env.NEXT_PUBLIC_ACTIVITY_ENABLED === "true"\nconst installActivityScope = (f) => { globalThis.__installedScope = f }\nconst mirrorActivity = (n, p) => (globalThis.__mirrored ??= []).push([n, p])')
    .replace('import("@/lib/supabase/client").then((m) => m.createClient())', 'Promise.resolve(globalThis.__activityClient())'))
}
const loadScope = () => load(read('../src/lib/activity-scope.ts'))

function browser({ local = new Store(), session = new Store(), user = 'user-a' } = {}) {
  globalThis.localStorage = local
  globalThis.sessionStorage = session
  globalThis.window = new EventTarget()
  globalThis.document = { visibilityState: 'visible', hasFocus: () => true }
  globalThis.__activityClient = () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: user }, access_token: 'token-' + user } } }) } })
  process.env.NEXT_PUBLIC_ACTIVITY_ENABLED = 'true'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-test'
  return { local, session }
}

/** A stand-in for the RPCs, holding the same state the real functions hold. */
function server() {
  const state = { enabled: false, row: false, version: '', log: [], batches: [], fail: null, reject: new Set(), hang: false }
  let epoch = 0
  const body = (o) => new Response(JSON.stringify(o))
  globalThis.fetch = async (url, init) => {
    state.log.push(String(url).split('/rest/v1/')[1] ?? String(url))
    if (state.fail !== null) {
      if (typeof state.fail === 'number') return new Response(null, { status: state.fail })
      throw new Error('offline')
    }
    if (url.includes('get_activity_consent')) return body({ enabled: state.enabled, consent_version: state.row ? state.version : '' })
    if (url.includes('set_activity_enabled')) {
      const next = JSON.parse(init.body).enabled
      if (!state.row || next !== state.enabled) state.version = `2026-09-16T00:00:${String(++epoch).padStart(2, '0')}.000000Z`
      state.enabled = next; state.row = true
      return body({ enabled: state.enabled, consent_version: state.version })
    }
    if (url.includes('record_activity_batch')) {
      const events = JSON.parse(init.body).events
      state.batches.push(events)
      return body({
        accepted: events.filter((e) => !state.reject.has(e.event_name)).map((e) => e.event_id),
        rejected: events.filter((e) => state.reject.has(e.event_name)).map((e) => e.event_id),
        enabled: state.enabled, consent_version: state.version,
      })
    }
    throw new Error('unexpected request ' + url)
  }
  return state
}

const BACKOFF_CEILING_MS = 300_000
const delivered = (s) => s.batches.flat()
const counts = (s, path) => s.log.filter((l) => l.includes(path)).length
const queues = (store) => store.keys().filter((k) => k.startsWith('drift.privateActivity.v1.'))

test('consent, delivery and the shape of what leaves the device', async () => {
  browser(); const s = server()
  const a = await loadActivity()

  // Off by default: nothing is delivered before an opt-in.
  await a.connectActivity('user-a')
  a.recordActivity('feature_viewed', 'discover')
  await a.flushActivity()
  assert.equal(s.batches.length, 0)

  await a.setActivityEnabled(true)
  a.recordActivity('feature_viewed', 'discover')
  await a.flushActivity()
  const events = delivered(s)
  // The first record of a session opens it, so feature_viewed rides behind one.
  assert.deepEqual(events.map((e) => e.event_name), ['session_started', 'feature_viewed'])
  assert.deepEqual(Object.keys(events[1].properties), [])
  assert.equal(events[1].platform, 'web')
  assert.equal(events[1].environment, 'test', 'unknown NEXT_PUBLIC_VERCEL_ENV must not file as production')
  assert.match(events[1].app_version, /^1\.0\.0(\+[0-9a-f]{7})?$/)
  assert.equal(events[1].consent_version, s.version, 'the server epoch is stored and returned verbatim')
  // UUIDv7: version nibble 7, RFC 4122 variant, and time-ordered.
  assert.match(events[1].event_id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.ok(events[0].event_id.slice(0, 13) <= events[1].event_id.slice(0, 13), 'the 48-bit time prefix is ordered')
  assert.equal(a.activityEnabled(), true)

  // Content and unknown enum values are refused locally, before the queue.
  a.recordActivity('guide_opened', 'inspire', 'observed', { search: 'private text' })
  a.recordActivity('guide_opened', 'inspire', 'observed', { entrypoint: 'private text' })
  // The server takes integers only; a fractional duration_ms is a text channel.
  a.recordActivity('guide_opened', 'inspire', 'observed', { duration_ms: 12.3456 })
  await a.flushActivity()
  assert.equal(delivered(s).length, 2, 'no invalid event reaches the wire')

  // Both entrypoints the live call sites already pass are accepted.
  a.recordActivity('add_to_itinerary', 'discover', 'succeeded', { entrypoint: 'search' })
  a.recordActivity('add_to_itinerary', 'trips', 'succeeded', { entrypoint: 'map' })
  await a.flushActivity()
  assert.equal(delivered(s).length, 4)
})

test('an opt-out that cannot reach the server stands anyway, and is retried', async () => {
  const { local } = browser(); const s = server()
  const a = await loadActivity()
  await a.connectActivity('user-a')
  await a.setActivityEnabled(true)
  a.recordActivity('feature_viewed', 'discover')
  await a.flushActivity()
  assert.equal(s.batches.length, 1)

  // The withdrawal never lands.
  s.fail = 'offline'
  await assert.rejects(() => a.setActivityEnabled(false))
  assert.equal(a.activityEnabled(), false, 'the choice is applied locally regardless')
  assert.equal(local.getItem('drift.activity.optout'), 'true')
  assert.equal(local.keys().filter((k) => k.startsWith('drift.privateActivity.v1.')).length, 0, 'the queue is erased before the server is asked')

  // The server still believes sharing is on. A consent refresh must NOT read
  // and adopt that — this is the 60 s poll that silently undid the opt-out.
  const before = counts(s, 'get_activity_consent')
  await a.refreshConsent('user-a')
  assert.equal(counts(s, 'get_activity_consent'), before, 'an unconfirmed choice is retried, never re-read')
  assert.equal(a.activityEnabled(), false)
  a.recordActivity('feature_viewed', 'discover')
  await a.flushActivity()
  assert.equal(s.batches.length, 1, 'nothing is recorded or delivered after the opt-out')

  // Connectivity returns: the stored choice is what gets sent.
  s.fail = null
  await a.refreshConsent('user-a')
  assert.equal(s.enabled, false, 'the server ends up OFF')
  assert.equal(a.activityEnabled(), false)
  assert.equal(local.getItem('drift.activity.choice.user-a'), null, 'the pending choice is cleared once accepted')
})

test('ON then OFF in quick succession leaves the server OFF', async () => {
  browser(); const s = server()
  const a = await loadActivity()
  await a.connectActivity('user-a')
  const on = a.setActivityEnabled(true)
  const off = a.setActivityEnabled(false)
  await Promise.allSettled([on, off])
  assert.equal(s.enabled, false)
  assert.equal(a.activityEnabled(), false)
})

test('rejected ids leave the queue with the accepted ones', async () => {
  browser(); const s = server()
  const a = await loadActivity()
  await a.connectActivity('user-a')
  await a.setActivityEnabled(true)
  // One event the server will refuse, two it will take.
  s.reject = new Set(['guide_opened'])
  a.recordActivity('feature_viewed', 'discover')
  a.recordActivity('guide_opened', 'inspire')
  await a.flushActivity()
  assert.equal(s.batches.length, 1)
  await a.flushActivity()
  assert.equal(s.batches.length, 1, 'a refused event is never resent — one bad row must not park the queue')
})

test('5xx backs off instead of hammering, and the batch survives it', async (t) => {
  browser(); const s = server()
  const a = await loadActivity()
  await a.connectActivity('user-a')
  await a.setActivityEnabled(true)
  a.recordActivity('feature_viewed', 'discover')

  t.mock.timers.enable({ apis: ['Date'], now: Date.now() })
  s.fail = 503
  await a.flushActivity()
  const after503 = s.log.length
  await a.flushActivity()
  assert.equal(s.log.length, after503, 'a second flush inside the backoff window sends nothing — no 5 s retry loop')
  assert.equal(a.activityHealth(), 'Usage delivery is delayed; queued events will retry.')

  s.fail = null
  t.mock.timers.tick(6_000)
  await a.flushActivity()
  t.mock.timers.reset()
  assert.deepEqual(delivered(s).map((e) => e.event_name), ['session_started', 'feature_viewed'], 'a transient failure loses nothing')
  assert.equal(a.activityHealth(), '', 'and only a delivered batch clears the delivery warning')
  await settle()
})

test('a backlog drains in one flush, fifty at a time', async (t) => {
  browser(); const s = server()
  const a = await loadActivity()
  await a.connectActivity('user-a')
  await a.setActivityEnabled(true)
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() })
  s.fail = 'offline'
  for (let i = 0; i < 120; i++) a.recordActivity('feature_viewed', 'discover')
  await settle()
  s.fail = null
  t.mock.timers.tick(BACKOFF_CEILING_MS)
  await a.flushActivity()
  t.mock.timers.reset()
  assert.deepEqual(s.batches.map((b) => b.length), [50, 50, 21], 'no waiting for the next wake-up per batch')
  await settle()
})

test('4xx is permanent: the batch is dropped, not retried forever', async () => {
  browser(); const s = server()
  const a = await loadActivity()
  await a.connectActivity('user-a')
  await a.setActivityEnabled(true)
  a.recordActivity('feature_viewed', 'discover')

  s.fail = 400
  await a.flushActivity()
  s.fail = null
  await settle() // the consent re-read a 4xx triggers
  await a.flushActivity()
  assert.equal(s.batches.length, 0, 'the refused batch never comes back')
  assert.equal(a.activityHealth(), 'Some usage could not be delivered and was discarded.')

  // The queue moves again for everything recorded afterwards.
  a.recordActivity('guide_opened', 'inspire')
  await a.flushActivity()
  assert.deepEqual(delivered(s).map((e) => e.event_name), ['guide_opened'])
  await settle()
})

test('events recorded before consent answers are buffered, then kept or discarded', async () => {
  browser(); const s = server()
  s.row = true; s.enabled = true; s.version = '2026-09-16T00:00:09.000000Z'
  const a = await loadActivity()
  // Not awaited: this is the mount-effect window that used to drop events.
  const connecting = a.connectActivity('user-a')
  a.recordActivity('guide_opened', 'inspire')
  assert.equal(queues(globalThis.localStorage).length, 0, 'the buffer is never written to disk')
  await connecting
  await a.flushActivity()
  assert.deepEqual(delivered(s).map((e) => e.event_name), ['session_started', 'guide_opened'], 'a consented user keeps them')
  assert.equal(delivered(s)[1].consent_version, s.version, 'stamped with the epoch that arrived after they were recorded')

  // Same window, but the answer is no.
  browser({ user: 'user-b' }); const t = server()
  t.row = true; t.enabled = false; t.version = '2026-09-16T00:00:09.000000Z'
  const b = await loadActivity()
  const refusing = b.connectActivity('user-b')
  b.recordActivity('guide_opened', 'inspire')
  await refusing
  await b.flushActivity()
  assert.equal(t.batches.length, 0, 'a refusal discards them')
  assert.equal(queues(globalThis.localStorage).length, 0)
  await settle()
})

test("tabs do not fan out, and a closed tab's events are claimed once", async () => {
  const local = new Store(), tabA = new Store(), tabB = new Store()
  const keyOf = (tab) => 'drift.privateActivity.v1.' + tab.getItem('drift.privateActivity.v1.')
  browser({ local, session: tabA }); const s = server()
  const a = await loadActivity()
  await a.connectActivity('user-a')
  await a.setActivityEnabled(true)

  // Tab B: its own session storage, the same device storage.
  globalThis.sessionStorage = tabB
  const b = await loadActivity()
  await b.connectActivity('user-a')
  assert.notEqual(keyOf(tabA), keyOf(tabB))
  assert.deepEqual(queues(local).sort(), [keyOf(tabA), keyOf(tabB)].sort(), 'each tab owns its own queue')

  // Tab A reconnects and delivers. Tab B's queue is EMPTY but live, and
  // deleting it is what used to wake every other tab into its own read.
  globalThis.sessionStorage = tabA
  await a.connectActivity('user-a')
  a.recordActivity('feature_viewed', 'discover')
  await a.flushActivity()
  assert.ok(local.getItem(keyOf(tabB)), "a live tab's empty queue is left alone")
  const reads = counts(s, 'get_activity_consent')
  assert.equal(reads, 3, 'one consent read per connect, and nothing reacting to queue writes')
  // What woke the other tabs was the provider's listener; it now hears one key.
  assert.match(read('../src/components/app/ActivityProvider.tsx'), /e\.key === ACTIVITY_CONSENT_KEY/)

  // Tab B closes with events still queued; tab A adopts them, once.
  const stranded = { event_id: '0199aaaa-0000-7000-8000-00000000abcd', event_name: 'guide_opened', feature: 'inspire', outcome: 'observed', is_foreground: true, session_id: '0199aaaa-0000-7000-8000-00000000ffff', platform: 'web', environment: 'test', app_version: '1.0.0', schema_version: 1, consent_version: s.version, occurred_at: new Date().toISOString(), properties: {} }
  const orphan = keyOf(tabB)
  local.setItem(orphan, JSON.stringify({ owner: 'user-a', consentVersion: s.version, beat: Date.now() - 120_000, pending: [stranded, stranded] }))
  await a.refreshConsent('user-a', true)
  await a.flushActivity()
  assert.equal(delivered(s).filter((e) => e.event_id === stranded.event_id).length, 1, 'claimed once, deduped by event_id')
  assert.equal(local.getItem(orphan), null, 'and the orphan is cleared')

  // A duplicated tab inherits sessionStorage. Tab A is still beating, so the
  // copy must take its own id rather than overwrite A's queue.
  const copied = new Store()
  copied.setItem('drift.privateActivity.v1.', tabA.getItem('drift.privateActivity.v1.'))
  globalThis.sessionStorage = copied
  const dup = await loadActivity()
  await dup.connectActivity('user-a')
  dup.recordActivity('feature_viewed', 'discover')
  assert.notEqual(keyOf(copied), keyOf(tabA), 'the duplicate takes a new tab id')
  assert.ok(local.getItem(keyOf(tabA)), "and A's queue is still A's")

  // A reload is not a duplicate: pagehide releases the beat, so the id is kept.
  globalThis.sessionStorage = tabA
  a.flushActivityOnHide()
  const reloaded = await loadActivity()
  await reloaded.connectActivity('user-a')
  reloaded.recordActivity('feature_viewed', 'discover')
  assert.equal(queues(local).filter((k) => k === keyOf(tabA)).length, 1)
  assert.equal(tabA.getItem('drift.privateActivity.v1.'), keyOf(tabA).slice('drift.privateActivity.v1.'.length))
  await settle()
})

test('a session read that never settles does not wedge later flushes', async (t) => {
  browser(); const s = server()
  const a = await loadActivity()
  await a.connectActivity('user-a')
  await a.setActivityEnabled(true)
  a.recordActivity('feature_viewed', 'discover')

  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })
  globalThis.__activityClient = () => ({ auth: { getSession: () => new Promise(() => {}) } })
  const hung = a.flushActivity()
  // Let the dynamic client import resolve so the session read is the thing hanging.
  await Promise.resolve(); await Promise.resolve()
  t.mock.timers.tick(16_000)
  await hung // the timeout must cover the session read, not just the fetch
  assert.equal(s.batches.length, 0)
  // Past the backoff, with a session read that answers.
  globalThis.__activityClient = () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: 'user-a' }, access_token: 'token-user-a' } } }) } })
  t.mock.timers.tick(10_000)
  await a.flushActivity()
  t.mock.timers.reset()
  assert.equal(s.batches.length, 1, 'the flush latch was released')
})

test('a flag-off launch leaves nothing behind', async () => {
  const { local, session } = browser(); const s = server()
  const a = await loadActivity()
  await a.connectActivity('user-a')
  await a.setActivityEnabled(true)
  a.recordActivity('feature_viewed', 'discover')
  // An opt-out that fails leaves every kind of key: queue-less, but a pending
  // choice, the optout marker and the cached consent.
  s.fail = 'offline'
  await assert.rejects(() => a.setActivityEnabled(false))
  a.recordActivity('feature_viewed', 'discover')
  assert.ok(local.getItem('drift.activity.choice.user-a'))
  assert.ok(local.getItem('drift.activity.optout'))
  assert.ok(local.getItem('drift.activity.consent'))
  assert.ok(session.keys().some((k) => k.startsWith('drift.privateActivity')))

  delete process.env.NEXT_PUBLIC_ACTIVITY_ENABLED
  const off = await loadActivity()
  off.cleanupActivityStorage()
  assert.deepEqual(local.keys().filter((k) => k.startsWith('drift.privateActivity') || k.startsWith('drift.activity')), [])
  assert.deepEqual(session.keys().filter((k) => k.startsWith('drift.privateActivity')), [])
  await settle()
})

test('the legacy mapper mirrors, and never double-counts a natively recorded event', async () => {
  const seen = []
  const scope = await load(read('../src/lib/activity-scope.ts'))
  scope.installActivityScope(() => (...args) => { seen.push(args); return true }, () => true)

  // Recorded natively by their own surfaces, so mapping them here as well
  // would file two events for one trip.
  scope.recordLegacyActivity('create_trip', { source: 'manual' })
  scope.recordLegacyActivity('trip_activated', { stop_count: 3 })
  assert.equal(seen.length, 0)

  scope.recordLegacyActivity('add_to_itinerary', { source: 'discover', category: 'food' })
  assert.deepEqual(seen.at(-1), ['add_to_itinerary', 'discover', 'succeeded', { entrypoint: 'discover' }], 'the surface rides along; the category does not')
  scope.recordLegacyActivity('add_to_itinerary', { source: 'map' })
  assert.deepEqual(seen.at(-1), ['add_to_itinerary', 'trips', 'succeeded', { entrypoint: 'map' }])
  scope.recordLegacyActivity('expense_added', { source: 'manual' })
  assert.deepEqual(seen.at(-1), ['expense_added', 'expenses', 'succeeded', { entrypoint: 'manual' }])
  scope.recordLegacyActivity('login_success', { method: 'magic_link' })
  assert.equal(seen.length, 3, 'an acquisition event has no private equivalent and is not invented')
})

test('trip_activated: a trip that activated before opt-in is still counted after it', async () => {
  globalThis.window = new EventTarget(); globalThis.localStorage = new Store()
  const posthog = [], taken = [], state = { recording: false, count: 3, heads: 0 }
  globalThis.__capture = (event, props) => posthog.push([event, props])
  globalThis.__scope = () => (...args) => { if (!state.recording) return false; taken.push(args); return true }
  globalThis.__recording = () => state.recording
  globalThis.__db = { from: () => ({ select: () => ({ eq: async () => { state.heads++; return { count: state.count, error: null } } }) }) }
  const activation = await load(read('../src/lib/drift/activation.ts')
    .replace('import { AnalyticsEvent, capture } from "@/lib/analytics"', 'const AnalyticsEvent = { TripActivated: "trip_activated" }; const capture = (...a) => globalThis.__capture(...a)')
    .replace('import { activityRecording, activityScope } from "@/lib/activity-scope"', 'const activityRecording = () => globalThis.__recording(); const activityScope = () => globalThis.__scope()')
    .replace('await import("@/lib/supabase/client")', '{ createClient: () => globalThis.__db }'))

  // Three stops, not opted in: PostHog hears it once, private activity does not.
  await activation.checkTripActivated('trip-1')
  assert.deepEqual(posthog, [['trip_activated', { stop_count: 3 }]])
  assert.equal(taken.length, 0)
  await activation.checkTripActivated('trip-1')
  assert.equal(state.heads, 1, 'a non-recording account pays one HEAD count per trip, not one per add')

  // Opts in, adds a fourth stop: counted privately now, and PostHog not again.
  state.recording = true; state.count = 4
  await activation.checkTripActivated('trip-1')
  assert.deepEqual(taken, [['trip_activated', 'trips', 'succeeded', { stop_count: 4 }]])
  assert.equal(posthog.length, 1, "PostHog's one-per-trip rule is untouched")
  await activation.checkTripActivated('trip-1')
  assert.equal(taken.length, 1, 'and privately it is once per trip too')
  assert.equal(state.heads, 2)
})

// ── Flag-off regression guard ────────────────────────────────────────────────
// Private activity is ADDITIVE. Turning the flag on — or leaving it off after a
// build that had it on — must not take PostHog or the Meta pixel off the air.
async function loadAnalytics(sink) {
  globalThis.__posthog = {
    init() {}, capture(event, props) { sink.ph.push([event, props]) }, identify(id, props) { sink.id.push([id, props]) },
  }
  return load(read('../src/lib/analytics.ts')
    .replace('import { installActivityMirror, recordLegacyActivity } from "./activity-scope"', 'const recordLegacyActivity = (n, p) => globalThis.__legacy.push([n, p])\nconst installActivityMirror = (f) => { globalThis.__mirror = f }')
    .replace('import("posthog-js")', 'Promise.resolve({ default: globalThis.__posthog })'))
}

for (const flag of ['true', undefined]) {
  test(`capture() reaches PostHog and Meta with NEXT_PUBLIC_ACTIVITY_ENABLED=${flag ?? 'unset'}`, async () => {
    const sink = { ph: [], id: [] }
    globalThis.__legacy = []
    globalThis.window = Object.assign(new EventTarget(), { location: { hostname: 'drift.after-hours.app', pathname: '/app/trips/1', href: 'https://drift.after-hours.app/app/trips/1' } })
    globalThis.document = { createElement: () => ({}), head: { appendChild() {} } }
    globalThis.sessionStorage = new Store(); globalThis.localStorage = new Store()
    globalThis.fetch = async () => new Response(JSON.stringify({ adsAllowed: true }))
    if (flag) process.env.NEXT_PUBLIC_ACTIVITY_ENABLED = flag; else delete process.env.NEXT_PUBLIC_ACTIVITY_ENABLED
    // A device that once opted out of private activity must still be measured
    // by the product analytics it never opted out of.
    globalThis.localStorage.setItem('drift.activity.optout', 'true')
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'ph-test'
    process.env.NEXT_PUBLIC_META_PIXEL_ID = '1234567890'

    const an = await loadAnalytics(sink)
    an.initAnalytics()
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    an.capture(an.AnalyticsEvent.CreateTrip, { trip_type: 'solo', has_end_date: true })
    an.capture(an.AnalyticsEvent.LoginSuccess, { is_new_user: false })
    an.identifyUser('user-a', { platform: 'web' })
    an.trackPageview('https://drift.after-hours.app/app/discover')

    assert.ok(sink.ph.some(([e]) => e === 'create_trip'), 'the create_trip NewTripFlow sends must reach PostHog')
    assert.ok(sink.ph.some(([e]) => e === 'login_success'), 'the acquisition funnel has no private equivalent and must not be discarded')
    assert.ok(sink.ph.some(([e]) => e === '$pageview'))
    assert.deepEqual(sink.id[0], ['user-a', { platform: 'web' }])
    const fbq = globalThis.window.fbq
    assert.ok(fbq, 'the Meta pixel loads')
    assert.ok(fbq.queue.some(([verb, name]) => verb === 'trackCustom' && name === 'create_trip'), "Meta's create_trip custom conversion still fires")
  })
}

test('NewTripFlow still captures create_trip for PostHog and Meta', () => {
  // The branch replaced this call with an activity-only one, which is a no-op
  // whenever the flag is unset — today's production setting.
  const source = read('../src/components/app/trip/NewTripFlow.tsx')
  assert.match(source, /capture\(AnalyticsEvent\.CreateTrip/)
  assert.match(source, /activity\("create_trip","trips","succeeded"/)
})

// ── PostHog copy ─────────────────────────────────────────────────────────────
test('the PostHog copy is made only for events the queue took', async () => {
  browser(); server()
  globalThis.__mirrored = []
  const a = await loadActivity()
  await a.connectActivity('user-a')
  a.recordActivity('feature_viewed', 'discover')
  assert.equal(globalThis.__mirrored.length, 0, 'nothing is copied while sharing is off')

  await a.setActivityEnabled(true)
  const actionId = crypto.randomUUID()
  a.recordActivity('create_trip', 'trips', 'succeeded', { entrypoint: 'manual' }, actionId)
  assert.deepEqual(globalThis.__mirrored.find(([n]) => n === 'create_trip'),
    ['create_trip', { feature: 'trips', outcome: 'succeeded', action_id: actionId, entrypoint: 'manual' }],
    'the same fixed fields the server gets, and nothing else')
  a.recordActivity('guide_opened', 'inspire', 'observed', { search: 'private text' })
  assert.ok(!globalThis.__mirrored.some(([n]) => n === 'guide_opened'), 'an event the queue refused is not copied either')

  await a.setActivityEnabled(false)
  const count = globalThis.__mirrored.length
  a.recordActivity('feature_viewed', 'discover')
  assert.equal(globalThis.__mirrored.length, count, 'and nothing after sharing is turned off')
  await settle()
})

test('activity copies reach PostHog as activity_*, never Meta and never the legacy name', async () => {
  const sink = { ph: [], id: [] }
  globalThis.__legacy = []
  globalThis.window = Object.assign(new EventTarget(), { location: { hostname: 'drift.after-hours.app', pathname: '/app/trips/1', href: 'https://drift.after-hours.app/app/trips/1' } })
  globalThis.document = { createElement: () => ({}), head: { appendChild() {} } }
  globalThis.sessionStorage = new Store(); globalThis.localStorage = new Store()
  globalThis.fetch = async () => new Response(JSON.stringify({ adsAllowed: true }))
  process.env.NEXT_PUBLIC_POSTHOG_KEY = 'ph-test'
  process.env.NEXT_PUBLIC_META_PIXEL_ID = '1234567890'
  const an = await loadAnalytics(sink)
  an.initAnalytics()
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))

  globalThis.__mirror('create_trip', { feature: 'trips', outcome: 'succeeded' })
  assert.deepEqual(sink.ph.find(([e]) => e === 'activity_create_trip'), ['activity_create_trip', { feature: 'trips', outcome: 'succeeded' }])
  assert.ok(!sink.ph.some(([e]) => e === 'create_trip'), 'never counted with the legacy create_trip')
  assert.ok(!globalThis.window.fbq.queue.some(([, name]) => String(name).includes('create_trip')), 'and never sent to Meta')
  assert.equal(globalThis.__legacy.length, 0, 'and never looped back into the activity mapper')
})

