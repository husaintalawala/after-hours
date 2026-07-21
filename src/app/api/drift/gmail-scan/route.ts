import { NextResponse } from "next/server"
import { getDriftUpstream } from "@/lib/drift/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

// Proxy to the gmail-scan edge function. Body: {trip_id, access_token} where
// access_token is a Google OAuth token (gmail.readonly) obtained client-side
// via GIS. gmail-scan reads the inbox, parses confirmations, and writes an
// import_batch + reservation_segments the review shelf reads. Claude parsing
// can take a while → maxDuration.
export async function POST(request: Request) {
  const up = await getDriftUpstream()
  if (!up) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.trip_id || !body?.access_token) {
    return NextResponse.json(
      { ok: false, error: "missing trip_id or access_token" },
      { status: 400 }
    )
  }

  const upstream = await fetch(`${up.functionsBase}/gmail-scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${up.token}`,
      apikey: up.anonKey,
    },
    body: JSON.stringify({
      trip_id: String(body.trip_id),
      access_token: String(body.access_token),
    }),
  })

  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  })
}
