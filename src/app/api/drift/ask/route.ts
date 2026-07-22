import { NextResponse } from "next/server"
import { getDriftUpstream } from "@/lib/drift/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Proxy to the ask-drift-chat edge function. Attaches the caller's access token
// server-side and, for stream:true, pipes the SSE response straight back to the
// browser (same-origin, so no CORS + the token stays server-side).
export async function POST(request: Request) {
  const up = await getDriftUpstream()
  if (!up) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.tripId || (typeof body.message !== "string" && !body.image)) {
    return NextResponse.json({ error: "missing tripId or message" }, { status: 400 })
  }

  const stream = body.stream === true

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${up.token}`,
    apikey: up.anonKey,
  }

  // Real local events: for event-related questions, pull live Ticketmaster
  // listings for the trip's city (discover-events) and append them so the agent
  // answers with real events instead of only the itinerary. Fail-open.
  let message: string = typeof body.message === "string" ? body.message : ""
  if (message && isEventQuery(message)) {
    try {
      const evRes = await fetch(`${up.functionsBase}/discover-events`, {
        method: "POST",
        headers,
        body: JSON.stringify({ trip_id: body.tripId }),
      })
      const ev = (await evRes.json().catch(() => null)) as
        | { city?: string | null; events?: { name: string; date: string | null; venue: string | null; url: string | null }[] }
        | null
      const events = ev?.events ?? []
      if (events.length) {
        const lines = events
          .map((e) => `- ${e.name}${e.date ? ` — ${e.date}` : ""}${e.venue ? ` @ ${e.venue}` : ""}${e.url ? ` (${e.url})` : ""}`)
          .join("\n")
        message +=
          `\n\n[REAL LIVE EVENTS near ${ev?.city ?? "the destination"} (Ticketmaster, next ~6 weeks) — use these to answer about events happening soon; give names, dates, venues, and the link when useful. Do NOT claim you lack live event data:\n${lines}\n]`
      }
    } catch {
      /* fail-open — answer without live events */
    }
  }

  const upstreamBody = JSON.stringify({
    trip_id: body.tripId,
    message,
    conversation: Array.isArray(body.conversation) ? body.conversation : [],
    image: body.image ?? undefined,
    stream: stream || undefined,
  })
  if (stream) {
    headers["Accept"] = "text/event-stream"
    // Defeat edge gzip buffering of the SSE stream (server-to-server can set this).
    headers["Accept-Encoding"] = "identity"
  }

  const upstream = await fetch(`${up.functionsBase}/ask-drift-chat`, {
    method: "POST",
    headers,
    body: upstreamBody,
  })

  if (stream) {
    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "")
      return NextResponse.json(
        { error: text || "stream failed" },
        { status: upstream.status || 502 }
      )
    }
    return new Response(upstream.body, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    })
  }

  // Non-streaming: forward JSON + status verbatim.
  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  })
}

// Heuristic: is the user asking about live/local events (vs. planning)?
function isEventQuery(msg: string): boolean {
  return /\b(events?|concerts?|festivals?|gigs?|live music|what'?s on|going on|see a show|any shows?|happening (soon|near|tonight|this|around))\b/i.test(
    msg
  )
}
