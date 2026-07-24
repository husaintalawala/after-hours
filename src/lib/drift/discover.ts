// Discover data layer — category fetchers over the same-origin proxies.
// Mirrors the iOS DiscoverView categories: For you / Restaurants / Things to
// do (Viator blended first) / Stays (Stay22 multi-OTA).

import { resolvePlaceCandidates, placePhotoUrl, type PlaceCandidate } from "./chat"

export type DiscoverCategory = "forYou" | "restaurants" | "thingsToDo" | "stays" | "events"

export const CATEGORY_META: Record<
  DiscoverCategory,
  { label: string; query: string; icon?: string }
> = {
  forYou: { label: "For you", query: "top attractions" },
  restaurants: { label: "Restaurants", query: "restaurants" },
  thingsToDo: { label: "Things to do", query: "things to do" },
  stays: { label: "Stays", query: "hotels" },
  events: { label: "Events", query: "events", icon: "🎟️" },
}

export interface DiscoverResult {
  id: string
  name: string
  photo: string | null
  rating: number | null
  reviewCount: number | null
  priceLabel: string | null
  subtitle: string | null
  // A short human-readable blurb (2-line clamp in the UI). Present today for
  // Viator activities (upstream carries it); null for other sources until a
  // description source is wired (Google editorial summary is Pro-SKU + gated).
  description: string | null
  lat: number | null
  lng: number | null
  bookingUrl: string | null
  source: "google" | "viator" | "stay22" | "ticketmaster"
}

export interface DiscoverAnchor {
  label: string
  country: string | null
  lat: number | null
  lng: number | null
}

function fromGoogle(c: PlaceCandidate): DiscoverResult {
  return {
    id: c.id,
    name: c.name,
    photo: placePhotoUrl(c, 480),
    rating: c.rating ?? null,
    reviewCount: c.reviewCount ?? null,
    priceLabel: null,
    subtitle: c.primaryType ?? c.address ?? null,
    description: c.editorialSummary ?? null,
    lat: c.latitude ?? null,
    lng: c.longitude ?? null,
    bookingUrl: null,
    source: "google",
  }
}

interface VendorCandidate {
  id: string
  name: string
  photoUrl?: string | null
  photoRef?: string | null
  heroImageURL?: string | null
  images?: string[] | null
  rating?: number | null
  reviewCount?: number | null
  priceLabel?: string | null
  address?: string | null
  description?: string | null
  latitude?: number | null
  longitude?: number | null
  bookingUrl?: string | null
}

async function vendor(
  kind: "activities" | "stays" | "events",
  payload: Record<string, unknown>
) {
  try {
    const res = await fetch("/api/drift/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, ...payload }),
    })
    if (!res.ok) return []
    const json = (await res.json()) as { candidates?: VendorCandidate[] }
    return json.candidates ?? []
  } catch {
    return []
  }
}

const fromVendor =
  (source: "viator" | "stay22" | "ticketmaster") =>
  (c: VendorCandidate): DiscoverResult => ({
  id: c.id,
  name: c.name,
  // Ticketmaster events return an `images` array (ResolvePlaceCandidate-shaped);
  // OTA/activity vendors return `photoUrl`. Take whichever is present.
  photo: c.photoUrl ?? c.images?.[0] ?? c.heroImageURL ?? null,
  rating: c.rating ?? null,
  reviewCount: c.reviewCount ?? null,
  priceLabel: c.priceLabel ?? null,
  subtitle: c.address ?? null,
  description: c.description ?? null,
  lat: c.latitude ?? null,
  lng: c.longitude ?? null,
  bookingUrl: c.bookingUrl ?? null,
  source,
})

// Never let a slow/hung upstream (Google resolve-place or a vendor) leave the
// rail stuck on "Finding…". Race each source against a timeout that resolves to
// a fallback, so the category always renders what arrived in time.
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>((res) => setTimeout(() => res(fallback), ms)),
  ])
}

/** Load a category. Bookable vendors lead, Google POIs fill in (iOS blending).
 *  `radiusKm` is honored by the events (Ticketmaster) branch — set it from the
 *  visible map span when re-searching a panned/zoomed area. */
export async function loadCategory(
  cat: DiscoverCategory,
  anchor: DiscoverAnchor,
  radiusKm?: number
): Promise<DiscoverResult[]> {
  // Events are pure Ticketmaster (no Google blend) and are venue-coordinate
  // driven. City-only anchors (no coords) can't be searched — fall back to [].
  if (cat === "events") {
    const lat = anchor.lat
    const lng = anchor.lng
    if (lat == null || lng == null) return []
    const events = withTimeout(
      vendor("events", {
        lat,
        lng,
        radiusKm,
        count: 20,
        startDate: new Date().toISOString().slice(0, 10),
      }).then((cs) => cs.map(fromVendor("ticketmaster"))),
      7000,
      [] as DiscoverResult[]
    )
    return dedupe(await events)
  }

  const google = withTimeout(
    resolvePlaceCandidates(
      CATEGORY_META[cat].query,
      anchor.label,
      anchor.country ?? undefined
    ).then((cs) => cs.map(fromGoogle)),
    9000,
    [] as DiscoverResult[]
  )

  if (cat === "thingsToDo") {
    // Don't block the whole category on the vendor — it can be slow. Time it out
    // to [] so Google results still render.
    const viator = withTimeout(
      vendor("activities", {
        destinationName: anchor.label,
        lat: anchor.lat ?? undefined,
        lng: anchor.lng ?? undefined,
        count: 12,
      }).then((cs) => cs.map(fromVendor("viator"))),
      6000,
      [] as DiscoverResult[]
    )
    const [v, g] = await Promise.all([viator, google])
    return dedupe([...v, ...g])
  }

  if (cat === "stays" && anchor.lat != null && anchor.lng != null) {
    const stays = withTimeout(
      vendor("stays", { lat: anchor.lat, lng: anchor.lng, count: 15 }).then((cs) =>
        cs.map(fromVendor("stay22"))
      ),
      6000,
      [] as DiscoverResult[]
    )
    const [s, g] = await Promise.all([stays, google])
    return dedupe([...s, ...g])
  }

  return await google
}

/** Gate a vendor-supplied URL to http(s) before it reaches an href — blocks
 *  javascript:/data: schemes from an untrusted upstream (booking deep-links).
 *  Returns the original URL if safe, else null. */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const p = new URL(url).protocol
    return p === "http:" || p === "https:" ? url : null
  } catch {
    return null
  }
}

function dedupe(results: DiscoverResult[]): DiscoverResult[] {
  const seen = new Set<string>()
  return results.filter((r) => {
    const key = r.name.toLowerCase().replace(/[^a-z0-9]/g, "")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
