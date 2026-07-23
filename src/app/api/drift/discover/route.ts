import { NextResponse } from "next/server"
import { getDriftUpstream } from "@/lib/drift/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Proxy for the bookable-inventory edge functions:
//   {kind:"activities", destinationName, lat?, lng?, count?}   → discover-activities (Viator)
//   {kind:"stays", lat, lng, count?, checkIn?, checkOut?}      → discover-stays (Stay22 multi-OTA)
//   {kind:"events", lat, lng, radiusKm?, startDate?, count?}   → discover-events (Ticketmaster)
const FN_BY_KIND: Record<string, string> = {
  activities: "discover-activities",
  stays: "discover-stays",
  events: "discover-events",
}

export async function POST(request: Request) {
  const up = await getDriftUpstream()
  if (!up) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const kind = body?.kind
  const fn = typeof kind === "string" ? FN_BY_KIND[kind] : undefined
  if (!fn) {
    return NextResponse.json({ ok: false, error: "bad kind" }, { status: 400 })
  }

  const { kind: _drop, ...payload } = body

  const upstream = await fetch(`${up.functionsBase}/${fn}`, {
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
