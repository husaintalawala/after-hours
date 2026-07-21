import { NextResponse } from "next/server"
import { getDriftUpstream } from "@/lib/drift/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Proxy to the apply-import-batch edge function: turns accepted parsed
// segments into real trip objects. Body: {batch_id, segment_ids[]} →
// {ok, applied[], skipped[]}.
export async function POST(request: Request) {
  const up = await getDriftUpstream()
  if (!up) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.batch_id || !Array.isArray(body?.segment_ids)) {
    return NextResponse.json(
      { ok: false, error: "missing batch_id or segment_ids" },
      { status: 400 }
    )
  }

  const upstream = await fetch(`${up.functionsBase}/apply-import-batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${up.token}`,
      apikey: up.anonKey,
    },
    body: JSON.stringify({
      batch_id: String(body.batch_id),
      segment_ids: body.segment_ids.map(String),
    }),
  })

  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  })
}
