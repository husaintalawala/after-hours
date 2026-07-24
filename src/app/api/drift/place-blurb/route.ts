import { NextResponse } from "next/server"
import { getDriftUpstream } from "@/lib/drift/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Proxy to the place-blurb edge function — AI one-line descriptions for Discover,
// cached server-side. Body: { places: [{ id, name, city?, category? }] }.
export async function POST(request: Request) {
  const up = await getDriftUpstream()
  if (!up) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const raw = Array.isArray(body?.places) ? body.places.slice(0, 24) : []
  if (!raw.length) return NextResponse.json({ ok: true, blurbs: {} })

  const places = raw
    .map((p: { id?: unknown; name?: unknown; city?: unknown; category?: unknown; context?: unknown }) => ({
      id: String(p.id ?? ""),
      name: String(p.name ?? ""),
      city: p.city ? String(p.city) : undefined,
      category: p.category ? String(p.category) : undefined,
      context: p.context ? String(p.context) : undefined,
    }))
    .filter((p: { id: string; name: string }) => p.id && p.name)

  const upstream = await fetch(`${up.functionsBase}/place-blurb`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${up.token}`,
      apikey: up.anonKey,
    },
    body: JSON.stringify({ places }),
  })

  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  })
}
