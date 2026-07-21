import { NextResponse } from "next/server"
import { getDriftUpstream } from "@/lib/drift/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Proxy to the resolve-place edge function (shared POI cache in front of
// Google Places, with OSM/Geonames fallback). Body: {query, destinationName?, country?}.
export async function POST(request: Request) {
  const up = await getDriftUpstream()
  if (!up) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.query) {
    return NextResponse.json({ ok: false, error: "missing query" }, { status: 400 })
  }

  const upstream = await fetch(`${up.functionsBase}/resolve-place`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${up.token}`,
      apikey: up.anonKey,
    },
    body: JSON.stringify({
      query: String(body.query),
      destinationName: String(body.destinationName ?? ""),
      country: String(body.country ?? ""),
    }),
  })

  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  })
}
