import type { SupabaseClient } from "@supabase/supabase-js"
import { parseDestination, photoAt, type InspireDestination } from "@/lib/drift/inspire"
import { tripCover, type TripCoverResult } from "@/lib/drift/tripCover"
import type { GlobeTripPin } from "@/components/app/GlobeHero"

/**
 * The Inspire corpus, as the logged-in home needs it: a few photographed cards
 * and one globe pin per guide.
 *
 * It exists because a brand-new account's home was a globe with nothing on it
 * and two grey tiles, while forty finished, photographed trips sat one route
 * away — a routing problem, not a supply one. A photo is the only thing on that
 * screen that can say "this is what a trip looks like here" before the reader
 * has made one.
 *
 * ONE PIN PER TRIP, not one per destination. 40 guides carry 108 stops between
 * them, and pinning all 108 draws clusters (three dots on the Amalfi coast) that
 * read as three trips rather than one. The pin is the guide's face, so it goes
 * where the guide starts.
 */

/** One card on the deck. `cover` carries its own credit — see TripCoverImg. */
export interface InspirePromoCard {
  tripId: string
  href: string
  /** The author's own name for the trip — the sentence a person would say. */
  title: string
  /** "10 days · Iceland". */
  kicker: string
  cover: TripCoverResult
  /** Spoken name of the stretched link. */
  aria: string
}

export interface InspirePromo {
  /** The one big photo. */
  hero: InspirePromoCard
  /** The smaller cards beside it. */
  rest: InspirePromoCard[]
  /** How many guides were actually READ, not a number typed into copy. */
  total: number
  /** One per guide, for the globe. */
  pins: GlobeTripPin[]
}

/** How many cards the deck draws. The rest of the corpus is behind "see all". */
const DECK_SIZE = 5

// Photo widths, negotiated with the photo's OWN host (see photoAt) — these are
// Wikimedia and Unsplash URLs and must never touch our optimizer.
const HERO_W = 1000
const TILE_W = 400
const PIN_W = 96

interface PromoSource {
  tripId: string
  title: string
  days: number
  place: string | null
  heroUrl: string | null
  heroAttribution: string | null
  heroLink: string | null
  pin: { lat: number; lng: number } | null
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}
function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

/**
 * A coordinate a globe may actually draw.
 *
 * (0,0) is the unset sentinel both platforms already reject — it is in the Gulf
 * of Guinea, so an unset stop does not look wrong, it looks like a trip to the
 * middle of the Atlantic. Out-of-range values are rejected for the same reason:
 * Mapbox clamps rather than throwing, so a bad latitude lands silently at a pole.
 */
function usableCoord(d: InspireDestination): d is InspireDestination & { latitude: number; longitude: number } {
  const { latitude: lat, longitude: lng } = d
  if (lat === null || lng === null) return false
  if (lat === 0 && lng === 0) return false
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

function decode(raw: unknown): PromoSource | null {
  const row = asRecord(raw)
  if (!row) return null
  const tripId = asString(row.trip_id)
  const title = asString(row.title)
  const days = asNumber(row.day_count)
  // A card with no title or no shape is a working click target with nothing on
  // its face — the bug a reader finds by pressing it.
  if (!tripId || !title || !days || days < 1) return null

  // The order IS the pattern, so the first stop is the one with the lowest day
  // offset rather than whichever the hand-edited JSON happens to list first.
  const destinations = asArray(row.destinations)
    .map(parseDestination)
    .sort((a, b) => a.day_offset - b.day_offset)
  const first = destinations.find(usableCoord)

  return {
    tripId,
    title,
    days: Math.round(days),
    // Same choice the shelf headline makes, so the two surfaces name a trip the
    // same way — falling through to the first city for the (currently zero)
    // rows with no country.
    place: asString(asArray(row.countries)[0]) ?? asString(asArray(row.cities)[0]),
    heroUrl: asString(row.hero_url),
    heroAttribution: asString(row.hero_attribution),
    heroLink: asString(row.hero_link),
    pin: first ? { lat: first.latitude, lng: first.longitude } : null,
  }
}

function card(src: PromoSource, width: number): InspirePromoCard {
  const kicker = `${src.days} ${src.days === 1 ? "day" : "days"}${src.place ? ` · ${src.place}` : ""}`
  return {
    tripId: src.tripId,
    href: `/app/inspire/${src.tripId}`,
    title: src.title,
    kicker,
    // Stock, so it enters the chain at rung 3 WITH its credit — which is what
    // makes the attribution structurally impossible to render without.
    cover: tripCover({
      id: src.tripId,
      title: src.title,
      cover_fallback_url: photoAt(src.heroUrl, width),
      cover_fallback_attribution: src.heroAttribution,
      cover_fallback_link: src.heroLink,
    }),
    aria: `${src.title}. ${kicker}. Make it mine.`,
  }
}

/**
 * Read the shelf down to what a promo needs.
 *
 * Returns null on ANY failure or empty result, and the caller falls back to the
 * screen it already had. A FAILED QUERY AND AN EMPTY SHELF MUST NOT RENDER THE
 * SAME: an outage dressed as a deck with no photos on it is indistinguishable
 * from a curated shelf that happens to be empty, and nothing anywhere would say
 * the query failed — so the failure is logged and the deck is simply not drawn.
 */
export async function buildInspirePromo(
  supabase: SupabaseClient
): Promise<InspirePromo | null> {
  // PROJECTED, not `select(snapshot)`. The shelf reads whole snapshots because
  // it searches inside them; this needs a title, a day count, a country and one
  // coordinate. Pulling all 40 snapshots costs 861KB over the wire and parses
  // 520 itinerary items to draw five cards — the projection is 98KB. Measured
  // against production, both.
  const { data, error } = await supabase
    .from("inspire_trips")
    .select(
      "trip_id,hero_url,hero_attribution,hero_link," +
        "title:snapshot->>title,day_count:snapshot->day_count," +
        "countries:snapshot->countries,cities:snapshot->cities," +
        "destinations:snapshot->destinations"
    )
    .eq("is_active", true)
    .order("rank", { ascending: false })
    // Ranks tie — six rows share rank 13 — and an unbroken tie orders
    // arbitrarily per query, so without a second key the deck deals a different
    // hero on every visit.
    .order("trip_id", { ascending: true })
    .returns<unknown[]>()

  if (error) {
    console.error("[home] inspire promo query failed", error)
    return null
  }

  const rows = data ?? []
  const sources = rows.map(decode).filter((s): s is PromoSource => s !== null)
  // Rows arriving and every one of them dropping looks exactly like an empty
  // table from the outside. It is a curation fault, and only the log can say so.
  if (rows.length > 0 && sources.length === 0) {
    console.error("[home] every inspire promo row failed to decode", { rows: rows.length })
  }
  if (!sources.length) return null

  const [hero, ...rest] = sources
  return {
    hero: card(hero, HERO_W),
    rest: rest.slice(0, DECK_SIZE - 1).map((s) => card(s, TILE_W)),
    total: sources.length,
    pins: sources
      .filter((s) => s.pin)
      .map((s) => ({
        tripId: s.tripId,
        lat: s.pin!.lat,
        lng: s.pin!.lng,
        imageURL: photoAt(s.heroUrl, PIN_W),
        // No polyline. Forty routes drawn over an otherwise empty planet is a
        // ball of string, and the guide's shape is the deck's job to tell.
        route: [],
        kind: "inspire" as const,
      })),
  }
}
