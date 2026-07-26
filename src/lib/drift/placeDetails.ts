import "server-only"
import { getDriftUpstream } from "./server"

// Rich place details via maps-proxy (server-side Google key). Mirrors the iOS
// PlacesService.placeDetails(rich:) field set. Fail-open to null.

export interface PlaceDetails {
  id: string
  name: string
  address: string | null
  rating: number | null
  ratingCount: number | null
  priceLevel: string | null
  openNow: boolean | null
  hours: string[]
  summary: string | null
  website: string | null
  phone: string | null
  mapsUri: string | null
  photoNames: string[]
  reviews: Array<{
    rating: number | null
    text: string
    author: string
    when: string
  }>
  lat: number | null
  lng: number | null
  typeLabel: string | null
}

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

/* eslint-disable @typescript-eslint/no-explicit-any */
// Google Place Details are identical for every user and change slowly, but the
// call to Google (~150-400ms via the proxy) sat directly on the /app/place/[id]
// TTFB on EVERY view. Memoize per placeId with a short TTL so repeat views (by
// any user) are served from RAM on a warm serverless instance. Successful
// results only — transient failures retry. (A `next: { revalidate }` fetch
// option would be a no-op here: Next only caches GET, and this is a POST.)
const DETAILS_TTL_MS = 15 * 60 * 1000
const detailsMemo = new Map<string, { at: number; data: PlaceDetails }>()

export async function fetchPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const hit = detailsMemo.get(placeId)
  if (hit && Date.now() - hit.at < DETAILS_TTL_MS) return hit.data
  try {
    const up = await getDriftUpstream()
    if (!up) return null
    const res = await fetch(`${up.functionsBase}/maps-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${up.token}`,
        apikey: up.anonKey,
      },
      body: JSON.stringify({ api: "placeDetails", placeID: placeId, fieldMask: FIELD_MASK }),
    })
    if (!res.ok) return null
    const g: any = await res.json()
    if (!g?.id) return null
    const details = {
      id: g.id,
      name: g.displayName?.text ?? "Place",
      address: g.formattedAddress ?? null,
      rating: g.rating ?? null,
      ratingCount: g.userRatingCount ?? null,
      priceLevel: g.priceLevel ?? null,
      openNow: g.currentOpeningHours?.openNow ?? null,
      hours: g.currentOpeningHours?.weekdayDescriptions ?? [],
      summary: g.editorialSummary?.text ?? null,
      website: g.websiteUri ?? null,
      phone: g.internationalPhoneNumber ?? null,
      mapsUri: g.googleMapsUri ?? null,
      photoNames: (g.photos ?? []).map((p: any) => p.name).filter(Boolean).slice(0, 6),
      reviews: (g.reviews ?? [])
        .map((r: any) => ({
          rating: r.rating ?? null,
          text: r.text?.text ?? "",
          author: r.authorAttribution?.displayName ?? "Traveler",
          when: r.relativePublishTimeDescription ?? "",
        }))
        .filter((r: any) => r.text)
        .slice(0, 4),
      lat: g.location?.latitude ?? null,
      lng: g.location?.longitude ?? null,
      typeLabel: g.primaryTypeDisplayName?.text ?? null,
    }
    if (detailsMemo.size > 500) detailsMemo.clear()
    detailsMemo.set(placeId, { at: Date.now(), data: details })
    return details
  } catch {
    return null
  }
}

/** Browser-loadable photo URL for a Places photo resource name. */
export function placesPhotoUrl(photoName: string, width = 1200): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/maps-photo?ref=${encodeURIComponent(
    photoName
  )}&w=${width}&apikey=${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
}
