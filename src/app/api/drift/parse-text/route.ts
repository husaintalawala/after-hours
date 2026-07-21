import { NextResponse } from "next/server"
import { getDriftUpstream } from "@/lib/drift/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

// Proxy to the parse-text edge function (paste-a-confirmation import path).
// Body: {trip_id, source, text} → {ok, batch_id, ...counts}. The Claude parse
// can take a while, hence the long maxDuration.
export async function POST(request: Request) {
  const up = await getDriftUpstream()
  if (!up) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.trip_id || !body?.text) {
    return NextResponse.json({ ok: false, error: "missing trip_id or text" }, { status: 400 })
  }

  const upstream = await fetch(`${up.functionsBase}/parse-text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${up.token}`,
      apikey: up.anonKey,
    },
    body: JSON.stringify({
      trip_id: String(body.trip_id),
      source: String(body.source ?? "paste"),
      text: String(body.text),
    }),
  })

  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  })
}
