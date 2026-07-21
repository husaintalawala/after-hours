import type { TripRow, StepRow } from "@/lib/db-types"
import {
  buildDestinationTimeline,
  groupTimelineByDay,
  type DestinationDay,
} from "./timeline"
import { compareDate, dateOnly } from "./dates"

export interface DestinationModel {
  destination: StepRow
  days: DestinationDay[]
}

export interface TripDetail {
  trip: TripRow
  destinations: DestinationModel[]
  /** steps not attached to any destination (defensive — should be rare). */
  unassigned: StepRow[]
}

// Match the exact (fully-parameterized) type the server client returns.
type DB = ReturnType<typeof import("@/lib/supabase/server").createClient>

/**
 * Fetch a trip + its steps (RLS-scoped) and assemble the per-destination day
 * model the Plan tab renders. Returns null if the trip isn't visible to the
 * caller (RLS) or doesn't exist.
 */
export async function fetchTripDetail(
  supabase: DB,
  tripId: string
): Promise<TripDetail | null> {
  const { data: trip } = await supabase
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .maybeSingle()

  if (!trip) return null

  const { data: stepsRaw } = await supabase
    .from("steps")
    .select("*")
    .eq("trip_id", tripId)

  const steps = (stepsRaw ?? []) as StepRow[]

  const destinations = steps
    .filter((s) => s.step_type === "destination" && !s.parent_step_id)
    .sort((a, b) =>
      compareDate(dateOnly(a.date) ?? "", dateOnly(b.date) ?? "")
    )

  const childrenByParent = new Map<string, StepRow[]>()
  for (const s of steps) {
    if (s.parent_step_id) {
      const arr = childrenByParent.get(s.parent_step_id) ?? []
      arr.push(s)
      childrenByParent.set(s.parent_step_id, arr)
    }
  }

  const destModels: DestinationModel[] = destinations.map((destination) => {
    const children = childrenByParent.get(destination.id) ?? []
    const timeline = buildDestinationTimeline(destination, children, [])
    const days = groupTimelineByDay(
      timeline,
      dateOnly(destination.date) ?? "1970-01-01",
      destination.nights ?? 0
    )
    return { destination, days }
  })

  const destIds = new Set(destinations.map((d) => d.id))
  const unassigned = steps.filter(
    (s) =>
      s.step_type !== "destination" &&
      (!s.parent_step_id || !destIds.has(s.parent_step_id))
  )

  return { trip, destinations: destModels, unassigned }
}

export function destinationLabel(d: StepRow): string {
  return d.title || d.location_name || d.city || "Destination"
}
