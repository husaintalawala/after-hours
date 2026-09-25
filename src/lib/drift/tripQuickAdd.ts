import type { PlaceCandidate } from "./chat"
import type { Database } from "../database.types"

export type TripQuickAddKind = "destination" | "spot" | "stay"

export interface QuickAddDestination {
  id: string
  date: string
  nights: number
  label: string
}

interface QuickAddInput {
  kind: TripQuickAddKind
  tripId: string
  candidate: PlaceCandidate
  destination?: QuickAddDestination | null
  tripStart?: string | null
  today?: string
}

type StepInsert = Database["public"]["Tables"]["steps"]["Insert"]

export function countryFromPlace(candidate: PlaceCandidate): string | null {
  const parts = (candidate.address ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
  const last = parts[parts.length - 1]
  if (!last || /\d/.test(last) || last === candidate.name) return null
  return last
}

/**
 * Shape the row written by the mobile web trip + menu.
 *
 * Spots and stays must carry the selected destination as parent_step_id. The
 * trip timeline groups children exclusively through that key, so an otherwise
 * successful insert without it is indistinguishable from an add that did
 * nothing. Keeping this rule in one small function makes every CTA share it.
 */
export function buildTripQuickAddRow({
  kind,
  tripId,
  candidate,
  destination,
  tripStart,
  today = new Date().toISOString().slice(0, 10),
}: QuickAddInput): StepInsert {
  const hasCoordinates =
    candidate.latitude != null &&
    candidate.longitude != null &&
    !(candidate.latitude === 0 && candidate.longitude === 0)

  const common = {
    trip_id: tripId,
    location_name: candidate.name,
    title: candidate.name,
    latitude: hasCoordinates ? candidate.latitude ?? null : null,
    longitude: hasCoordinates ? candidate.longitude ?? null : null,
    country: countryFromPlace(candidate),
    city: candidate.name,
    place_category: candidate.primaryType ?? null,
  }

  if (kind === "destination") {
    return {
      ...common,
      step_type: "destination",
      date: tripStart?.slice(0, 10) || today,
      nights: 1,
    }
  }

  if (!destination) {
    throw new Error("Add a destination before adding a spot or stay.")
  }

  return {
    ...common,
    parent_step_id: destination.id,
    step_type: kind,
    date: destination.date.slice(0, 10) || tripStart?.slice(0, 10) || today,
    nights: kind === "stay" ? Math.max(1, destination.nights || 1) : 0,
  }
}
