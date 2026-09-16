"use client"

import { activityAvailable, installActivityScope, mirrorActivity } from "./activity-scope"

// Optional, account-linked usage history. No content and no object ids: the
// vocabulary below is the whole of what can ever leave this device.
//
// ADDITIVE, NEVER A REPLACEMENT. Nothing in this module touches PostHog or the
// Meta pixel — see the note on capture() in analytics.ts. It records nothing at
// all unless NEXT_PUBLIC_ACTIVITY_ENABLED is on AND the account has opted in.
export type Feature = "app" | "discover" | "inspire" | "backpocket" | "trips" | "chat" | "onboarding" | "profile" | "settings" | "expenses" | "invites"
type Outcome = "observed" | "started" | "succeeded" | "failed"
type Environment = "production" | "staging" | "test"
type ActivityEvent = { event_id: string; event_name: string; feature: Feature; outcome: Outcome; is_foreground: boolean; session_id: string; platform: "web"; environment: Environment; app_version: string; schema_version: 1; consent_version: string; occurred_at: string; action_id?: string; properties: Record<string, string | number | boolean> }
/** Every RPC answers with the live consent state, which is why nothing polls preferences. */
type ConsentState = { enabled: boolean; consent_version: string }
type Envelope = { owner: string; consentVersion: string; beat: number; pending: ActivityEvent[] }

// One queue per TAB (localStorage, keyed by a sessionStorage tab id) so two tabs
// cannot overwrite each other's undelivered events.
const PREFIX = "drift.privateActivity.v1."
/** sessionStorage: {id, at} — a reload continues the same session, 30 idle minutes does not. */
const SESSION_KEY = PREFIX + "session"
/** Everything else this feature keeps on the device lives under here. */
const ACTIVITY_KEYS = "drift.activity."
/** The ONLY key ActivityProvider's storage listener reacts to. Queue keys change constantly. */
export const ACTIVITY_CONSENT_KEY = ACTIVITY_KEYS + "consent"
/** A choice made here but not yet accepted by the server, per owner. */
const CHOICE_PREFIX = ACTIVITY_KEYS + "choice."
/** Written only by an explicit opt-out — never by a connect. */
const OPTOUT_KEY = ACTIVITY_KEYS + "optout"

const QUEUE_MAX = 5000
/** Events recorded before the consent answer lands. In memory only, and small. */
const PRE_CONSENT_MAX = 50
const FLUSH_AT = 20
const MAX_BATCH = 50
const RETAIN_MS = 7 * 86_400_000
const SESSION_IDLE_MS = 1_800_000
const PASSIVE_MS = 300_000
/** Consent rides on batch responses, so a read is only needed this often. */
const CONSENT_FLOOR_MS = 900_000
/** A queue whose tab has not beaten in this long is orphaned and claimable. */
const TAB_STALE_MS = 60_000
const REQUEST_TIMEOUT_MS = 15_000
const BACKOFF_MIN_MS = 5_000
const BACKOFF_MAX_MS = 300_000

// NEXT_PUBLIC_VERCEL_ENV, not NODE_ENV: NODE_ENV is "production" for any
// `next build`, which would file every preview and local build as production.
// Unknown means test — the safe direction for a report nobody should trust yet.
const ENVIRONMENT: Environment = process.env.NEXT_PUBLIC_VERCEL_ENV === "production" ? "production" : process.env.NEXT_PUBLIC_VERCEL_ENV === "preview" ? "staging" : "test"
// Semver + build metadata: the server's app_version check wants a leading
// digit, so a bare commit SHA would be rejected.
const APP_VERSION = `1.0.0${process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ? `+${process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA.slice(0, 7)}` : ""}`

const PERMITTED = new Set(["session_started", "foreground_active", "feature_viewed", "trip_creation_started", "create_trip", "guide_opened", "guide_adopted", "backpocket_saved", "backpocket_unsaved", "add_to_itinerary", "trip_activated", "chat_message_sent", "chat_response_completed", "onboarding_step_viewed", "onboarding_step_completed", "onboarding_completed", "invite_link_created", "invite_accepted", "expense_added", "search_started", "search_completed"])
// Fixed property names and enums, mirroring the server exactly — a value this
// allowlist accepts and the server does not is an event that can never deliver.
const PROPERTY_KEYS = new Set(["entrypoint", "item_type", "step_index", "stop_count", "duration_ms", "cache_hit", "error_code"])
const ENTRYPOINTS = ["manual", "daybreak", "chat", "import", "copy", "inspire", "discover", "backpocket", "direct", "search", "map"]
const ITEM_TYPES = ["place", "guide"]
const ERROR_CODES = ["network", "timeout", "unauthorized", "validation", "server", "cancelled", "unknown"]
/** The server takes these as digit strings of a fixed width; anything looser is a text channel. */
const NUMERIC_MAX: Record<string, number> = { duration_ms: 99_999_999, stop_count: 99_999, step_index: 999 }

let owner: string | null = null
let enabled = false
/** True once this device has an answer about consent — cached or from the server. */
let consentKnown = false
let consentVersion = ""
let pending: ActivityEvent[] = []
let preConsent: ActivityEvent[] = []
let session = ""
let sessionLoaded = false
let lastUse = 0
let passive = 0
let flushing = false
let generation = 0
let tabId = ""
let lastConsentAt = 0
let consentInFlight: Promise<void> | null = null
let choiceInFlight: Promise<void> | null = null
let backoff = 0
let nextAttemptAt = 0
/** Kept so a pagehide flush can fire with keepalive without awaiting getSession(). */
let lastToken = ""
let health = ""
/** Delivery state is its OWN slot: a storage warning must not wipe it, and only a delivered batch clears it. */
let lastDeliveryError = ""

export { activityAvailable }
export const activityEnabled = () => enabled
export const activityHealth = () => health || lastDeliveryError
/** True once an explicit opt-out has been recorded on this device. */
export function activityOptedOut() { return readLocal(OPTOUT_KEY) === "true" }

const announce = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event("drift-activity-change")) }
function setHealth(message: string) { if (health === message) return; health = message; announce() }
function setDeliveryError(message: string) { if (lastDeliveryError === message) return; lastDeliveryError = message; announce() }

// ── storage ──────────────────────────────────────────────────────────────────
// Every access is wrapped: `localStorage` itself throws when site data is
// blocked, so even a bare `.length` read is enough to break an auth callback.
function readLocal(key: string): string | null { try { return localStorage.getItem(key) } catch { return null } }
function writeLocal(key: string, value: string): boolean { try { localStorage.setItem(key, value); return true } catch { return false } }
function removeLocal(key: string) { try { localStorage.removeItem(key) } catch { /* nothing to remove from */ } }
function localKeys(): string[] {
  const keys: string[] = []
  try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k) keys.push(k) } } catch { return [] }
  return keys
}

function readEnvelope(key: string): Envelope | null {
  const raw = readLocal(key)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<Envelope>
    if (typeof parsed?.owner !== "string" || !Array.isArray(parsed.pending)) return null
    return { owner: parsed.owner, consentVersion: typeof parsed.consentVersion === "string" ? parsed.consentVersion : "", beat: typeof parsed.beat === "number" ? parsed.beat : 0, pending: parsed.pending as ActivityEvent[] }
  } catch { return null }
}

function queueKey(): string {
  if (tabId) return PREFIX + tabId
  let id = ""
  try { id = sessionStorage.getItem(PREFIX) ?? "" } catch { /* private mode — a per-document id is still correct */ }
  // sessionStorage is COPIED into a duplicated tab, so an id whose queue is
  // still beating belongs to the tab we were duplicated from. Two tabs sharing
  // one key means each rewrite drops the other's events; take a new id instead.
  // A reload is not a duplicate: pagehide releases the beat before unload.
  if (id) { const live = readEnvelope(PREFIX + id); if (live && Date.now() - live.beat < TAB_STALE_MS) id = "" }
  if (!id) { id = uuidv7(); try { sessionStorage.setItem(PREFIX, id) } catch { /* noop */ } }
  tabId = id
  return PREFIX + id
}

/** `beat` is this tab saying it is still alive; 0 releases the queue for claiming. */
function writeQueue(beat: number) {
  // Never while sharing is off — not even an empty envelope. A refusal leaves
  // this device holding nothing under the prefix.
  if (!owner || !enabled) return
  const envelope: Envelope = { owner, consentVersion, beat, pending }
  if (!writeLocal(queueKey(), JSON.stringify(envelope))) setHealth("Usage history could not be queued on this device.")
  else if (health === "Usage history could not be queued on this device.") setHealth("")
}
function persist() { writeQueue(Date.now()) }
function clearQueue() { pending = []; removeLocal(queueKey()) }

/** Erase every queue on this device — the privacy duty on opt-out and account switch. */
function clearAllQueues() {
  pending = []
  for (const key of localKeys()) if (key.startsWith(PREFIX)) removeLocal(key)
}

// ── ids ──────────────────────────────────────────────────────────────────────
/** UUIDv7: time-ordered, so a batch inserts into one index leaf instead of 50. */
function uuidv7(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  const ms = Date.now()
  b[0] = Math.floor(ms / 0x10000000000) & 0xff
  b[1] = Math.floor(ms / 0x100000000) & 0xff
  b[2] = (ms >>> 24) & 0xff
  b[3] = (ms >>> 16) & 0xff
  b[4] = (ms >>> 8) & 0xff
  b[5] = ms & 0xff
  b[6] = 0x70 | (b[6] & 0x0f)
  b[8] = 0x80 | (b[8] & 0x3f)
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// ── requests ─────────────────────────────────────────────────────────────────
class ActivityRequestError extends Error {
  /** 0 means the answer never arrived: network, timeout or abort. */
  constructor(readonly status: number, message: string) { super(message) }
}

async function request(path: string, body?: unknown): Promise<unknown> {
  const captured = owner, epoch = generation
  const controller = new AbortController()
  // The timer starts BEFORE the session read, and the read is raced against it.
  // getSession() used to be awaited outside the abort window, so one call that
  // never settled wedged every later flush in the tab for the life of the page.
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const aborted = new Promise<never>((_, reject) => { controller.signal.addEventListener("abort", () => reject(new ActivityRequestError(0, "Activity request timed out"))) })
  // Handled here as well as by the races below: once a race has a winner the
  // loser is nobody's business, and an unattached rejection is a page-level error.
  aborted.catch(() => { /* noop */ })
  try {
    const client = await Promise.race([import("@/lib/supabase/client").then((m) => m.createClient()), aborted])
    const { data: { session: auth } } = await Promise.race([client.auth.getSession(), aborted])
    if (!auth || auth.user.id !== captured || epoch !== generation) throw new ActivityRequestError(0, "Account changed")
    lastToken = auth.access_token
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
      signal: controller.signal,
      method: body === undefined ? "GET" : "POST",
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${auth.access_token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (epoch !== generation) throw new ActivityRequestError(0, "Account changed")
    if (!res.ok) throw new ActivityRequestError(res.status, `Activity request failed (${res.status})`)
    const text = await res.text()
    return text ? JSON.parse(text) : null
  } catch (error) {
    if (error instanceof ActivityRequestError) throw error
    throw new ActivityRequestError(0, error instanceof Error ? error.message : "Activity request failed")
  } finally { clearTimeout(timeout) }
}

// ── consent ──────────────────────────────────────────────────────────────────
function readConsentCache(): { owner: string; enabled: boolean; version: string } | null {
  const raw = readLocal(ACTIVITY_CONSENT_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { owner?: unknown; enabled?: unknown; version?: unknown }
    if (typeof parsed?.owner !== "string" || typeof parsed.enabled !== "boolean" || typeof parsed.version !== "string") return null
    return { owner: parsed.owner, enabled: parsed.enabled, version: parsed.version }
  } catch { return null }
}

function readChoice(user: string): { value: boolean; at: number } | null {
  const raw = readLocal(CHOICE_PREFIX + user)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { value?: unknown; at?: unknown }
    if (typeof parsed?.value !== "boolean") return null
    return { value: parsed.value, at: typeof parsed.at === "number" ? parsed.at : 0 }
  } catch { return null }
}

function consentState(value: unknown): ConsentState | null {
  if (!value || typeof value !== "object") return null
  const state = value as { enabled?: unknown; consent_version?: unknown }
  if (typeof state.enabled !== "boolean" || typeof state.consent_version !== "string") return null
  return { enabled: state.enabled, consent_version: state.consent_version }
}

/**
 * Take the server's word for it — unless this device is still holding a choice
 * the server has not accepted, in which case the user's choice is the truth and
 * adopting the server value here is exactly the bug that made a failed opt-out
 * silently revert.
 */
function adoptConsent(user: string, state: ConsentState) {
  if (owner !== user || readChoice(user)) return
  const moved = state.enabled !== enabled || state.consent_version !== consentVersion
  enabled = state.enabled
  consentVersion = state.consent_version
  consentKnown = true
  lastConsentAt = Date.now()
  writeLocal(ACTIVITY_CONSENT_KEY, JSON.stringify({ owner: user, enabled, version: consentVersion }))
  if (!enabled) { preConsent = []; clearAllQueues(); forgetSession() } else alignQueue()
  if (moved) announce()
}

/** A refusal ends the session, so a later opt-in opens a new one with its own session_started. */
function forgetSession() {
  session = ""
  lastUse = 0
  try { sessionStorage.removeItem(SESSION_KEY) } catch { /* noop */ }
}

/**
 * Events queued before this device knew the consent epoch are stamped with it
 * now; events carrying a DIFFERENT epoch were recorded under a consent the user
 * has since changed, and are dropped rather than delivered under the new one.
 */
function alignQueue() {
  const before = pending.length
  pending = pending.filter((e) => !e.consent_version || e.consent_version === consentVersion)
  for (const event of pending) event.consent_version = consentVersion
  if (pending.length !== before) setHealth("Some queued usage was discarded because your sharing choice changed.")
  persist()
}

/** The PostHog copy of an event that entered the queue: the same fixed fields, nothing else. */
function mirror(event: ActivityEvent) {
  mirrorActivity(event.event_name, {
    feature: event.feature,
    outcome: event.outcome,
    ...(event.action_id ? { action_id: event.action_id } : {}),
    ...event.properties,
  })
}

/** Move the pre-consent buffer into the queue, or discard it. It is never persisted. */
function promoteBuffer() {
  const buffered = preConsent
  preConsent = []
  if (!enabled || !buffered.length) return
  for (const event of buffered) {
    if (pending.length >= QUEUE_MAX) break
    event.consent_version = consentVersion
    pending.push(event)
    mirror(event)
  }
  persist()
}

/** This tab's own queue from a previous load — the reason offline usage survives a cold start. */
function loadQueue() {
  if (!owner || !enabled || pending.length) return
  const envelope = readEnvelope(queueKey())
  if (!envelope || envelope.owner !== owner) return
  if (consentVersion && envelope.consentVersion && envelope.consentVersion !== consentVersion) { clearQueue(); return }
  pending = envelope.pending.filter(freshEnough)
}

/**
 * Other tabs' queues. A live tab's queue is LEFT ALONE even when it is empty —
 * removing it is what woke every other tab into its own preference read, which
 * turned one poll into 1+N(N-1) requests. Only a mismatched owner or consent
 * (a privacy duty), an unreadable envelope, or a queue whose tab stopped
 * beating is touched here.
 */
function sweepOtherQueues() {
  if (!owner) return
  const mine = queueKey()
  const seen = new Set(pending.map((e) => e.event_id))
  for (const key of localKeys()) {
    if (!key.startsWith(PREFIX) || key === mine) continue
    const envelope = readEnvelope(key)
    if (!envelope) { removeLocal(key); continue }
    if (envelope.owner !== owner || (consentVersion && envelope.consentVersion !== consentVersion)) { removeLocal(key); continue }
    if (Date.now() - envelope.beat < TAB_STALE_MS) continue
    // Orphaned by a closed or crashed tab: adopt its events rather than leave
    // them to expire unsent. event_id dedupe, because a duplicated tab may have
    // started from a copy of this very queue.
    if (enabled) for (const event of envelope.pending) {
      if (seen.has(event.event_id) || !freshEnough(event) || pending.length >= QUEUE_MAX) continue
      if (consentVersion && event.consent_version && event.consent_version !== consentVersion) continue
      seen.add(event.event_id)
      pending.push(event)
    }
    removeLocal(key)
  }
  persist()
}

function freshEnough(event: ActivityEvent) { return Date.parse(event.occurred_at) > Date.now() - RETAIN_MS }

export async function connectActivity(userId: string) {
  if (!activityAvailable()) return
  if (owner !== userId) {
    // A different account: erase in memory first, then on disk.
    if (owner) resetActivity()
    else { generation++; enabled = false; consentKnown = false; consentVersion = ""; pending = []; preConsent = [] }
    owner = userId
    // The last answer this device had, so an offline cold launch still records.
    const cached = readConsentCache()
    if (cached?.owner === userId) { enabled = cached.enabled; consentVersion = cached.version; consentKnown = true }
    // An unconfirmed choice outranks the cache: it is what the user asked for.
    const choice = readChoice(userId)
    if (choice) { enabled = choice.value; consentKnown = true }
    loadQueue()
    promoteBuffer()
    announce()
  }
  await refreshConsent(userId, true)
}

/**
 * One consent read, coalesced. A pending choice is retried here instead — the
 * point of the floor is that a device with nothing to say stops asking, not
 * that a withdrawal waits fifteen minutes for its next attempt.
 */
export async function refreshConsent(userId: string, force = false): Promise<void> {
  if (!activityAvailable() || owner !== userId) return
  const choice = readChoice(userId)
  if (choice) return drainChoice(userId).catch(() => { /* health already says so */ })
  if (!force && consentKnown && Date.now() - lastConsentAt < CONSENT_FLOOR_MS) return
  if (consentInFlight) return consentInFlight
  const epoch = generation
  consentInFlight = (async () => {
    try {
      // get_activity_consent, never a REST read of the preference row: the
      // consent_version string has to be byte-identical on both sides, and only
      // the server's own rendering of it is. POST with an empty body because
      // PostgREST serves an RPC over GET only for a STABLE/IMMUTABLE function.
      const state = consentState(await request("rpc/get_activity_consent", {}))
      if (epoch !== generation || owner !== userId) return
      if (!state) { setHealth("Usage sharing is unavailable. No new usage is collected."); return }
      adoptConsent(userId, state)
      promoteBuffer()
      loadQueue()
      sweepOtherQueues()
      setHealth("")
    } catch {
      if (epoch !== generation) return
      // `enabled` is NOT changed here. A failed read is not a withdrawal, and
      // turning recording off on every connectivity blip is what made offline
      // usage — the reason a seven-day queue exists — systematically missing.
      if (!consentKnown) setHealth("Usage sharing is unavailable. No new usage is collected.")
    } finally { consentInFlight = null }
  })()
  return consentInFlight
}

/**
 * The choice is on disk BEFORE the RPC and stays there until the server accepts
 * it, so a failed opt-out is not undone by the next consent read and an
 * ON-then-OFF in quick succession leaves the server OFF.
 */
export async function setActivityEnabled(value: boolean) {
  const user = owner
  if (!activityAvailable() || !user) throw new Error("Sign in to change this.")
  writeLocal(CHOICE_PREFIX + user, JSON.stringify({ value, at: Date.now() }))
  if (value) removeLocal(OPTOUT_KEY)
  else writeLocal(OPTOUT_KEY, "true")
  enabled = value
  consentKnown = true
  // Whatever was buffered was recorded before this choice existed, so it is not
  // recorded under it — in either direction.
  preConsent = []
  // Stop and erase locally BEFORE waiting for withdrawal on the server.
  if (!value) { clearAllQueues(); forgetSession() }
  announce()
  try {
    await drainChoice(user)
    setHealth("")
  } catch {
    setHealth("Could not save your choice. It is applied on this device and will retry.")
    throw new Error(health)
  }
}

/** Single-flight, and it re-reads the choice so a toggle made mid-flight is still sent. */
function drainChoice(user: string): Promise<void> {
  if (choiceInFlight) return choiceInFlight
  choiceInFlight = (async () => {
    try {
      for (;;) {
        const key = CHOICE_PREFIX + user
        const sent = readLocal(key)
        const choice = readChoice(user)
        if (!choice || owner !== user) return
        const state = consentState(await request("rpc/set_activity_enabled", { enabled: choice.value }))
        if (owner !== user) return
        // Only clear the choice we actually sent; a newer one loops round again.
        if (readLocal(key) === sent) removeLocal(key)
        if (state) adoptConsent(user, state)
        if (!readChoice(user)) { promoteBuffer(); sweepOtherQueues(); return }
      }
    } finally { choiceInFlight = null }
  })()
  return choiceInFlight
}

// ── recording ────────────────────────────────────────────────────────────────
function validProperties(properties: Record<string, string | number | boolean>): boolean {
  for (const [key, value] of Object.entries(properties)) {
    if (!PROPERTY_KEYS.has(key)) return false
    if (key === "entrypoint") { if (!ENTRYPOINTS.includes(String(value))) return false; continue }
    if (key === "item_type") { if (!ITEM_TYPES.includes(String(value))) return false; continue }
    if (key === "error_code") { if (!ERROR_CODES.includes(String(value))) return false; continue }
    if (key === "cache_hit") { if (typeof value !== "boolean") return false; continue }
    // Integers only. The server takes these as fixed-width digit strings
    // because a fractional duration_ms is 150 digits of legible free text.
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > NUMERIC_MAX[key]) return false
  }
  return true
}

/**
 * The session id lives in sessionStorage, so a reload continues the session a
 * page view started rather than opening a new one. Returns true when a NEW id
 * was minted — first use, or thirty idle minutes.
 */
function mintSession(now: number): boolean {
  if (!sessionLoaded) {
    sessionLoaded = true
    try {
      const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null") as { id?: unknown; at?: unknown }
      if (typeof stored?.id === "string" && typeof stored.at === "number") { session = stored.id; lastUse = stored.at }
    } catch { /* private mode — a per-document session is still a session */ }
  }
  const minted = !session || now - lastUse > SESSION_IDLE_MS
  if (minted) session = uuidv7()
  lastUse = now
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: session, at: now })) } catch { /* noop */ }
  return minted
}

function enqueue(name: string, feature: Feature, outcome: Outcome, properties: Record<string, string | number | boolean>, actionId: string | undefined, at: number): boolean {
  const event: ActivityEvent = {
    event_id: uuidv7(), event_name: name, feature, outcome,
    is_foreground: document.visibilityState === "visible" && document.hasFocus(),
    session_id: session, platform: "web", environment: ENVIRONMENT, app_version: APP_VERSION,
    schema_version: 1, consent_version: consentVersion, occurred_at: new Date(at).toISOString(),
    properties, ...(actionId ? { action_id: actionId } : {}),
  }
  // Consent has not answered yet. Hold it in memory — never on disk, where it
  // would outlive a refusal — and let the answer decide. Mount-effect events
  // (a deep-linked guide, the first onboarding step, an accepted invite) all
  // land in this window and were previously dropped on the floor.
  if (!consentKnown) {
    if (preConsent.length >= PRE_CONSENT_MAX) return false
    preConsent.push(event)
    return true
  }
  if (!enabled) return false
  if (pending.length >= QUEUE_MAX) { setHealth("Usage queue is full. Some new usage events cannot be stored."); return false }
  pending.push(event)
  mirror(event)
  persist()
  if (pending.length >= FLUSH_AT) void flushActivity()
  return true
}

/** Returns whether the event was taken, so a caller keeping a once-only latch can set it truthfully. */
export function recordActivity(name: string, feature: Feature, outcome: Outcome = "observed", properties: ActivityEvent["properties"] = {}, actionId?: string): boolean {
  if (!activityAvailable() || !owner || !PERMITTED.has(name)) return false
  if (!validProperties(properties)) { setHealth("An invalid usage event was blocked."); return false }
  if (consentKnown && !enabled) return false
  const now = Date.now()
  const minted = mintSession(now)
  // Every minted session opens with session_started, including the silent
  // 30-minute rotation — otherwise sessions after the first have no start and
  // the session count is a process count.
  if (minted && name !== "session_started") enqueue("session_started", "app", "observed", {}, undefined, now)
  return enqueue(name, feature, outcome, properties, actionId, now)
}

export function foregroundActivity() {
  if (typeof document === "undefined" || document.visibilityState !== "visible" || !document.hasFocus()) return
  if (Date.now() - passive < PASSIVE_MS) return
  passive = Date.now()
  recordActivity("foreground_active", "app")
}

// ── delivery ─────────────────────────────────────────────────────────────────
function idList(value: unknown): string[] { return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [] }

function expireQueue() {
  const retained = pending.filter(freshEnough)
  if (retained.length === pending.length) return
  pending = retained
  persist()
  setHealth("Some undelivered usage events expired after seven days.")
}

export async function flushActivity() {
  if (!activityAvailable() || !enabled || !owner || flushing) return
  expireQueue()
  // Nothing to send under a consent epoch we do not have: the server compares
  // consent_version as exact text and would reject the whole batch.
  if (!pending.length || !consentVersion) return
  if (Date.now() < nextAttemptAt) return
  flushing = true
  const epoch = generation, user = owner, batch = pending.slice(0, MAX_BATCH)
  /** Nothing ticks any more, so a backlog keeps draining for as long as the server keeps taking it. */
  let more = false
  try {
    const answer = await request("rpc/record_activity_batch", { events: batch }) as { accepted?: unknown; rejected?: unknown } | null
    if (epoch !== generation) return
    // BOTH lists leave the queue. A rejected event is one the server will never
    // accept, and resending it is what parked a device's whole queue behind one
    // bad row for seven days.
    const done = new Set([...idList(answer?.accepted), ...idList(answer?.rejected)])
    const before = pending.length
    pending = pending.filter((e) => !done.has(e.event_id))
    persist()
    backoff = 0
    nextAttemptAt = 0
    setDeliveryError(idList(answer?.rejected).length ? "Some usage events could not be recorded and were discarded." : "")
    const state = consentState(answer)
    if (state) adoptConsent(user, state)
    // Only while it is making progress: an answer that settles no ids must not
    // turn into a tight loop against the server.
    more = pending.length > 0 && pending.length < before
  } catch (error) {
    if (epoch !== generation) return
    const status = error instanceof ActivityRequestError ? error.status : 0
    // 401 is the exception: a token that expired between the session read and the
    // request is refreshed on the next attempt, so it backs off like a 5xx.
    if (status >= 400 && status < 500 && status !== 401) {
      // Permanent. Retrying a 4xx forever is how the queue stops moving, so the
      // batch is dropped and the consent state re-read — 42501 is also how the
      // server says the consent under this batch is no longer current.
      const dropped = new Set(batch.map((e) => e.event_id))
      pending = pending.filter((e) => !dropped.has(e.event_id))
      persist()
      setDeliveryError("Some usage could not be delivered and was discarded.")
      lastConsentAt = 0
      void refreshConsent(user, true)
    } else {
      backoff = Math.min(backoff ? backoff * 2 : BACKOFF_MIN_MS, BACKOFF_MAX_MS)
      nextAttemptAt = Date.now() + backoff
      setDeliveryError("Usage delivery is delayed; queued events will retry.")
    }
  } finally { flushing = false }
  if (more) await flushActivity()
}

/**
 * The last chance this document gets. keepalive outlives the page, but its
 * answer cannot be read — so the batch STAYS queued and the server's event_id
 * primary key is what stops a delivered batch being counted twice.
 */
export function flushActivityOnHide() {
  writeQueue(0) // release this tab's queue so a live tab can claim it
  if (!activityAvailable() || !enabled || !owner || !consentVersion || !pending.length || !lastToken) return
  try {
    void fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/record_activity_batch`, {
      method: "POST", keepalive: true,
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${lastToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ events: pending.slice(0, MAX_BATCH) }),
    }).catch(() => { /* the page is going away */ })
  } catch { /* noop */ }
}

// ── lifecycle ────────────────────────────────────────────────────────────────
export function resetActivity() {
  // In-memory FIRST: the storage sweep below can throw on its very first read
  // when site data is blocked, and leaving one account's events addressed to
  // the next one is the failure that matters.
  generation++
  owner = null
  enabled = false
  consentKnown = false
  consentVersion = ""
  pending = []
  preConsent = []
  sessionLoaded = false
  passive = 0
  lastConsentAt = 0
  lastToken = ""
  backoff = 0
  nextAttemptAt = 0
  forgetSession()
  clearAllQueues()
  removeLocal(ACTIVITY_CONSENT_KEY)
  announce()
}

/**
 * Flag-off cleanup, called at launch when the flag is OFF: a build with private
 * activity turned off must leave nothing behind from a build that had it on —
 * queues, the session, and every drift.activity.* key (consent, pending choice,
 * the optout marker, activation latches).
 */
export function cleanupActivityStorage() {
  if (activityAvailable()) return
  for (const key of localKeys()) if (key.startsWith(PREFIX) || key.startsWith(ACTIVITY_KEYS)) removeLocal(key)
  try { sessionStorage.removeItem(PREFIX); sessionStorage.removeItem(SESSION_KEY) } catch { /* noop */ }
}

/** A capture bound to the account that was signed in when it was taken. */
export function activityScope() {
  const epoch = generation
  return (...args: Parameters<typeof recordActivity>) => epoch === generation && recordActivity(...args)
}

installActivityScope(
  () => { const epoch = generation; return (name, feature, outcome, props, actionId) => epoch === generation && recordActivity(name, feature as Feature, (outcome ?? "observed") as Outcome, props, actionId) },
  // Consent unknown still counts: the event is held and the answer decides.
  () => activityAvailable() && !!owner && (!consentKnown || enabled),
)
