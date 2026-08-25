import { NextResponse } from "next/server"
import { getDriftUpstream } from "@/lib/drift/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Proxy to the tailor-trip edge function — the ALTERATION half of Inspire.
//
// It never writes a row: it returns a plan plus one sentence explaining what it
// altered, and copy-trip is what turns that into a trip. The edge function does
// its own auth off the forwarded token (and must — verify_jwt at the gateway
// alone accepts the public anon key, so without the in-function check any
// anonymous caller could burn the model budget). We attach the caller's token
// and pass the body through verbatim.
//
// This proxy is also why tailor-trip carries no CORS block: the browser talks to
// us, not to Supabase.
export async function POST(request: Request) {
  const up = await getDriftUpstream()
  if (!up) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.source_trip_id || typeof body?.days !== "number") {
    return NextResponse.json(
      { ok: false, error: "missing source_trip_id or days" },
      { status: 400 },
    )
  }

  const upstream = await fetch(`${up.functionsBase}/tailor-trip`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${up.token}`,
      apikey: up.anonKey,
    },
    body: JSON.stringify(body),
  })

  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  })
}
