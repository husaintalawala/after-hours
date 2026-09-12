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
  // Street/area address, kept separate from `subtitle` (which is the category)
  // so the compact iOS-style card can show category · distance AND an address line.
  address: string | null
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
    address: c.address ?? null,
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
  address: c.address ?? null,
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

/** Commissioned Stay22 stays for a specific point + date window — powers the
 *  trip "Complete your trip" module. Unlike loadCategory("stays"), this is
 *  Stay22-only (every result is bookable via an affiliate `bookingUrl`) — it
 *  does NOT blend in Google POIs (which carry no bookingUrl) — and it passes the
 *  check-in/out window through for date-accurate, better-converting pricing. */
export async function loadStays(
  point: { lat: number; lng: number },
  opts?: { checkIn?: string; checkOut?: string; count?: number }
): Promise<DiscoverResult[]> {
  const stays = await withTimeout(
    vendor("stays", {
      lat: point.lat,
      lng: point.lng,
      count: opts?.count ?? 6,
      checkIn: opts?.checkIn,
      checkOut: opts?.checkOut,
    }).then((cs) => cs.map(fromVendor("stay22"))),
    7000,
    [] as DiscoverResult[]
  )
  return dedupe(stays).filter((s) => s.bookingUrl)
}

/** Fetch AI one-line blurbs for a batch of places (cached server-side, generated
 *  with Gemini Flash-Lite on a miss). Returns an { id → blurb } map; ids without
 *  a blurb are simply absent. Best-effort — never throws. */
export async function fetchPlaceBlurbs(
  places: { id: string; name: string; city?: string; category?: string; context?: string }[]
): Promise<Record<string, string>> {
  if (!places.length) return {}
  try {
    const res = await fetch("/api/drift/place-blurb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ places }),
    })
    if (!res.ok) return {}
    const json = (await res.json()) as { blurbs?: Record<string, string> }
    return json.blurbs ?? {}
  } catch {
    return {}
  }
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

/**
 * Where the reader is, at the finest granularity the map knows.
 *
 * NEIGHBOURHOOD, NOT CITY. This asked Mapbox for `types=place`, which is
 * Mapbox's word for a city — so somebody standing on the Upper East Side was
 * told "New York" and Discover searched a city of eight million for "top
 * attractions", which returns the Statue of Liberty to a person who wants
 * somewhere to have lunch.
 *
 * Mapbox orders its types coarse to fine: place (city) -> locality ->
 * neighborhood. Asking for all three and preferring the finest present is the
 * whole change, plus the fact that most of the world HAS no neighbourhood — a
 * village, a national park, most of Europe outside the big cities — so the
 * city remains the answer there rather than a hole.
 *
 * `city` comes back separately because callers compare it against the reader's
 * home city to decide whether they are somewhere new, and "Upper East Side" is
 * never equal to "New York". Mirrors ChatLocationProbe on iOS.
 */
export async function reverseGeocodeHere(
  lat: number,
  lng: number
): Promise<{ label: string; city: string | null; country: string | null }> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token) return { label: "Nearby", city: null, country: null }
  try {
    const res = await fetch(
      // NO `limit`. Mapbox rejects it outright when reverse geocoding with more
      // than one type — "limit must be combined with a single type parameter",
      // HTTP 422 — and this function answers a failed request with the string
      // "Nearby", so getting that wrong does not break loudly. It quietly
      // labels every reader "Nearby" and is worse than the city it replaced.
      // Without it Mapbox returns one feature per type, finest first.
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
        `?types=neighborhood,locality,place&access_token=${token}`
    )
    if (!res.ok) return { label: "Nearby", city: null, country: null }
    const json = (await res.json()) as {
      features?: {
        text?: string
        place_type?: string[]
        context?: { id?: string; text?: string }[]
      }[]
    }
    const feats = json.features ?? []
    const of = (t: string) => feats.find((f) => f.place_type?.includes(t))
    // Finest first. `locality` sits between the two — Mapbox uses it for
    // boroughs and for towns inside a larger metro.
    const finest = of("neighborhood") ?? of("locality") ?? of("place") ?? feats[0]
    const cityFeat = of("place")
    const label = finest?.text ?? "Nearby"
    const city =
      cityFeat?.text ??
      finest?.context?.find((c) => c.id?.startsWith("place"))?.text ??
      null
    const country =
      finest?.context?.find((c) => c.id?.startsWith("country"))?.text ?? null
    return { label, city, country }
  } catch {
    return { label: "Nearby", city: null, country: null }
  }
}

// ---------------------------------------------------------------- recents

/** How many places the picker remembers. Enough to cover "the three places I
 *  actually look at" without becoming a second, worse trip list. */
const RECENTS_MAX = 4
const RECENTS_KEY = "drift.discover.recents"

/**
 * Places this reader has chosen before.
 *
 * KEYED BY ACCOUNT, and that is not paranoia — this app has shipped the
 * opposite twice. `daybreak.shapes` and `daybreak.party` were both device-wide
 * keys read before any account check, so the second person to sign in on a
 * phone got the first person's answers presented as their own defaults. A list
 * of "where you were recently" is a more personal version of the same leak, and
 * it fails the same invisible way: it looks like a sensible default.
 *
 * Every accessor is wrapped, because localStorage throws rather than returning
 * null in a private window and in browsers set to block site data — and a
 * picker that cannot open is worse than one with no history in it.
 */
function recentsKey(userId: string | null): string {
  return userId ? `${RECENTS_KEY}.${userId}` : RECENTS_KEY
}

export function recentAnchors(userId: string | null): DiscoverAnchor[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(recentsKey(userId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (a): a is DiscoverAnchor =>
          !!a && typeof a === "object" && typeof (a as DiscoverAnchor).label === "string"
      )
      .slice(0, RECENTS_MAX)
  } catch {
    return []
  }
}

export function rememberAnchor(userId: string | null, anchor: DiscoverAnchor): void {
  if (typeof window === "undefined" || !anchor.label) return
  try {
    // Deduped on the LABEL rather than the coordinate: the same neighbourhood
    // resolved twice comes back with slightly different coordinates every time,
    // so a coordinate key would fill the list with four copies of one place.
    const next = [anchor, ...recentAnchors(userId).filter((a) => a.label !== anchor.label)]
    window.localStorage.setItem(recentsKey(userId), JSON.stringify(next.slice(0, RECENTS_MAX)))
  } catch {
    // A reader who blocks site data simply has no history. Not an error.
  }
}
