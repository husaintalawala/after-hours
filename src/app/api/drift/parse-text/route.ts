import { NextResponse } from "next/server"
import { getDriftUpstream } from "@/lib/drift/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

// Proxy to the parse-text edge function. Two modes:
//   single: {trip_id, source, text}          → {ok, batch_id, ...counts}
//   batch:  {trip_id, source, texts: [...]}   → one batch for many texts (the
//           calendar/.ics path — mirrors how gmail-scan fans many emails into
//           one batch). The Claude parse can take a while, hence maxDuration.
export async function POST(request: Request) {
  const up = await getDriftUpstream()
  if (!up) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const hasTexts = Array.isArray(body?.texts) && body.texts.length > 0
  if (!body?.trip_id || (!body?.text && !hasTexts)) {
    return NextResponse.json({ ok: false, error: "missing trip_id or text" }, { status: 400 })
  }

  const payload: Record<string, unknown> = {
    trip_id: String(body.trip_id),
    source: String(body.source ?? "paste"),
  }
  if (hasTexts) payload.texts = body.texts.map((t: unknown) => String(t ?? ""))
  else payload.text = String(body.text)

  const upstream = await fetch(`${up.functionsBase}/parse-text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${up.token}`,
      apikey: up.anonKey,
    },
    body: JSON.stringify(payload),
  })

  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  })
}
