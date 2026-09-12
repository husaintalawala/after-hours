import { createClient } from "@/lib/supabase/client"
import type { ChatItinerary } from "@/lib/drift/generalChat"

/**
 * Turn a chat-proposed plan into a real trip.
 *
 * A PORT OF iOS's createTripFromItinerary, including the parts that look like
 * over-caution and are not. Remote-first: insert the trips row, then a
 * `destination` step as the trip's spine, then one `spot` per place hanging off
 * it. Web has no CoreData mirror to keep in step, so that half of the iOS
 * routine has no counterpart here.
 *
 * THE ID IS GENERATED HERE rather than read back from the insert, and iOS's own
 * note says why: the previous shape inserted the seeded row, and on any failure
 * fell back to a simpler one. A caught error cannot distinguish "the schema
 * rejected cities/countries" — the case the fallback exists for — from "the row
 * was written and the response failed to decode". In the second case the
 * fallback ran against a trip that already existed and made a SECOND one, so one
 * request produced two identical trips. Owning the id removes the ambiguity:
 * nothing has to be decoded to learn it, and a retry carries the same primary
 * key, so a duplicate insert conflicts instead of duplicating.
 */
export async function createTripFromItinerary(
  itin: ChatItinerary
): Promise<{ tripId: string } | { error: string }> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Sign in again and try once more." }

  // Calendar arithmetic on the DATE STRING, never on a parsed instant. The
  // model emits a wall-clock day; `new Date("2026-08-15")` is UTC midnight, and
  // adding days to that and formatting locally walks the whole trip back one
  // day for every reader west of Greenwich.
  const start = itin.startDate ?? todayISO()
  const dayCount = Math.max(1, itin.days.length)
  const end = addDaysISO(start, dayCount - 1)

  const tripId = crypto.randomUUID()
  const destId = crypto.randomUUID()

  const base = {
    id: tripId,
    user_id: user.id,
    title: itin.title,
    status: "active",
    start_date: start,
    end_date: end,
  }
  // cities/countries are ARRAYS on this table, not scalars — a long-standing
  // shape in this schema and an easy one to get wrong from a chat payload.
  const seeded = {
    ...base,
    cities: [itin.destination],
    countries: itin.country ? [itin.country] : null,
  }

  const first = await supabase.from("trips").insert(seeded)
  if (first.error) {
    const retry = await supabase.from("trips").insert(base)
    if (retry.error) {
      console.error("[createTripFromItinerary] insert trip", retry.error)
      return { error: "I couldn't create the trip just now — nothing changed." }
    }
  }

  // THE DESTINATION ANCHOR IS THE TRIP'S SPINE: every spot below hangs off
  // destId. If this insert is swallowed the trip exists with no destination,
  // the spots reference a parent that was never written, and the reader is
  // navigated into an empty screen that was just described as a finished plan.
  const dest = await supabase.from("steps").insert({
    id: destId,
    trip_id: tripId,
    date: start,
    location_name: itin.destination,
    step_type: "destination",
    country: itin.country,
    city: itin.destination,
    // nights + 1 = calendar days, app-wide. A 3-day plan is 2 nights, which is
    // what matches the trip's own start/end span — dayCount would push a
    // phantom trailing day past end_date.
    nights: Math.max(1, dayCount - 1),
  })
  if (dest.error) {
    console.error("[createTripFromItinerary] insert destination", dest.error)
    // The trip exists and is openable; it simply has no stops yet. Better to
    // hand the reader that than to claim nothing happened.
    return { tripId }
  }

  const spots = itin.days.flatMap((day, i) =>
    day.places.map((p) => ({
      trip_id: tripId,
      parent_step_id: destId,
      step_type: "spot",
      title: p.name,
      location_name: p.name,
      date: addDaysISO(start, i),
      nights: 0,
      source: "recommendation",
    }))
  )
  if (spots.length) {
    const { error } = await supabase.from("steps").insert(spots)
    if (error) console.error("[createTripFromItinerary] insert spots", error)
  }

  return { tripId }
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`
}

/** Add whole days to a yyyy-MM-dd string and get one back. UTC throughout, so
 *  the arithmetic never crosses a DST boundary and lands an hour short. */
function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000
  const out = new Date(t)
  return `${out.getUTCFullYear()}-${`${out.getUTCMonth() + 1}`.padStart(2, "0")}-${`${out.getUTCDate()}`.padStart(2, "0")}`
}
