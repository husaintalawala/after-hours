// Ask-Drift trip chat — shapes + browser SSE client. Ports the Swift
// DriftChatSemanticService workarounds: manual \n\n frame split with CRLF
// normalization, a 12s first-token watchdog that aborts to a blocking retry,
// and a non-streaming fallback decoding the identical ChatAnswer.
//
// Calls flow through a same-origin Next proxy (/api/drift/ask) that attaches the
// user's Supabase access token server-side — so the token never touches JS and
// there's no CORS dependency on the edge function. (Accept-Encoding: identity is
// a forbidden header in browser fetch; the proxy sets it upstream instead.)

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

export interface ChatAnswer {
  assistant_text: string
  title: string
  subtitle: string
  mode: "answer_only" | "answer_with_cards" | "clarification"
  is_clarification?: boolean
  cards: ChatCard[]
  followups: string[]
  reply_chips?: string[]
}

export interface AskRequestBody {
  tripId: string
  message: string
  conversation: Turn[]
  image?: string | null
}

export interface AskHandlers {
  onStatus?: (state: string) => void
  onDelta?: (delta: string) => void
  onPayload?: (answer: ChatAnswer) => void
  onError?: (message: string) => void
}

const ASK_URL = "/api/drift/ask"
const FIRST_TOKEN_TIMEOUT_MS = 12_000

/**
 * Run one Ask-Drift turn: stream via SSE, and if no first token lands within
 * 12s (or the stream errors), transparently fall back to the blocking call.
 * Resolves when the turn is fully handled (payload delivered or error reported).
 */
export async function askDrift(
  body: AskRequestBody,
  handlers: AskHandlers
): Promise<void> {
  try {
    await streamAsk(body, handlers)
  } catch (err) {
    // Watchdog abort (code -5 analog) or transport error → blocking retry.
    try {
      const answer = await blockingAsk(body)
      handlers.onPayload?.(answer)
    } catch (e) {
      handlers.onError?.(
        e instanceof Error ? e.message : "Couldn't reach Drift. Try again."
      )
    }
  }
}

async function streamAsk(body: AskRequestBody, handlers: AskHandlers): Promise<void> {
  const controller = new AbortController()
  let gotFirstToken = false

  const watchdog = setTimeout(() => {
    if (!gotFirstToken) controller.abort() // → caller falls back to blockingAsk
  }, FIRST_TOKEN_TIMEOUT_MS)

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
      buffer += decoder.decode(value, { stream: true }).replace(/\r/g, "")
      let idx: number
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        if (handleFrame(frame, handlers)) {
          gotFirstToken = true
          clearTimeout(watchdog)
        }
      }
    }
    if (buffer.trim()) handleFrame(buffer, handlers)

    if (!gotFirstToken) {
      // Stream closed with no delta — treat as hollow and retry blocking.
      throw new Error("no first token")
    }
  } finally {
    clearTimeout(watchdog)
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
      case "payload": {
        handlers.onPayload?.(JSON.parse(dataStr) as ChatAnswer)
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
  latitude?: number | null
  longitude?: number | null
  source?: string | null // "google" | "osm" | "geonames"
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

async function blockingAsk(body: AskRequestBody): Promise<ChatAnswer> {
  const res = await fetch(ASK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, stream: false }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(text.slice(0, 300) || `ask failed: ${res.status}`)
  }
  return (await res.json()) as ChatAnswer
}
