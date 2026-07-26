// Client-side rich place details for the Discover place sheet. Posts to the
// same-origin /api/drift/place-details proxy (which forwards to the maps-proxy
// edge fn with the server Google key) and parses the raw Google Places (New)
// response — the browser-safe mirror of the server-only placeDetails.ts.

export interface PlaceDetailsLite {
  id: string
  name: string
  address: string | null
  rating: number | null
  ratingCount: number | null
  openNow: boolean | null
  hours: string[]
  summary: string | null
  mapsUri: string | null
  photoNames: string[]
  reviews: Array<{ rating: number | null; text: string; author: string; when: string }>
  typeLabel: string | null
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function fetchPlaceDetailsClient(placeId: string): Promise<PlaceDetailsLite | null> {
  try {
    const res = await fetch("/api/drift/place-details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeId }),
    })
    if (!res.ok) return null
    const g: any = await res.json()
    if (!g?.id) return null
    return {
      id: g.id,
      name: g.displayName?.text ?? "Place",
      address: g.formattedAddress ?? null,
      rating: g.rating ?? null,
      ratingCount: g.userRatingCount ?? null,
      openNow: g.currentOpeningHours?.openNow ?? null,
      hours: g.currentOpeningHours?.weekdayDescriptions ?? [],
      summary: g.editorialSummary?.text ?? null,
      mapsUri: g.googleMapsUri ?? null,
      photoNames: (g.photos ?? []).map((p: any) => p.name).filter(Boolean).slice(0, 8),
      reviews: (g.reviews ?? [])
        .map((r: any) => ({
          rating: r.rating ?? null,
          text: r.text?.text ?? "",
          author: r.authorAttribution?.displayName ?? "Traveler",
          when: r.relativePublishTimeDescription ?? "",
        }))
        .filter((r: any) => r.text)
        .slice(0, 5),
      typeLabel: g.primaryTypeDisplayName?.text ?? null,
    }
  } catch {
    return null
  }
}

/** Browser-loadable photo URL for a Google Places photo resource name. */
export function placePhotoUrlClient(photoName: string, width = 1000): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/maps-photo?ref=${encodeURIComponent(
    photoName
  )}&w=${width}&apikey=${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
}
