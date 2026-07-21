import { NextResponse } from "next/server"
import { getDriftUpstream } from "@/lib/drift/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Rich place details via the maps-proxy edge function (server-side Google key;
// same call shape as the iOS GoogleMapsProxy.placeDetails). Body: {placeId}.
const FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "rating",
  "userRatingCount",
  "priceLevel",
  "currentOpeningHours.weekdayDescriptions",
  "currentOpeningHours.openNow",
  "editorialSummary",
  "websiteUri",
  "internationalPhoneNumber",
  "googleMapsUri",
  "photos.name",
  "reviews.rating",
  "reviews.text.text",
  "reviews.authorAttribution.displayName",
  "reviews.relativePublishTimeDescription",
  "location",
  "primaryTypeDisplayName",
].join(",")

export async function POST(request: Request) {
  const up = await getDriftUpstream()
  if (!up) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const placeId = body?.placeId
  if (typeof placeId !== "string" || !placeId) {
    return NextResponse.json({ error: "missing placeId" }, { status: 400 })
  }

  const upstream = await fetch(`${up.functionsBase}/maps-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${up.token}`,
      apikey: up.anonKey,
    },
    body: JSON.stringify({ api: "placeDetails", placeID: placeId, fieldMask: FIELD_MASK }),
  })

  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  })
}
