/**
 * THE trip cover chain. One pure function, no network, no imports beyond flags.
 *
 * Every surface that draws a trip cover goes through here. Before this, four
 * SSR loaders each had their own inline chain and two client components lazily
 * resolved a Google place photo after mount — which is why "Sri Lanka" showed a
 * photo on trip detail (keyed off the destination label) and a bare gradient on
 * Home (keyed off trip.city, empty for 48 of 55 trips).
 *
 * The rungs, in order:
 *   1. cover_url            — a human chose this photo
 *   2. firstPhotoUrl        — the oldest real photo from the trip
 *   3. cover_fallback_url   — sourced stock, written by resolve-trip-cover
 *   4. placeholder          — deterministic, generated, never stored, never fails
 *
 * Rung 3 is deliberately BELOW rung 2 and stored in its own column, so a user
 * upload or a photo added next week always outranks stock by construction
 * rather than by predicate.
 *
 * `||` not `??` throughout: an empty-string cover_url must fall through.
 *
 * The credit is returned WITH the url, never separately. Rendering a rung-3
 * photo without its credit is an Unsplash ToS violation, so the shape makes it
 * awkward to obtain one without the other — see TripCoverImg, which is the only
 * component that should destructure this.
 */

export interface TripCoverInput {
  id: string
  title?: string | null
  cover_url?: string | null
  /** Oldest media row of type 'photo' for this trip, if any. */
  firstPhotoUrl?: string | null
  cover_fallback_url?: string | null
  cover_fallback_attribution?: string | null
  cover_fallback_link?: string | null
  countries?: string[] | null
}

export interface TripCoverResult {
  url: string | null
  /** Non-null ONLY for rung 3. Must be rendered whenever url came from stock. */
  credit: { text: string; href: string | null } | null
  /** Always present, so a caller can paint rung 4 without branching on null. */
  placeholder: { from: string; to: string; glyph: string }
  rung: 1 | 2 | 3 | 4
}

/**
 * Dark-resolved UIColor pairs from iOS IdentityPalette.tripCover, captured by
 * resolving each system colour against the dark trait on-device rather than
 * transcribing Apple's published values — which differ (systemIndigo resolves
 * #6D7CFF here, not the #5E5CE6 in the HIG).
 *
 * Keep in sync with Drift/Design/Tokens/IdentityPalette.swift.
 */
const PAIRS: [string, string][] = [
  ["#6D7CFF", "#DB34F2"], // systemIndigo / systemPurple
  ["#00D2E0", "#0091FF"], // systemTeal   / systemBlue
  ["#FF9230", "#FF375F"], // systemOrange / systemPink
  ["#00DAC3", "#3CD3FE"], // systemMint   / systemCyan
  ["#DB34F2", "#FF375F"], // systemPurple / systemPink
  ["#0091FF", "#6D7CFF"], // systemBlue   / systemIndigo
]

/**
 * Stable bucket from a trip id. The FIRST BYTE of the uuid — byte-for-byte what
 * iOS reads via `Int(id.uuid.0)`, so the same trip gets the same gradient on
 * both platforms.
 *
 * Never hash the id: Swift's Hasher is seeded per process, so the iOS side
 * returned a different bucket on every cold launch until this was fixed.
 */
export function stableBucket(id: string, count: number): number {
  return bucket(id, count)
}

/** The identity pair for any id — a trip, or a STOP. Exported so the notes
 *  rollup can colour each stop the same way on both platforms. */
export function identityPair(id: string): [string, string] {
  return PAIRS[bucket(id, PAIRS.length)]
}

function bucket(id: string, count: number): number {
  const n = parseInt(id.slice(0, 2), 16)
  return Number.isNaN(n) ? 0 : n % count
}

export function tripCover(t: TripCoverInput): TripCoverResult {
  const [from, to] = PAIRS[bucket(t.id, PAIRS.length)]
  // The trip's initial, NOT a flag. A flag is a poor stand-in for a place —
  // it says which country, not what the place looks like — and at placeholder
  // size it reads as the cover rather than as an absence of one.
  const glyph = t.title?.trim() ? Array.from(t.title.trim())[0].toUpperCase() : "·"
  const placeholder = { from, to, glyph }

  if (t.cover_url) return { url: t.cover_url, credit: null, placeholder, rung: 1 }
  if (t.firstPhotoUrl) return { url: t.firstPhotoUrl, credit: null, placeholder, rung: 2 }
  if (t.cover_fallback_url) {
    return {
      url: t.cover_fallback_url,
      credit: t.cover_fallback_attribution
        ? { text: t.cover_fallback_attribution, href: t.cover_fallback_link || null }
        : null,
      placeholder,
      rung: 3,
    }
  }
  return { url: null, credit: null, placeholder, rung: 4 }
}

/** The columns every cover query must select. One place to keep them honest. */
export const TRIP_COVER_COLUMNS =
  "cover_url,cover_fallback_url,cover_fallback_attribution,cover_fallback_link"
