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
  const upstreamBody = JSON.stringify({
    trip_id: body.tripId,
    message: body.message ?? "",
    conversation: Array.isArray(body.conversation) ? body.conversation : [],
    image: body.image ?? undefined,
    stream: stream || undefined,
  })

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${up.token}`,
    apikey: up.anonKey,
  }
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
