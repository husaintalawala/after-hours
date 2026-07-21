import { NextResponse } from "next/server"
import { getDriftUpstream } from "@/lib/drift/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Proxy to the apply-quick-op edge function (create_step / remove_step). The
// edge function does its own owner-or-accepted-buddy authorization off the
// forwarded token; we just attach it and pass the body through verbatim.
export async function POST(request: Request) {
  const up = await getDriftUpstream()
  if (!up) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.trip_id || !body?.op) {
    return NextResponse.json({ ok: false, error: "missing trip_id or op" }, { status: 400 })
  }

  const upstream = await fetch(`${up.functionsBase}/apply-quick-op`, {
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
