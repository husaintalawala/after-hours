// Verbatim port of Drift iOS Core/DestinationTimeline.swift — day bucketing +
// effective-time ordering. Do NOT re-derive; this logic encodes already-fixed
// timezone bugs (bucket by date-only `date`, clamp out-of-range child steps to
// the nearest destination day). Ported to tz-safe date-only strings (see dates.ts).

import type { StepRow } from "@/lib/db-types"
import {
  addDays,
  clampDate,
  compareDate,
  dateOnly,
  minutesOfDayFromIso,
  type DateStr,
} from "./dates"

export type ItemType =
  | "transportInbound"
  | "stay"
  | "spot"
  | "activity"
  | "transportOutbound"

export interface TimelineItem {
  id: string
  type: ItemType
  title: string
  subtitle: string | null
  date: DateStr // calendar day this item buckets into
  startTimeMinutes: number | null // minutes-from-midnight, or null if unscheduled
  durationMinutes: number | null
  badge: string
  linkedStepId: string | null
  latitude: number | null
  longitude: number | null
}

export interface DestinationDay {
  dayNumber: number // 1-indexed
  date: DateStr
  items: TimelineItem[]
}

// Minimal transport-booking shape (Phase 1 passes []; kept so the port stays
// faithful and transport can light up later without touching this file).
export interface TransportBookingLike {
  id: string
  to_destination_id: string | null
  from_destination_id: string | null
  arrival_at: string | null
  departure_at: string | null
  modeDisplayName: string
  title: string | null
  departure_location: string | null
  arrival_location: string | null
}

function mapStepType(raw: string): ItemType | null {
  switch (raw) {
    case "stay":
      return "stay"
    case "spot":
    case "food":
      return "spot" // restaurants come through as "food"
    case "activity":
      return "activity"
    default:
      return null
  }
}

function stepSubtitle(s: StepRow): string | null {
  if (s.place_category) return humanizePlaceCategory(s.place_category)
  if (s.address) return s.address
  return s.location_name ?? null
}

function placeBadge(s: StepRow): string {
  if (s.place_category) return humanizePlaceCategory(s.place_category).toUpperCase()
  return "PLACE"
}

export function buildDestinationTimeline(
  destination: StepRow,
  childSteps: StepRow[],
  transportBookings: TransportBookingLike[] = []
): TimelineItem[] {
  const destStart = dateOnly(destination.date) ?? "1970-01-01"
  const nights = destination.nights ?? 0
  const destEnd = addDays(destStart, nights)

  const items: TimelineItem[] = []

  // Inbound transport — bookings arriving AT this destination.
  for (const b of transportBookings.filter((b) => b.to_destination_id === destination.id)) {
    const arrive = dateOnly(b.arrival_at) ?? dateOnly(b.departure_at) ?? destStart
    const start =
      minutesOfDayFromIso(b.arrival_at) ?? minutesOfDayFromIso(b.departure_at)
    items.push({
      id: b.id,
      type: "transportInbound",
      title: b.title ?? "Travel",
      subtitle: routeSubtitle(b),
      date: arrive,
      startTimeMinutes: meaningful(start),
      durationMinutes: null,
      badge: b.modeDisplayName.toUpperCase(),
      linkedStepId: null,
      latitude: null,
      longitude: null,
    })
  }

  // Outbound transport — bookings leaving FROM this destination.
  for (const b of transportBookings.filter((b) => b.from_destination_id === destination.id)) {
    const depart = dateOnly(b.departure_at) ?? destEnd
    items.push({
      id: b.id,
      type: "transportOutbound",
      title: b.title ?? "Travel",
      subtitle: routeSubtitle(b),
      date: depart,
      startTimeMinutes: meaningful(minutesOfDayFromIso(b.departure_at)),
      durationMinutes: null,
      badge: b.modeDisplayName.toUpperCase(),
      linkedStepId: null,
      latitude: null,
      longitude: null,
    })
  }

  // Child steps — stays, spots, activities.
  for (const s of childSteps) {
    if (!s.step_type) continue
    const type = mapStepType(s.step_type)
    if (!type) continue

    // Bucket by date-only `date` FIRST (tz-safe). scheduled_at is only used for
    // ordering within a day. Then defensively clamp a child step whose date
    // lands outside its parent destination's day-range onto the nearest day, so
    // an out-of-range chat-added item doesn't silently vanish.
    const raw = dateOnly(s.date) ?? destStart
    const dayDate = clampDate(raw, destStart, destEnd)

    const badge =
      type === "stay" ? "HOTEL" : type === "spot" ? placeBadge(s) : "ACTIVITY"

    items.push({
      id: s.id,
      type,
      title: s.title ?? s.location_name ?? "Untitled",
      subtitle: stepSubtitle(s),
      date: dayDate,
      startTimeMinutes: minutesOfDayFromIso(s.scheduled_at),
      durationMinutes: s.duration_minutes ?? null,
      badge,
      linkedStepId: s.id,
      latitude: s.latitude ?? null,
      longitude: s.longitude ?? null,
    })
  }

  // Sort each day in TRUE chronological order via an effective time: scheduled
  // items use their real time; unscheduled items slot by nature (arrivals open
  // the day, departures close it, check-ins mid-afternoon, loose stops midday),
  // then by display_order (manual drag order) when both items carry one.
  const displayOrderById = new Map<string, number>()
  for (const s of childSteps) {
    if (s.display_order != null && s.id) displayOrderById.set(s.id, s.display_order)
  }

  const effMinutes = (it: TimelineItem): number => {
    if (it.startTimeMinutes != null) return it.startTimeMinutes
    switch (it.type) {
      case "transportInbound":
        return 0 // arrivals lead the day
      case "transportOutbound":
        return 23 * 60 // departures close the day
      case "stay":
        return 15 * 60 // check-in mid-afternoon
      default:
        return 12 * 60 // loose daytime stops
    }
  }

  items.sort((a, b) => {
    if (a.date !== b.date) return compareDate(a.date, b.date)
    // Manual order is authoritative ONLY when BOTH items carry one.
    const aOrder = a.linkedStepId != null ? displayOrderById.get(a.linkedStepId) : undefined
    const bOrder = b.linkedStepId != null ? displayOrderById.get(b.linkedStepId) : undefined
    if (aOrder != null && bOrder != null && aOrder !== bOrder) return aOrder - bOrder
    const ta = effMinutes(a)
    const tb = effMinutes(b)
    if (ta !== tb) return ta - tb
    const ao = aOrder ?? Number.MAX_SAFE_INTEGER
    const bo = bOrder ?? Number.MAX_SAFE_INTEGER
    if (ao !== bo) return ao - bo
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  return items
}

/** Bucket flat items into one DestinationDay per calendar day in the
 *  destination range, INCLUDING empty days (keeps the day strip stable). */
export function groupTimelineByDay(
  items: TimelineItem[],
  destinationStart: DateStr,
  nights: number
): DestinationDay[] {
  const dayCount = Math.max(1, nights + 1) // 2 nights = 3 calendar days
  const buckets: DestinationDay[] = []
  for (let n = 0; n < dayCount; n++) {
    const dayDate = addDays(destinationStart, n)
    buckets.push({
      dayNumber: n + 1,
      date: dayDate,
      items: items.filter((it) => it.date === dayDate),
    })
  }
  return buckets
}

function routeSubtitle(b: TransportBookingLike): string | null {
  const parts = [b.departure_location, b.arrival_location].filter(
    (p): p is string => !!p && p.length > 0
  )
  return parts.length ? parts.join(" → ") : null
}

// Treat a T00:00 (date-only import serialized as midnight) as "no meaningful
// time" so the itinerary never invents a midnight flight.
function meaningful(mins: number | null): number | null {
  return mins != null && mins !== 0 ? mins : null
}

// Map raw category strings (Google Places types or our lowercase strings) into
// traveler-language labels. Verbatim from humanizePlaceCategory (iOS).
export function humanizePlaceCategory(raw: string): string {
  const key = raw.toLowerCase().replace(/ /g, "_")
  switch (key) {
    case "tourist_attraction":
    case "point_of_interest":
    case "landmark":
    case "monument":
      return "Landmark"
    case "scenic_spot":
    case "scenic_lookout":
    case "viewpoint":
      return "Viewpoint"
    case "castle":
    case "historical_landmark":
      return "Castle"
    case "museum":
    case "art_gallery":
    case "gallery":
      return "Museum"
    case "park":
    case "national_park":
    case "garden":
    case "botanical_garden":
      return "Park"
    case "beach":
      return "Beach"
    case "church":
    case "place_of_worship":
    case "cathedral":
    case "mosque":
    case "temple":
    case "synagogue":
      return "Church"
    case "restaurant":
    case "meal_takeaway":
    case "meal_delivery":
      return "Dinner"
    case "cafe":
    case "bakery":
      return "Café"
    case "bar":
    case "night_club":
    case "pub":
      return "Bar"
    case "lodging":
    case "hotel":
      return "Hotel"
    case "amusement_park":
    case "zoo":
    case "aquarium":
      return "Activity"
    case "spa":
      return "Spa"
    case "gym":
    case "fitness":
      return "Gym"
    case "shopping_mall":
    case "shopping":
    case "store":
    case "clothing_store":
    case "department_store":
      return "Shopping"
    case "airport":
      return "Airport"
    case "train_station":
      return "Train station"
    case "bus_station":
      return "Bus station"
    default:
      return raw
        .replace(/_/g, " ")
        .toLowerCase()
        .split(" ")
        .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
        .join(" ")
  }
}
