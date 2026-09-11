import type { PlaceCandidate } from "@/lib/drift/chat"

/**
 * Google Places Autocomplete, as the web needs it.
 *
 * TWO CALLS, ONE SESSION, and that is the whole contract. A session is N
 * `suggest` requests sharing one token, TERMINATED by a `select` carrying that
 * same token. Terminate correctly and the suggests cost nothing; terminate with
 * the wrong mask, or never terminate at all, and Google silently re-bills every
 * request in the session at the per-request rate. There is no error and no
 * symptom — it shows up on the invoice.
 *
 * So: keep the token from the first `suggest` of a field, pass it to every
 * later `suggest` for that same field, and spend it on the `select` when the
 * reader picks something. Then throw it away — a token must not be reused
 * across two different searches.
 *
 * NOTHING HERE IS CACHED. Google's terms exempt only the place ID from storage
 * restrictions; prediction text, structuredFormat and types are Maps Content
 * with no such carve-out.
 */

export interface PlaceSuggestion {
  placeId: string
  /** The whole line — "Lisbon, Portugal". */
  text: string
  /** "Lisbon". */
  primary: string
  /** "Portugal". */
  secondary: string
  types: string[]
}

export interface SuggestResult {
  /** Carry this into the next suggest, and into select. */
  sessionToken: string | null
  suggestions: PlaceSuggestion[]
}

/**
 * Predictions for a partial query.
 *
 * A failed call answers empty rather than throwing, so a lookup that does not
 * land leaves the dropdown empty instead of half-drawn — the same contract
 * resolvePlaceCandidates has, for the same reason.
 */
export async function suggestPlaces(
  input: string,
  sessionToken?: string | null,
  coords?: { lat: number; lng: number }
): Promise<SuggestResult> {
  try {
    const res = await fetch("/api/drift/places-autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        verb: "suggest",
        input,
        sessionToken: sessionToken ?? undefined,
        lat: coords?.lat,
        lng: coords?.lng,
      }),
    })
    if (!res.ok) return { sessionToken: sessionToken ?? null, suggestions: [] }
    const json = (await res.json()) as {
      sessionToken?: string | null
      suggestions?: PlaceSuggestion[]
    }
    return {
      sessionToken: json.sessionToken ?? sessionToken ?? null,
      suggestions: json.suggestions ?? [],
    }
  } catch {
    return { sessionToken: sessionToken ?? null, suggestions: [] }
  }
}

/**
 * Resolve one prediction to a full place — AND terminate the billing session.
 *
 * Always call this with the token the suggests used, even if the coordinates
 * are not needed: the call is what makes the preceding requests free.
 */
export async function selectPlace(
  placeId: string,
  sessionToken: string | null
): Promise<PlaceCandidate | null> {
  try {
    const res = await fetch("/api/drift/places-autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verb: "select", placeId, sessionToken: sessionToken ?? undefined }),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { candidate?: PlaceCandidate }
    return json.candidate ?? null
  } catch {
    return null
  }
}

/**
 * Is this prediction a place somebody could live in?
 *
 * The origin question asks where you set out FROM, so a restaurant is never the
 * answer. Autocomplete returns Google place types, and the locality family is
 * the one that means "a settlement" — unlike resolve-place, which returns
 * whatever matched the string and had to be filtered by name-shape guesswork.
 */
const CITYISH = new Set([
  "locality",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "administrative_area_level_3",
  "postal_town",
  "sublocality",
  "neighborhood",
  "country",
])

export function isCityishSuggestion(s: PlaceSuggestion): boolean {
  return s.types.some((t) => CITYISH.has(t))
}
