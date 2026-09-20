// Ask-Drift trip chat — shapes + browser SSE client. Ports the Swift
// DriftChatSemanticService workarounds: manual \n\n frame split with CRLF
// normalization, a 12s first-token watchdog that aborts to a blocking retry,
// and a non-streaming fallback decoding the identical ChatAnswer.
//
// Calls flow through a same-origin Next proxy (/api/drift/ask) that attaches the
// user's Supabase access token server-side — so the token never touches JS and
// there's no CORS dependency on the edge function. (Accept-Encoding: identity is
// a forbidden header in browser fetch; the proxy sets it upstream instead.)

import type { PlanningMode } from "./chatPlanning"
import type { ChatItinerary } from "./generalChat"

export interface Turn {
  role: string
  text: string
}

export interface ProposedOp {
  op: string // always "create_step"
  type: string // spot | activity | food | stay
  title: string
  destination_ref: string | null
  date: string | null // "yyyy-MM-dd"
  time: string | null // "HH:MM"
  duration_minutes: number | null
  notes: string | null
}

export interface ChatCard {
  title: string
  subtitle: string
  body: string
  chips: string[]
  place_query: string
  map_query: string
  expected_name?: string | null
  locality?: string | null
  proposed_op?: ProposedOp | null
}

/** One place on a planned day, as ask-drift-chat sends it. */
export interface AskItineraryPlace {
  name: string
  why: string
  place_query: string
  type: "spot" | "activity" | "food" | "stay"
  time: string | null // "HH:MM"
}

export interface AskItineraryDay {
  title: string
  date: string | null // "yyyy-MM-dd", already clamped to the trip server-side
  destination_ref: string | null
  places: AskItineraryPlace[]
}

/** A day-by-day plan drafted in a trip chat. null for anything that is not one. */
export interface AskItinerary {
  title: string
  days: AskItineraryDay[]
}

export interface ChatAnswer {
  assistant_text: string
  title: string
  subtitle: string
  mode: "answer_only" | "answer_with_cards" | "clarification"
  is_clarification?: boolean
  cards: ChatCard[]
  followups: string[]
  reply_chips?: string[]
  /** Newer ask-drift-chat only. Absent on an older deploy — always optional. */
  itinerary?: AskItinerary | null
}

const ITINERARY_TYPES = new Set(["spot", "activity", "food", "stay"])
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "")

/**
 * One day of a plan, shaped into something renderable or null.
 *
 * Shared by the final payload's `itinerary.days` and the `day` frames that
 * stream ahead of it — the same day must read identically whichever way it
 * arrived, and one reader is how that stays true.
 */
export function normalizeItineraryDay(raw: unknown): AskItineraryDay | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const d = raw as Record<string, unknown>
  const places: AskItineraryPlace[] = (Array.isArray(d.places) ? d.places : []).flatMap((rp) => {
    if (!rp || typeof rp !== "object") return []
    const p = rp as Record<string, unknown>
    const name = str(p.name)
    if (!name) return []
    const type = str(p.type)
    const time = str(p.time)
    return [
      {
        name,
        why: str(p.why),
        place_query: str(p.place_query) || name,
        type: (ITINERARY_TYPES.has(type) ? type : "spot") as AskItineraryPlace["type"],
        time: /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : null,
      },
    ]
  })
  if (!places.length) return null
  const date = str(d.date)
  return {
    title: str(d.title),
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    destination_ref: str(d.destination_ref) || null,
    places,
  }
}

/**
 * The `itinerary` field, shaped into something renderable or null.
 *
 * TOLERANT, like coerceItinerary in generalChat.ts: this is model output that
 * crossed a JSON boundary, and the backend that sends it may not be deployed.
 * A place without a name is dropped, a day without places is dropped, a plan
 * without days is null — and a bad date, type or time degrades that one field
 * rather than discarding the plan.
 */
export function normalizeItinerary(raw: unknown): AskItinerary | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const days: AskItineraryDay[] = (Array.isArray(o.days) ? o.days : []).flatMap((rd) => {
    const day = normalizeItineraryDay(rd)
    return day ? [day] : []
  })
  if (!days.length) return null
  return { title: str(o.title), days }
}

/** One `day` frame: a finished day and where it sits in the final plan. */
export interface StreamedDay {
  /** 0-based position in the final payload's `itinerary.days`. */
  index: number
  day: AskItineraryDay
}

/** A `day` frame's data, or null when there is nothing to draw from it. */
export function normalizeStreamedDay(raw: unknown): StreamedDay | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const index = o.index
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0) return null
  const day = normalizeItineraryDay(o.day)
  return day ? { index, day } : null
}

/**
 * The days that can be drawn so far: the run from 0 with no gap in it.
 *
 * A day is drawn under the number of its POSITION ("Day 3" is the third row),
 * so a day held back by a lost frame would renumber every day after it and
 * then renumber them again when the payload landed. Waiting for the gap to
 * fill costs nothing — the frames arrive in order — and never prints a day
 * under the wrong number.
 */
export function orderedStreamedDays(byIndex: Record<number, AskItineraryDay>): AskItineraryDay[] {
  const days: AskItineraryDay[] = []
  for (let i = 0; byIndex[i]; i++) days.push(byIndex[i])
  return days
}

/**
 * ask-drift-chat's plan, in the shape ItineraryCard draws.
 *
 * `destination` is the card's place-resolution bias: a place on a day that
 * names no city is looked up against it, so what it says decides which Kyoto
 * the photo comes from. It is read off the first day that names one, and a
 * streamed plan is handed to this a prefix at a time — which is the right way
 * round, and the reason is worth writing down, because it looks wrong.
 *
 * THE PREFIX ANSWERS WHAT THE WHOLE PLAN WOULD, THE MOMENT IT CAN. The first
 * day naming a city among the days that have landed IS the first one in the
 * finished plan — days arrive in order — so every day that lands after a city
 * has been named resolves against exactly what the payload will say. Only the
 * days ahead of the first named city fall back, and for those the answer is
 * not yet in the plan at all: no reading of a partial plan can produce it.
 *
 * So do NOT "pin" this to the fallback while the plan grows to stop it moving.
 * It does not spare those early days — they take the fallback either way — and
 * it throws away the answer for every later day that does not name its own
 * city, biasing them to the trip instead of to the city the plan just named.
 * See the pinning tests in chatStreamedDays.test.ts.
 */
export function toCardItinerary(
  itin: AskItinerary,
  opts: { tripTitle: string; country: string | null; fallbackDestination: string | null }
): ChatItinerary {
  const destination =
    itin.days.find((d) => d.destination_ref)?.destination_ref ??
    opts.fallbackDestination ??
    opts.tripTitle
  return {
    destination,
    country: opts.country,
    title: itin.title || `${opts.tripTitle} plan`,
    startDate: itin.days[0]?.date ?? null,
    days: itin.days.map((d) => ({
      title: d.title,
      date: d.date,
      destinationRef: d.destination_ref,
      places: d.places.map((p) => ({
        name: p.name,
        why: p.why,
        query: p.place_query,
        type: p.type,
        time: p.time,
      })),
    })),
  }
}

/** Arrays where the renderer expects arrays, and `itinerary` normalized. */
export function normalizeAnswer(raw: unknown): ChatAnswer {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  return {
    ...(o as unknown as ChatAnswer),
    assistant_text: typeof o.assistant_text === "string" ? o.assistant_text : "",
    cards: Array.isArray(o.cards) ? (o.cards as ChatCard[]) : [],
    followups: Array.isArray(o.followups) ? (o.followups as string[]) : [],
    reply_chips: Array.isArray(o.reply_chips) ? (o.reply_chips as string[]) : [],
    itinerary: normalizeItinerary(o.itinerary),
  }
}

export interface AskRequestBody {
  tripId: string
  message: string
  conversation: Turn[]
  image?: string | null
  /** How this chat plans. The function reads it as `planning_mode`; anything
   *  that is not "guided" — including a missing field — is quick, so an older
   *  deployment simply drafts as it always did. */
  planningMode?: PlanningMode
}

export interface AskHandlers {
  onStatus?: (state: string) => void
  onDelta?: (delta: string) => void
  /** One finished itinerary day, streamed ahead of the payload it will also
   *  arrive in. Always after the prose (the answer schema puts `itinerary`
   *  last), and never on the blocking path — a caller that leaves this out
   *  simply waits for the payload, as every build in the field does. */
  onDay?: (index: number, day: AskItineraryDay) => void
  onPayload?: (answer: ChatAnswer) => void
  onError?: (message: string) => void
}

const ASK_URL = "/api/drift/ask"
// Silence window: abort → blocking retry only after this long with NO stream
// activity at all (re-armed on every chunk). Generous enough that a reasoning
// think doesn't trip it even if heartbeats are buffered.
const FIRST_TOKEN_TIMEOUT_MS = 18_000

/**
 * Run one Ask-Drift turn: stream via SSE, and if no first token lands within
 * 12s (or the stream errors), transparently fall back to the blocking call.
 * Resolves when the turn is fully handled (payload delivered or error reported).
 */
export async function askDrift(
  body: AskRequestBody,
  handlers: AskHandlers,
  /** Abort this turn. The composer's STOP button owns one of these. */
  signal?: AbortSignal
): Promise<void> {
  try {
    await streamAsk(body, handlers, signal)
  } catch {
    // A USER abort must stop here. Every other failure below falls through to
    // the blocking call, and doing that after a stop would fire a SECOND
    // request — the opposite of what the button says. The watchdog's own abort
    // is not the caller's signal, so it still gets its retry.
    if (signal?.aborted) return
    // Watchdog abort (code -5 analog) or transport error → blocking retry.
    try {
      const answer = await blockingAsk(body, signal)
      handlers.onPayload?.(answer)
      return
    } catch (e) {
      // A model outage is not something to report to the user. ask-drift-chat
      // now answers 503 model_unavailable instead of the canned prose it used
      // to invent, so this is reachable where it never used to be — retry once,
      // then hand back a clarifying question as a normal turn.
      if (signal?.aborted) return
      if (e instanceof AskError && e.code === "model_unavailable") {
        try {
          const answer = await blockingAsk(body, signal)
          handlers.onPayload?.(answer)
          return
        } catch {
          handlers.onPayload?.(clarifyingAnswer(clarifyingReply(body.message)))
          return
        }
      }
      if (signal?.aborted) return
      handlers.onError?.(
        e instanceof Error ? e.message : "Couldn't reach Drift. Try again."
      )
    }
  }
}

/** A clarifying question shaped as a normal chat answer, so it renders as one. */
function clarifyingAnswer(text: string): ChatAnswer {
  return {
    assistant_text: text,
    title: "",
    subtitle: "",
    mode: "clarification",
    is_clarification: true,
    cards: [],
    followups: [],
    reply_chips: [],
  } as unknown as ChatAnswer
}

async function streamAsk(
  body: AskRequestBody,
  handlers: AskHandlers,
  signal?: AbortSignal
): Promise<void> {
  const controller = new AbortController()
  // The caller's signal and the watchdog both feed the SAME fetch controller,
  // so a stop cancels the in-flight request rather than merely hiding it: the
  // connection closes and the edge function stops being paid for.
  const relayAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener("abort", relayAbort, { once: true })
  }
  let gotFirstToken = false

  // Watchdog = SILENCE detector, not a time-to-first-token deadline. A reasoning
  // turn can legitimately think >12s before the first content token; the edge fn
  // sends ~5s heartbeats meanwhile. So we (re)arm the timer on ANY stream
  // activity and only abort → blocking retry when the stream goes truly SILENT
  // for the window. This kills the "slow think → premature abort → blocking
  // retry → doubled ~15-25s latency" anomaly.
  let watchdog: ReturnType<typeof setTimeout> | null = null
  const armWatchdog = () => {
    if (watchdog) clearTimeout(watchdog)
    watchdog = setTimeout(() => {
      if (!gotFirstToken) controller.abort()
    }, FIRST_TOKEN_TIMEOUT_MS)
  }
  armWatchdog()

  try {
    const res = await fetch(ASK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ ...body, stream: true }),
      signal: controller.signal,
    })
    if (!res.ok || !res.body) {
      throw new Error(`ask stream failed: ${res.status}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    // Split frames on \n\n ourselves (CRLF normalized to LF first), joining
    // multiple data: lines with \n — matching the Swift byte-buffer parser.
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      // Any bytes (a heartbeat, a partial frame) mean the stream is alive → the
      // silence window resets. Once content lands the watchdog is cleared for good.
      if (!gotFirstToken) armWatchdog()
      buffer += decoder.decode(value, { stream: true }).replace(/\r/g, "")
      let idx: number
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        if (handleFrame(frame, handlers)) {
          gotFirstToken = true
          if (watchdog) clearTimeout(watchdog)
        }
      }
    }
    if (buffer.trim()) handleFrame(buffer, handlers)

    if (!gotFirstToken) {
      // Stream closed with no delta — treat as hollow and retry blocking.
      throw new Error("no first token")
    }
  } finally {
    if (watchdog) clearTimeout(watchdog)
    signal?.removeEventListener("abort", relayAbort)
  }
}

/** Parse one SSE frame. Returns true iff it was a text_delta (first-token mark). */
function handleFrame(frame: string, handlers: AskHandlers): boolean {
  let ev = ""
  const dataParts: string[] = []
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) ev = line.slice(6).trim()
    else if (line.startsWith("data:")) dataParts.push(line.slice(5).trim())
  }
  const dataStr = dataParts.join("\n")
  if (!dataStr) return false

  try {
    switch (ev) {
      case "text_delta": {
        const obj = JSON.parse(dataStr) as { delta?: string }
        if (typeof obj.delta === "string") {
          handlers.onDelta?.(obj.delta)
          return true
        }
        break
      }
      case "day": {
        // NOT a first-token mark: the payload is still what finishes the turn,
        // and a stream that produced days but no prose is as hollow as one that
        // produced neither.
        const d = normalizeStreamedDay(JSON.parse(dataStr))
        if (d) handlers.onDay?.(d.index, d.day)
        break
      }
      case "payload": {
        handlers.onPayload?.(normalizeAnswer(JSON.parse(dataStr)))
        break
      }
      case "status": {
        const obj = JSON.parse(dataStr) as { state?: string }
        if (obj.state) handlers.onStatus?.(obj.state)
        break
      }
      case "error": {
        const obj = JSON.parse(dataStr) as { message?: string }
        handlers.onError?.(obj.message ?? "Something went wrong.")
        break
      }
      default:
        break // ignore unknown events (e.g. `perf`)
    }
  } catch {
    // Malformed frame — skip.
  }
  return false
}

// ---- Place resolution (resolve-place via same-origin proxy) ----
// Used to hydrate chat cards with a photo + coordinates, and to attach
// resolved_place (name/lat/lng/place_id) when the user confirms an Add.

export interface PlaceCandidate {
  id: string
  name: string
  rating?: number | null
  reviewCount?: number | null
  address?: string | null
  photoRef?: string | null
  heroImageURL?: string | null
  photoUrl?: string | null
  primaryType?: string | null
  // Google editorial blurb — only populated once resolve-place requests it
  // (Pro-SKU FieldMask). Declared now so consumers can read it when it lands.
  editorialSummary?: string | null
  latitude?: number | null
  longitude?: number | null
  source?: string | null // "google" | "osm" | "geonames"
}

// A home base is a city/region — not a hotel or attraction. Google Places text
// search is POI-biased ("new york" → "New York-New York Hotel & Casino"), so we
// keep only locality/administrative results (OSM/Geonames are city geocoders).
//
// Lives here rather than in Settings because two screens now ask the same
// question — Settings › Home city, and the first-run flow's "Where do you set
// out from?" — and a second copy of this table is a second place for the
// Hotel & Casino to come back.
const CITY_TYPES = new Set([
  "locality", "postal_town", "sublocality", "neighborhood", "colloquial_area",
  "administrative_area_level_1", "administrative_area_level_2",
  "administrative_area_level_3", "political", "country",
])
export function isCityish(c: PlaceCandidate): boolean {
  return c.source !== "google" || !c.primaryType || CITY_TYPES.has(c.primaryType)
}

export async function resolvePlaceCandidates(
  query: string,
  destinationName?: string,
  country?: string
): Promise<PlaceCandidate[]> {
  try {
    const res = await fetch("/api/drift/resolve-place", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, destinationName, country }),
    })
    if (!res.ok) return []
    const json = (await res.json()) as { candidates?: PlaceCandidate[] }
    return json.candidates ?? []
  } catch {
    return []
  }
}

export async function resolvePlace(
  query: string,
  destinationName?: string,
  country?: string
): Promise<PlaceCandidate | null> {
  try {
    const res = await fetch("/api/drift/resolve-place", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, destinationName, country }),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { ok?: boolean; candidates?: PlaceCandidate[] }
    return json.candidates?.[0] ?? null
  } catch {
    return null
  }
}

/** Build a browser-loadable place-photo URL. maps-photo is a public image
 *  endpoint gated by the anon apikey (same pattern as the iOS GoogleMapsProxy). */
export function placePhotoUrl(c: PlaceCandidate | null, width = 640): string | null {
  if (!c) return null
  if (c.heroImageURL) return c.heroImageURL
  if (c.photoUrl) return c.photoUrl
  if (c.photoRef) {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    return `${base}/functions/v1/maps-photo?ref=${encodeURIComponent(c.photoRef)}&w=${width}&apikey=${anon}`
  }
  return null
}

class AskError extends Error {
  /** The edge function's machine code, when it sent one. "model_unavailable"
   *  means every provider failed — recoverable by asking, not by reporting. */
  readonly code: string | null
  constructor(message: string, code: string | null) {
    super(message)
    this.code = code
  }
}

async function blockingAsk(body: AskRequestBody, signal?: AbortSignal): Promise<ChatAnswer> {
  const res = await fetch(ASK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, stream: false }),
    signal,
  })
  if (!res.ok) {
    // The proxy forwards ask-drift-chat's body verbatim, and that body is JSON.
    // Throwing the raw text put `{"error":"Chat model unavailable.","code":...}`
    // straight into the chat's error banner. Read the shape we send.
    const text = await res.text().catch(() => "")
    let message = text.slice(0, 300)
    let code: string | null = null
    try {
      const parsed = JSON.parse(text) as { error?: string; code?: string }
      if (parsed.error) message = parsed.error
      if (parsed.code) code = parsed.code
    } catch {
      /* not JSON — keep the truncated text */
    }
    throw new AskError(message || `ask failed: ${res.status}`, code)
  }
  return normalizeAnswer(await res.json())
}

/**
 * What chat says when every provider failed and there is no answer to give.
 *
 * Never a bare error. A chat that reports its own plumbing fails the user twice
 * — once at the model, once at the screen, where they are left holding an error
 * message and no next move. Retry, then ask: a clarifying question keeps the
 * turn alive and is usually what the message needed anyway. Mirrors
 * driftChatClarifyingReply in the iOS client.
 */
export function clarifyingReply(question: string): string {
  const q = question.toLowerCase()
  if (q.includes("day ") || q.includes("itinerary") || q.includes("plan"))
    return "Which day should I start with? Tell me the day and roughly how you want to spend it, and I'll lay it out."
  if (q.includes("stay") || q.includes("hotel"))
    return "Which nights are you looking to book, and are you after something central or somewhere quieter?"
  if (q.includes("eat") || q.includes("food") || q.includes("restaurant") || q.includes("dinner"))
    return "What are you in the mood for, and roughly when — lunch, or dinner on a particular night?"
  return "Say a bit more and I'll pick it up from there — which day or place should I focus on?"
}
