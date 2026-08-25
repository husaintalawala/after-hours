import { NextResponse } from "next/server"
import { getDriftUpstream } from "@/lib/drift/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Proxy to the copy-trip edge function — the WRITER half of Inspire, and the
// only thing in the feature that creates rows.
//
// The body carries a client-minted `trip_id`, and that is load-bearing rather
// than decorative: copy-trip inserts AT that id and answers a 23505 on it — this
// same copy having already landed — with the trip that is already there, as a
// success. Without it, a fetch that times out after the row committed would
// invite a retry that writes a SECOND trip. So the id is passed through
// untouched, never regenerated here.
export async function POST(request: Request) {
  const up = await getDriftUpstream()
  if (!up) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.source_trip_id || !body?.start_date) {
    return NextResponse.json(
      { ok: false, error: "missing source_trip_id or start_date" },
      { status: 400 },
    )
  }

  const upstream = await fetch(`${up.functionsBase}/copy-trip`, {
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
