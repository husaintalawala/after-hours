import { createClient } from "@/lib/supabase/server"
import type { StepRow, TripRow } from "@/lib/db-types"
import type { DiscoverAnchor } from "@/lib/drift/discover"
import DiscoverShell, { type DiscoverPlace } from "@/components/app/discover/DiscoverShell"

// Discover — anchors to the user's featured trip's first destination when one
// exists (iOS trip-anchored mode); otherwise opens in search-first mode.

export default async function DiscoverPage() {
  const supabase = createClient()
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

  if (featured) {
    const { data: dest } = await supabase
      .from("steps")
      .select("*")
      .eq("trip_id", featured.id)
      .eq("step_type", "destination")
      .is("parent_step_id", null)
      .order("date", { ascending: true })
      .limit(1)
      .maybeSingle()
    const d = dest as StepRow | null
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

  // All destination places across the user's trips → quick-select options in
  // the Discover location picker (mirrors iOS "your destinations grouped by
  // your timeline"). Current location is added client-side via geolocation.
  const tripIds = trips.map((t) => t.id)
  let places: DiscoverPlace[] = []
  if (tripIds.length) {
    const { data: destRows } = await supabase
      .from("steps")
      .select("id,trip_id,title,location_name,country,latitude,longitude,date")
      .in("trip_id", tripIds)
      .eq("step_type", "destination")
      .is("parent_step_id", null)
      .returns<StepRow[]>()
    const tripById = new Map(trips.map((t) => [t.id, t]))
    const bucketFor = (t: TripRow): DiscoverPlace["bucket"] =>
      t.is_active ? "now" : (t.start_date ?? "") > today ? "upcoming" : "past"
    places = (destRows ?? [])
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
        } satisfies DiscoverPlace
      })
  }

  return <DiscoverShell initialAnchor={anchor} places={places} />
}
