// Inspire — the block-pattern vocabulary, shared by the RSC that loads a row
// and the client island that tailors it.
//
// A block pattern is a real trip somebody took: an ORDER and a set of NIGHTS.
// That is the knowledge you cannot search for, and everything here exists to
// carry it faithfully from `public.inspire_trips.snapshot` to the screen and
// back out to copy-trip.
//
// DECODING POSTURE mirrors the iOS InspireService: every field that is not
// structurally required coerces to null (or an empty array) rather than
// throwing. The corpus is 38 hand-curated rows; one null `name` on one
// destination must not blank a page, and an LLM-authored plan with one bad row
// must not blank the itinerary. Strict parsing against remote JSON is how a
// missing key turns into an empty screen with no error anywhere.

// ---------------------------------------------------------------------------
// Coercion
// ---------------------------------------------------------------------------

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function str(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim()
    return t.length ? t : null
  }
  return null
}

/** jsonb numbers arrive as numbers, but a hand-edited snapshot can carry "3". */
function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function int(v: unknown, fallback: number): number {
  const n = num(v)
  return n === null ? fallback : Math.round(n)
}

function strArray(v: unknown): string[] {
  return asArray(v)
    .map(str)
    .filter((s): s is string => s !== null)
}

// ---------------------------------------------------------------------------
// Snapshot model
// ---------------------------------------------------------------------------

/** One stop in the chain. `day_offset` is days from the trip's own day 0 — the
 *  snapshot has no dates at all, which is why nothing here computes one. */
export interface InspireDestination {
  ref: string
  name: string | null
  city: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  day_offset: number
  nights: number
  /** Same-host photo URL (Wikimedia Commons / Unsplash). 90 of the 102
   *  destinations carry one. */
  photo: string | null
  /** Kept verbatim as a STRING. It is echoed back to copy-trip inside a
   *  tailored plan, where it is the only handle proving a plan row is the
   *  curated row it claims to be — and the snapshot stores it lower case. */
  source_step_id: string | null
}

/** One thing inside a destination — a stay, a spot, a meal, a note. */
export interface InspireItem {
  destination_ref: string | null
  /** Raw string. The four-case enum a client might reach for silently drops
   *  food, restaurant, note and time_block — a quarter of every itinerary. */
  step_type: string
  title: string | null
  location_name: string | null
  nights: number
  city: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  day_offset: number
  /** "HH:MM" or null. A wall clock, never an instant — no zone is implied and
   *  nothing may turn it into one. */
  time: string | null
  duration_minutes: number | null
  /** The voice of the thing. 519 of the 520 items carry one, ~77 characters
   *  each, and it is the reason the guide reads like a person wrote it. */
  notes: string | null
  place_category: string | null
  photo: string | null
  source_step_id: string | null
}

export interface InspireSnapshot {
  title: string
  day_count: number
  cities: string[]
  countries: string[]
  destinations: InspireDestination[]
  items: InspireItem[]
}

export function parseDestination(raw: unknown): InspireDestination {
  const r = asRecord(raw)
  return {
    ref: str(r.ref) ?? "",
    name: str(r.name),
    city: str(r.city),
    country: str(r.country),
    latitude: num(r.latitude),
    longitude: num(r.longitude),
    day_offset: int(r.day_offset, 0),
    nights: int(r.nights, 0),
    photo: str(r.photo),
    source_step_id: str(r.source_step_id),
  }
}

export function parseItem(raw: unknown): InspireItem {
  const r = asRecord(raw)
  const stepType = str(r.step_type) ?? ""
  const rawNights = num(r.nights)
  const time = str(r.time)
  return {
    destination_ref: str(r.destination_ref),
    step_type: stepType,
    title: str(r.title),
    location_name: str(r.location_name),
    // A stay's nights must be >= 1 — the 86 prod stay rows sitting at 0 are why
    // copy-trip clamps them server-side. Floor here too or a hotel reads
    // "0 nights".
    nights: stepType === "stay" ? Math.max(1, rawNights ?? 1) : rawNights ?? 0,
    city: str(r.city),
    country: str(r.country),
    latitude: num(r.latitude),
    longitude: num(r.longitude),
    day_offset: int(r.day_offset, 0),
    // Only ever printed back exactly as stored. "19:00" is 19:00 wherever you
    // read it — parsing it into a Date would zone-shift the guide.
    time: time && /^\d{1,2}:\d{2}/.test(time) ? time.slice(0, 5) : null,
    duration_minutes: num(r.duration_minutes),
    notes: str(r.notes),
    place_category: str(r.place_category),
    photo: str(r.photo),
    source_step_id: str(r.source_step_id),
  }
}

export function parseSnapshot(raw: unknown): InspireSnapshot {
  const r = asRecord(raw)
  return {
    title: str(r.title) ?? "",
    day_count: int(r.day_count, 0),
    cities: strArray(r.cities),
    countries: strArray(r.countries),
    destinations: asArray(r.destinations).map(parseDestination),
    items: asArray(r.items).map(parseItem),
  }
}

/** One row of `public.inspire_trips`, snapshot already parsed. */
export interface InspirePattern {
  tripId: string
  /** The PUBLIC handle for this pattern — the `/i/<slug>` guide a stranger can
   *  read with no account. Null when the row predates slugs, which is the only
   *  reason a share control may be absent: `/app/inspire/<tripId>` is behind the
   *  auth gate, so sharing it hands the recipient a login wall instead of a
   *  trip. */
  slug: string | null
  tags: string[]
  /** Months 1…12 the trip is actually good. Editorial, and used only to RANK —
   *  never to hide. */
  bestMonths: number[]
  blurb: string | null
  heroUrl: string | null
  authorHandle: string | null
  authorAvatarUrl: string | null
  snapshot: InspireSnapshot
}

/** False when the snapshot has nothing a page could draw. */
export function hasUsableSnapshot(s: InspireSnapshot): boolean {
  return s.title.length > 0 && s.day_count > 0 && s.destinations.length > 0
}

// ---------------------------------------------------------------------------
// The public guide — /i/<slug>
// ---------------------------------------------------------------------------

/** Where a share link points. Hard-coded rather than read off `location`: the
 *  app also runs on localhost and on Vercel preview hosts, and a link copied
 *  there is a link nobody else can open. */
export const PUBLIC_ORIGIN = "https://drift.after-hours.app"

/** The one URL a pattern may be shared as. `/app/inspire/<tripId>` is inside
 *  the auth gate — sending it is sending a login wall. */
export function guideUrl(slug: string): string {
  return `${PUBLIC_ORIGIN}/i/${slug}`
}

/** Slugs are generated lowercase-kebab (all 38 live rows match, longest 37
 *  chars). Anything else cannot be a row, so it is rejected before a round trip
 *  — and before it is ever written into a cookie or a redirect path. */
const SLUG = /^[a-z0-9][a-z0-9-]{0,118}[a-z0-9]$/

export function isGuideSlug(v: string | null | undefined): v is string {
  return typeof v === "string" && SLUG.test(v)
}

/**
 * The guide somebody was reading when they hit the sign-in wall.
 *
 * IT CANNOT RIDE THE REDIRECT. `/app/login` builds `redirectTo` with no query
 * params on purpose — Supabase matches redirect URLs against an allow-list and a
 * `?next=` variant can fail the match, silently falling back to the Site URL
 * (that was the "stuck Google login" bug) — and the magic-link email template
 * hardcodes `next=/app`, so the callback's `next` is decided before we ever see
 * it. The invite flow hit this exact wall and solved it with a cookie; this is
 * the same mechanism, and it works identically for magic link and OAuth because
 * it depends on nothing the auth provider round-trips for us.
 *
 * Set by /i/<slug>/start, redeemed and cleared by the /app landing.
 */
export const GUIDE_COOKIE = "drift_guide"

/** Two hours — long enough to go and find the confirmation email, short enough
 *  that a stale one is not still hijacking the /app landing tomorrow. */
export const GUIDE_COOKIE_MAX_AGE = 60 * 60 * 2

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/** The seven shape tags, in shelf order. The names are the copy — "Into the
 *  wild" is what the rail says, `wild` is what the row stores. */
export const CATEGORY_ORDER: ReadonlyArray<{ slug: string; name: string }> = [
  { slug: "wild", name: "Into the wild" },
  { slug: "stones", name: "Old stones" },
  { slug: "drive", name: "The long drive" },
  { slug: "eat", name: "Eat your way through" },
  { slug: "islands", name: "Slow islands" },
  { slug: "high", name: "Up high" },
  { slug: "stay", name: "Stay put" },
]

export function categoryName(slug: string): string | null {
  return CATEGORY_ORDER.find((c) => c.slug === slug)?.name ?? null
}

/** The categories a loaded corpus can actually fill, each with its count. A
 *  category with zero trips is not emitted — a tile that opens an empty shelf
 *  is worse than one fewer tile. */
export function categoriesWithCounts(
  patterns: ReadonlyArray<{ tags: string[] }>,
): Array<{ slug: string; name: string; count: number }> {
  return CATEGORY_ORDER.map((c) => ({
    ...c,
    count: patterns.reduce((n, p) => n + (p.tags.includes(c.slug) ? 1 : 0), 0),
  })).filter((c) => c.count > 0)
}

// ---------------------------------------------------------------------------
// Days and months — everything here is a UTC calendar day, never an instant
// ---------------------------------------------------------------------------

export type DayStr = string // "yyyy-MM-dd"

export interface YearMonth {
  year: number
  month: number // 1…12
}

/** UTC-PINNED ON PURPOSE. Every date this feature renders is a calendar day —
 *  either one the traveller picked or one the SERVER computed and echoed back
 *  as a UTC-midnight instant. Formatting those in the browser zone renders the
 *  previous day for every user west of UTC, so the tailor screen would promise
 *  "back Thu 14 Oct" and the receipt, one click later, would say the 13th. */
export function formatDay(day: DayStr | null, opts: Intl.DateTimeFormatOptions): string {
  if (!day) return ""
  const [y, m, d] = day.slice(0, 10).split("-").map(Number)
  if (!y || !m || !d) return ""
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" })
}

/** "…T00:00:00Z" or a bare "yyyy-MM-dd" → the calendar day it names. */
export function dayOf(raw: string | null | undefined): DayStr | null {
  if (!raw) return null
  const d = raw.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
}

export function addDays(day: DayStr, n: number): DayStr {
  const [y, m, d] = day.split("-").map(Number)
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86_400_000)
  return [
    t.getUTCFullYear(),
    String(t.getUTCMonth() + 1).padStart(2, "0"),
    String(t.getUTCDate()).padStart(2, "0"),
  ].join("-")
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export function monthShort(m: number): string {
  return MONTH_SHORT[Math.min(12, Math.max(1, m)) - 1]
}

export function monthLong(m: number): string {
  return MONTH_LONG[Math.min(12, Math.max(1, m)) - 1]
}

/** The six months the rail offers, starting with NEXT month.
 *
 *  "What month is it now" is the wrong question. YOU CANNOT LEAVE TODAY — by
 *  the time a trip is planned, booked and paid for, the current month is gone.
 *  So in late August the rail leads with September, one to six months out. */
export function monthsYouCouldGo(today: DayStr): YearMonth[] {
  const [y, m] = today.split("-").map(Number)
  if (!y || !m) return []
  const out: YearMonth[] = []
  for (let i = 1; i <= 6; i++) {
    const idx = m - 1 + i
    out.push({ year: y + Math.floor(idx / 12), month: (idx % 12) + 1 })
  }
  return out
}

export function firstOfMonth(ym: YearMonth): DayStr {
  return `${ym.year}-${String(ym.month).padStart(2, "0")}-01`
}

export function monthOf(day: DayStr): YearMonth {
  const [y, m] = day.split("-").map(Number)
  return { year: y, month: m }
}

/** "2027-10" — what tailor-trip wants. Built from the numeric fields rather
 *  than through a formatter, so no calendar can re-resolve them. */
export function monthKey(ym: YearMonth): string {
  return `${String(ym.year).padStart(4, "0")}-${String(ym.month).padStart(2, "0")}`
}

/** "BEST NOV – MAR". Season only RANKS a trip, it never hides one — so an
 *  out-of-season pattern still shows, with its window on its face. */
export function bestWindowLabel(months: number[]): string | null {
  const set = [...new Set(months.filter((m) => m >= 1 && m <= 12))].sort((a, b) => a - b)
  if (!set.length) return null
  if (set.length === 12) return "GOOD ALL YEAR"
  // Longest contiguous run, wrapping December → January.
  let bestStart = set[0]
  let bestLen = 0
  for (const start of set) {
    // A run only starts where the previous month is NOT in the set.
    const prev = start === 1 ? 12 : start - 1
    if (set.includes(prev)) continue
    let len = 0
    let cur = start
    while (set.includes(cur) && len < 12) {
      len++
      cur = cur === 12 ? 1 : cur + 1
    }
    if (len > bestLen) {
      bestLen = len
      bestStart = start
    }
  }
  if (bestLen <= 1) return `BEST ${monthShort(bestStart).toUpperCase()}`
  const end = ((bestStart - 1 + bestLen - 1) % 12) + 1
  return `BEST ${monthShort(bestStart).toUpperCase()} – ${monthShort(end).toUpperCase()}`
}

// ---------------------------------------------------------------------------
// Photos — SAME-HOST resizing only
// ---------------------------------------------------------------------------

/**
 * Ask the photo's OWN host for a smaller copy. Never our optimizer.
 *
 * Every photo in this corpus is Wikimedia Commons (386 of them) or Unsplash
 * (33). Both hosts resize on request — `Special:FilePath?width=`, and
 * Unsplash's `w=`/`q=` — so a 96px row thumbnail costs 96px of bytes without
 * anything being re-hosted. Routing these through Vercel's image optimizer is
 * the one thing OptimizedImg's allow-list exists to prevent (it would cache and
 * re-serve the bytes, which both hosts' terms forbid), so the allow-list is
 * deliberately left alone and the width is negotiated here instead.
 *
 * An unrecognised host is returned untouched rather than dropped.
 */
export function photoAt(url: string | null | undefined, width: number): string | null {
  if (!url) return null
  const w = Math.max(48, Math.round(width))
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return url
  }
  if (u.hostname.endsWith("wikimedia.org") || u.hostname.endsWith("wikipedia.org")) {
    if (!u.pathname.includes("/Special:FilePath/")) return url
    u.searchParams.set("width", String(w))
    return u.toString()
  }
  if (u.hostname.endsWith("unsplash.com")) {
    u.searchParams.set("w", String(w))
    u.searchParams.set("q", "70")
    u.searchParams.set("auto", "format")
    u.searchParams.set("fit", "crop")
    return u.toString()
  }
  return url
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/** Trim, then collapse every run of whitespace to one space.
 *
 *  Names reach the receipt from two provenances: the server's `stops[].name`
 *  has been through its own whitespace collapsing, the snapshot's has not.
 *  Comparing them raw printed "Wadi  Rum dropped" above a list containing
 *  Wadi Rum. */
export function normName(s: string | null | undefined): string {
  return (s ?? "").trim().replace(/\s+/g, " ")
}

// ---------------------------------------------------------------------------
// The shape, live
// ---------------------------------------------------------------------------

export interface ShapeRow {
  id: string
  name: string
  nights: number
  was: number | null
  dropped: boolean
}

/** A purely arithmetic fit, rendered INSTANTLY so the shape under the dial is
 *  never blank while the server thinks.
 *
 *  Shortens from the shortest stop up and never touches the longest — the same
 *  instinct the server is asked to apply, so the two do not visibly disagree
 *  when the real answer lands. */
export function localFit(destinations: InspireDestination[], days: number): ShapeRow[] {
  const nights = destinations.map((d) => Math.max(0, d.nights))
  const target = Math.max(0, days - 1)
  const dropped = new Set<number>()
  const sum = () => nights.reduce((a, b) => a + b, 0)
  const indices = () => nights.map((_, i) => i)

  let guard = 0
  while (sum() > target && guard++ < 2000) {
    const order = indices().sort((a, b) => nights[a] - nights[b])
    const i = order.find((j) => !dropped.has(j) && nights[j] > 0)
    if (i === undefined) break
    if (nights[i] === 1) {
      dropped.add(i)
      nights[i] = 0
    } else {
      nights[i] -= 1
      if (nights[i] === 0) dropped.add(i)
    }
  }

  let k = 0
  while (sum() < target && nights.length > 0) {
    const order = indices().sort((a, b) => nights[b] - nights[a])
    const idx = order[k % nights.length]
    if (!dropped.has(idx)) nights[idx] += 1
    k++
    if (k > 400) break
  }

  return destinations.map((d, i) => ({
    id: d.ref || `d${i + 1}`,
    name: d.name ?? "—",
    nights: nights[i],
    was: d.nights,
    dropped: dropped.has(i),
  }))
}

export function nightsWord(n: number): string {
  return n === 1 ? "1 night" : `${n} nights`
}

// ---------------------------------------------------------------------------
// Tailoring — the ALTERATION half. Nothing here writes a row.
// ---------------------------------------------------------------------------

export interface TailoredDropped {
  title: string | null
  reason: string | null
}

export interface TailoredPlan {
  day_count: number | null
  destinations: InspireDestination[]
  items: InspireItem[]
  /** What the TAILORING cut. A sibling of destinations/items inside `plan`,
   *  which is where tailor-trip puts it — unlike `reason`/`summary`. Distinct
   *  from the COPY's `dropped`, which is what the writer refused. */
  dropped: TailoredDropped[]
}

export interface TailorResult {
  /** The plan EXACTLY as it arrived, to be handed to copy-trip verbatim. Every
   *  row is checked there against the snapshot it claims to have come from, and
   *  those checks fail CLOSED — they drop the row and write the untailored
   *  trip, which looks exactly like the feature working. Re-serialising a
   *  parsed copy would be a second naming convention; this is the first. */
  rawPlan: unknown
  plan: TailoredPlan
  /** One sentence naming what was protected and what went. Renders above the
   *  button as the justification for the alteration. Never empty. */
  reason: string
  summary: string
  tailored: boolean
  /** True when the tailoring could not run at all and the pattern came back
   *  untouched in its place. */
  degraded: boolean
}

export function parsePlan(raw: unknown): TailoredPlan {
  const r = asRecord(raw)
  return {
    day_count: num(r.day_count) === null ? null : int(r.day_count, 0),
    destinations: asArray(r.destinations).map(parseDestination),
    items: asArray(r.items).map(parseItem),
    dropped: asArray(r.dropped).map((d) => {
      const x = asRecord(d)
      return { title: str(x.title), reason: str(x.reason) }
    }),
  }
}

export function parseTailorResponse(json: unknown): TailorResult | null {
  const r = asRecord(json)
  const plan = parsePlan(r.plan)
  // A plan with no stops is not a shorter trip, it is no trip. tailor-trip
  // guards this itself, so reaching here means the caller is better off with
  // the pattern it already has.
  if (!plan.destinations.length) return null
  return {
    rawPlan: r.plan,
    plan,
    reason: str(r.reason) ?? "This is the trip in the order it was actually travelled.",
    summary: str(r.summary) ?? "Same route, same order — fitted to your dates.",
    tailored: r.tailored === true,
    degraded: r.degraded === true,
  }
}

/** Every input that changes the answer. Changing any of them re-tailors. */
export interface Measurements {
  days: number
  month: YearMonth
  pace: "settle" | "balanced" | "cover_ground"
  who: "just_me" | "two" | "kids" | "group"
  cameFor: string | null
}

export function adultsFor(who: Measurements["who"]): number {
  return who === "two" ? 2 : who === "kids" ? 2 : who === "group" ? 4 : 1
}

export function childrenFor(who: Measurements["who"]): number {
  return who === "kids" ? 2 : 0
}

// ---------------------------------------------------------------------------
// The copy — the one writer
// ---------------------------------------------------------------------------

export interface CopiedStop {
  id: string
  name: string
  city: string | null
  country: string | null
  /** A bare "yyyy-MM-dd" the server computed. */
  date: DayStr | null
  nights: number
  itemCount: number
}

export interface CopiedTrip {
  id: string
  title: string
  startDay: DayStr
  endDay: DayStr | null
  cities: string[]
  countries: string[]
  stops: CopiedStop[]
  /** What the WRITER refused, and why — including the one entry that matters
   *  most: a tailored plan that failed validation, where the trip actually
   *  written is the curated original. That is not an error server-side, so this
   *  list is the only signal it happened. */
  dropped: Array<{ title: string; reason: string }>
  destinationCount: number
  itemCount: number
  /** The trips row commits before its steps, so a partial copy is a real state
   *  and the receipt has to say so rather than present the trip as complete. */
  isPartial: boolean
}

/** True when the itinerary written is the curated original rather than the
 *  tailored plan that was sent. */
export function tailoringCollapsed(copied: CopiedTrip): boolean {
  return copied.dropped.some((d) => d.title === "tailored plan")
}

export function parseCopyResponse(json: unknown, fallbackStart: DayStr): CopiedTrip | null {
  const r = asRecord(json)
  const id = str(r.trip_id) ?? str(r.id)
  if (!id) return null
  const stopsRaw = asArray(r.stops).length ? asArray(r.stops) : asArray(r.destinations)
  return {
    id,
    title: str(r.title) ?? "Trip",
    startDay: dayOf(str(r.start_date)) ?? fallbackStart,
    endDay: dayOf(str(r.end_date)),
    cities: strArray(r.cities),
    countries: strArray(r.countries),
    stops: stopsRaw
      .map((row): CopiedStop | null => {
        const s = asRecord(row)
        const sid = str(s.id)
        if (!sid) return null
        return {
          id: sid,
          name: str(s.name) ?? str(s.title) ?? str(s.location_name) ?? "Stop",
          city: str(s.city),
          country: str(s.country),
          date: dayOf(str(s.date)),
          nights: int(s.nights, 0),
          itemCount: int(s.item_count, 0),
        }
      })
      .filter((s): s is CopiedStop => s !== null),
    dropped: asArray(r.dropped)
      .map((row) => {
        const d = asRecord(row)
        const reason = str(d.reason)
        if (!reason) return null
        return { title: str(d.title) ?? "This stop", reason }
      })
      .filter((d): d is { title: string; reason: string } => d !== null),
    destinationCount: int(asRecord(r.counts).destinations, stopsRaw.length),
    itemCount: int(asRecord(r.counts).items, 0),
    // `ok:false` WITH a trip_id is the partial state whether or not the flag
    // came with it.
    isPartial: r.partial === true || r.ok === false,
  }
}

/** Lowercase v4 uuid. `crypto.randomUUID` needs a secure context, and an
 *  insecure origin must degrade to a different id rather than a thrown error
 *  in the middle of a copy. */
export function mintUuid(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === "function") return c.randomUUID().toLowerCase()
  const b = new Uint8Array(16)
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("")
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** The identity of a copy ATTEMPT — the idempotency key's key.
 *
 *  The PLAN is part of it, not just the source and the date. Moving the day
 *  dial re-tailors without changing either of those, so a key built from them
 *  alone would make a copy of a DIFFERENT plan reuse the id of one that already
 *  landed: the 6-day copy times out, the traveller drags to 8 and clicks again,
 *  copy-trip answers the duplicate id with the trip already there, and they are
 *  handed the 6-day trip as a success with nothing explaining why. */
export function attemptKey(
  sourceTripId: string,
  startDay: DayStr,
  title: string | null,
  plan: TailoredPlan | null,
): string {
  const planKey = plan
    ? `${plan.day_count ?? 0}|${plan.destinations
        .map((d) => d.ref)
        .sort()
        .join(",")}|${plan.items.length}`
    : "none"
  return `${sourceTripId.toLowerCase()}|${startDay}|${title ?? ""}|${planKey}`
}

/** Every case carries a finished sentence. The user never reads a raw failure
 *  string. */
export function copyErrorMessage(status: number | null): string {
  if (status === null) return "Drift couldn't reach the server. Check your connection and try again."
  if (status === 401 || status === 403) return "Your session expired. Sign in again and try once more."
  if (status === 404 || status === 410) return "This trip isn't available to copy any more."
  if (status === 429) return "Drift is busy right now. Try again in a moment."
  if (status >= 500) {
    return "Drift couldn't save this trip just now. Nothing was added to your trips — try again in a moment."
  }
  return "Drift couldn't copy this trip. Nothing was saved to your trips."
}

/** Whether a failed attempt may have written a row anyway. The id stays
 *  reserved for those, so a retry replays the SAME copy instead of writing a
 *  second trip. Every 4xx is pre-write, so those release it. */
export function mayHaveLanded(status: number | null): boolean {
  return status === null || status >= 500
}

/**
 * Trip ids reserved for copies that may already have landed server-side.
 *
 * MODULE SCOPE ON PURPOSE. This exists for exactly one path: a copy whose
 * request failed *after* copy-trip committed the trips row. Reusing the id on
 * the retry is what lets the function recognise the replay — a 23505 on
 * trips.id means "this same copy already landed", and it answers with the trip
 * that is already there. Holding the map in component state would destroy it at
 * the one moment it matters, because the panel unmounts as soon as the user
 * dismisses the failure they were just shown; the retry would then mint a fresh
 * id and they would own two identical trips.
 *
 * Keyed by `attemptKey` — source, start day AND plan — so a copy of a DIFFERENT
 * plan never inherits a reservation made for another one.
 */
export const RESERVED_TRIP_IDS = new Map<string, string>()
