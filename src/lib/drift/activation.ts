import { AnalyticsEvent, capture } from "@/lib/analytics"

// trip_activated — "this stopped being an empty trip".
//
// Called from the paths that ADD a stop, never from a render. Firing it where
// the trip is read would re-fire on every open and turn a one-per-trip
// activation into a page-view count, which is the one way to destroy this
// metric. It is also deduped per trip in localStorage, so two adds in the same
// session (or a refresh mid-flow) can only produce one event.
//
// The count is read back from the server rather than inferred from the add,
// because every add path has a different idea of what it just wrote — chat
// confirms a card, the map adds a search result, the day sheet inserts
// directly — and the threshold has to mean the same thing in all of them. One
// HEAD count per add until the trip activates, then zero forever.
//
// The supabase client is imported DYNAMICALLY, for the same reason analytics.ts
// refuses to statically import posthog-js: /app/discover reaches its stop-add
// through the quick-op fetch and carries no supabase client at all, so a static
// import here put ~250 kB of supabase-js into that route's first load (measured:
// 81 kB → 334 kB). This runs only after somebody adds a stop, so a lazy chunk
// costs nothing that matters, and on routes that already bundle supabase it is
// the chunk they already have.
const ACTIVATION_STOPS = 3

export async function checkTripActivated(tripId: string): Promise<void> {
  if (typeof window === "undefined" || !tripId) return
  const key = `drift_trip_activated_${tripId}`
  try {
    if (localStorage.getItem(key)) return
    const { createClient } = await import("@/lib/supabase/client")
    const { count, error } = await createClient()
      .from("steps")
      .select("id", { count: "exact", head: true })
      .eq("trip_id", tripId)
    if (error || count == null || count < ACTIVATION_STOPS) return
    localStorage.setItem(key, "1")
    capture(AnalyticsEvent.TripActivated, { stop_count: count })
  } catch {
    /* analytics must never break the app */
  }
}
