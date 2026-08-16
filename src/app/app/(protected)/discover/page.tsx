import { createClient } from "@/lib/supabase/server"
import type { StepRow, TripRow } from "@/lib/db-types"
import type { DiscoverAnchor } from "@/lib/drift/discover"
import DiscoverShell, { type DiscoverPlace } from "@/components/app/discover/DiscoverShell"

// Discover — anchors to the user's featured trip's first destination when one
// exists (iOS trip-anchored mode); otherwise opens in search-first mode.

export default async function DiscoverPage() {
  const supabase = await createClient()
  // Middleware already verified this request's user; cookie read is enough here.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return null

  let anchor: DiscoverAnchor | null = null

  const { data: tripsRaw } = await supabase
    .from("trips")
    .select("*")
    .eq("user_id", user.id)
    .returns<TripRow[]>()
  const trips = (tripsRaw ?? []).sort((a, b) =>
    (b.start_date ?? "").localeCompare(a.start_date ?? "")
  )
  const today = new Date().toISOString().slice(0, 10)
  const featured =
    trips.find((t) => t.is_active) ??
    trips
      .filter((t) => (t.start_date ?? "") > today)
      .sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? ""))[0] ??
    trips[0]

  // All destination places across the user's trips power BOTH the Discover
  // picker options AND the trip anchor — from ONE query. (The anchor used to be
  // a second, redundant `steps` query for the featured trip's earliest
  // destination; that row is already in this superset, so derive it in memory.)
  const tripIds = trips.map((t) => t.id)
  let places: DiscoverPlace[] = []
  if (tripIds.length) {
    const { data: destRows } = await supabase
      .from("steps")
      .select("id,trip_id,title,location_name,country,latitude,longitude,date,nights")
      .in("trip_id", tripIds)
      .eq("step_type", "destination")
      .is("parent_step_id", null)
      .returns<StepRow[]>()
    const rows = destRows ?? []

    // Anchor = the featured trip's earliest destination, else its first city.
    if (featured) {
      const d = rows
        .filter((r) => r.trip_id === featured.id)
        .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))[0]
      if (d) {
        anchor = {
          label: d.title || d.location_name || featured.cities?.[0] || "Destination",
          country: d.country ?? featured.countries?.[0] ?? null,
          lat: d.latitude,
          lng: d.longitude,
        }
      } else if (featured.cities?.[0]) {
        anchor = {
          label: featured.cities[0],
          country: featured.countries?.[0] ?? null,
          lat: null,
          lng: null,
        }
      }
    }

    const tripById = new Map(trips.map((t) => [t.id, t]))
    const bucketFor = (t: TripRow): DiscoverPlace["bucket"] =>
      t.is_active ? "now" : (t.start_date ?? "") > today ? "upcoming" : "past"
    places = rows
      .filter((d) => d.latitude != null && d.longitude != null)
      .map((d) => {
        const t = d.trip_id ? tripById.get(d.trip_id) : undefined
        return {
          id: d.id,
          label: d.title || d.location_name || t?.cities?.[0] || "Destination",
          country: d.country ?? t?.countries?.[0] ?? null,
          lat: d.latitude,
          lng: d.longitude,
          bucket: t ? bucketFor(t) : "past",
          subtitle: t?.title || "",
          // Trip context so the Discover "+" can add a POI to this destination's
          // itinerary (mirrors iOS performAdd → applyCreateStep).
          tripId: d.trip_id ?? "",
          destinationRef: d.title || d.location_name || "",
          // Days come from THIS destination's own date + nights (mirrors iOS
          // dayOptions) — the clean date-only `steps.date`, not trips.start_date
          // (a timestamptz that parses to an invalid Date and yielded 0 days).
          days: destinationDays(d.date, d.nights ?? null),
        } satisfies DiscoverPlace
      })
  }

  return <DiscoverShell initialAnchor={anchor} places={places} />
}

// A destination's day list for the Discover add-to-itinerary day picker, from
// its own start date + nights (mirrors iOS dayOptions: for i in 0...nights).
// `date` is the clean date-only steps.date; slice defends against a timestamp.
// Empty for a dateless destination (the add then goes in unscheduled).
function destinationDays(
  date: string | null,
  nights: number | null
): { date: string; label: string }[] {
  const day0 = date?.slice(0, 10)
  if (!day0) return []
  const start = new Date(`${day0}T00:00:00Z`)
  if (Number.isNaN(start.getTime())) return []
  const n = Math.min(30, Math.max(0, nights ?? 0))
  const out: { date: string; label: string }[] = []
  for (let i = 0; i <= n; i++) {
    const d = new Date(start)
    d.setUTCDate(d.getUTCDate() + i)
    out.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
    })
  }
  return out
}
