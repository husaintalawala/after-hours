// Destination "guide facts" — the web slice of iOS DestinationFacts. Fetched
// lazily (client-side, non-blocking) by DestinationGuide to render the
// quick-facts chips, the best-time seasonality bar, and the budget card.
//
// Field names are snake_case to match the JSON the Gemini prompt emits (see
// src/app/api/drift/facts/route.ts). Every field is optional — an unknown fact
// is omitted, never faked.

export interface DestinationNeighborhood {
  name: string
  character: string
}

export interface DestinationFacts {
  currency?: string | null // "kr · ISK"
  language?: string | null // "Icelandic"
  plug?: string | null // "Type F"
  voltage?: string | null // "230V"
  safety?: string | null // "Very safe"
  tap_water?: string | null // "Safe to drink"
  walkable?: string | null // "Very walkable"
  monthly_high_c?: number[] | null // 12 avg daily-high °C, Jan..Dec
  seasonality?: string[] | null // 12 of "off" | "shoulder" | "peak", Jan..Dec
  budget_level?: number | null // 1 (cheap) … 3 (pricey)
  budget_why?: string | null // "Pricey — Nordic prices"
  neighborhoods?: DestinationNeighborhood[] | null
  emergency?: string | null // "112"
  tipping?: string | null // "Not expected"
  connectivity?: string | null // "eSIM widely available"
}

/**
 * Fetch structured facts for a destination via the same-origin proxy (which
 * forwards to the shared `gemini-complete` edge fn with the caller's JWT).
 * Returns null on any failure — the caller fails open and renders nothing.
 */
export async function fetchDestinationFacts(
  city: string,
  country: string | null
): Promise<DestinationFacts | null> {
  try {
    const res = await fetch("/api/drift/facts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city, country: country ?? "" }),
    })
    if (!res.ok) return null
    const j = (await res.json().catch(() => null)) as { facts?: DestinationFacts | null } | null
    return j?.facts ?? null
  } catch {
    return null
  }
}
