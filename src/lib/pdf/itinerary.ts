// Itinerary document model — the web twin of iOS `ItineraryPDF.build(…)`.
//
// Pure: rows in, a fully-resolved document out. No React, no fetching, no
// rendering. Everything the PDF needs to draw is decided here, so the renderer
// stays a dumb projection of this shape and the two can be reasoned about (and
// tested) separately.
//
// Ordering, day bucketing and times come from `buildDestinationTimeline` +
// `groupTimelineByDay` — the SAME helpers the Plan tab renders from — so the
// printed itinerary matches the screen exactly, including the floating
// wall-clock contract for `scheduled_at` (see StepClock on iOS).

import type { StepRow, TransportBookingRow } from "@/lib/db-types"
import {
  buildDestinationTimeline,
  groupTimelineByDay,
  type TimelineItem,
  type TransportBookingLike,
} from "@/lib/drift/timeline"
import { addDays, compareDate, dateOnly, type DateStr } from "@/lib/drift/dates"

// ---------------------------------------------------------------- palette --

/** Approved tag palette for the light paper document. Fixed literals, not
 *  theme tokens: this is paper, so it never adapts to the exporter's theme. */
export const TAG_STYLE = {
  stay: { bg: "#EDE7FB", fg: "#6B4CC7" },
  restaurant: { bg: "#FBEAD6", fg: "#B96712" },
  activity: { bg: "#DFF4EF", fg: "#0E7A67" },
  sight: { bg: "#E2F1DE", fg: "#3C7A2E" },
  transit: { bg: "#E1ECFB", fg: "#2C63C0" },
} as const

/** The catch-all PLACE pill shares ACTIVITY's teal. */
const PLACE_STYLE = TAG_STYLE.activity

// ------------------------------------------------------------------ model --

export interface ItineraryTag {
  label: string // "STAY", "RESTAURANT", "FLIGHT"…
  bg: string
  fg: string
}

export interface ItineraryItem {
  id: string
  tag: ItineraryTag
  timeText: string // "9:30 AM", "Check-in", or "—"
  title: string
  /** `steps.address` (else a transport leg's route). Line omitted when null. */
  address: string | null
  /** `steps.notes`, else a `place-blurb` sentence for `steps.place_id`.
   *  NEVER fabricated: null when neither source has anything. */
  summary: string | null
  /** Reservation line under a dashed rule ("3 nights · Confirmation ABC123"). */
  booking: string | null
  /** Stays get the lavender wash. */
  tinted: boolean
}

export interface ItineraryDay {
  label: string // "Day 2"
  dateText: string // "Tue, Jul 7"
  items: ItineraryItem[]
}

export interface ItinerarySection {
  index: number | null // null on a single-destination trip
  name: string // "Lisbon"
  meta: string // "Portugal · 3 nights · Jul 6 – Jul 9"
  days: ItineraryDay[]
}

export interface ItineraryDocumentModel {
  title: string
  destinationsLine: string // "LISBON · PORTO · SINTRA"
  dateRangeText: string // "Jul 6 – Jul 13, 2026"
  stats: { label: string; value: string }[]
  sections: ItinerarySection[]
  /** Shown in place of the itinerary when the trip has no stops yet. */
  emptyNote: string | null
  /** Cover photo as a data URI, or null → the brand gradient band. */
  coverDataUri: string | null
  /** Photographer credit for a sourced-stock cover. Non-null ⇒ MUST be printed
   *  (rendering rung-3 pixels without it is the ToS violation the trip-cover
   *  chain's `credit` field exists to prevent). */
  coverCredit: string | null
  fileName: string
}

export interface BuildInput {
  tripTitle: string | null
  tripCities: string[] | null
  tripCountries: string[] | null
  startDate: string | null
  endDate: string | null
  destinations: StepRow[]
  allSteps: StepRow[]
  bookings: TransportBookingRow[]
  travelerCount: number
  /** place_id → sourced blurb. Empty map is fine — descriptions just drop out. */
  blurbs?: Record<string, string>
  coverDataUri?: string | null
  coverCredit?: string | null
  modeLabel: (mode: string) => string
}

// ----------------------------------------------------------------- builder --

export function buildItineraryDocument(input: BuildInput): ItineraryDocumentModel {
  const blurbs = input.blurbs ?? {}
  const dests = [...input.destinations].sort((a, b) =>
    compareDate(dateOnly(a.date) ?? "", dateOnly(b.date) ?? "")
  )
  const multi = dests.length > 1

  // The timeline flattens steps and bookings into a uniform row shape, so keep
  // the originals reachable: the card's tag, address, notes and confirmation
  // all live on the underlying record, not on the row.
  const stepById = new Map(input.allSteps.map((s) => [s.id, s]))
  const bookingById = new Map(input.bookings.map((b) => [b.id, b]))

  const transport: TransportBookingLike[] = input.bookings.map((b) => ({
    id: b.id,
    to_destination_id: b.to_destination_id,
    from_destination_id: b.from_destination_id,
    arrival_at: b.arrival_at,
    departure_at: b.departure_at,
    modeDisplayName: input.modeLabel(b.mode),
    title:
      b.title ||
      [b.operator_name, b.flight_number].filter(Boolean).join(" ") ||
      input.modeLabel(b.mode) ||
      "Travel",
    departure_location: b.departure_location,
    arrival_location: b.arrival_location,
  }))

  // A transport leg is BOTH the outbound of one stop and the inbound of the
  // next, so a linear read of every destination would print the same flight
  // twice. Keep the first occurrence (chronologically the departure) and drop
  // the echo.
  const seenTransport = new Set<string>()

  const sections: ItinerarySection[] = []
  let itemCount = 0

  dests.forEach((dest, i) => {
    const kids = input.allSteps.filter(
      (s) => s.parent_step_id === dest.id && s.step_type !== "destination"
    )
    const timeline = buildDestinationTimeline(dest, kids, transport)
    const destStart = dateOnly(dest.date) ?? dateOnly(input.startDate) ?? "1970-01-01"
    const nights = dest.nights ?? 0
    const grouped = groupTimelineByDay(timeline, destStart, nights)

    const days: ItineraryDay[] = grouped.map((day) => {
      const items: ItineraryItem[] = []
      for (const item of day.items) {
        const isTransport =
          item.type === "transportInbound" || item.type === "transportOutbound"
        if (isTransport) {
          if (seenTransport.has(item.id)) continue
          seenTransport.add(item.id)
        }
        items.push(
          card(
            item,
            item.linkedStepId ? stepById.get(item.linkedStepId) ?? null : null,
            isTransport ? bookingById.get(item.id) ?? null : null,
            blurbs
          )
        )
      }
      itemCount += items.length
      return {
        label: `Day ${day.dayNumber}`,
        dateText: weekdayDate(day.date),
        items,
      }
    })

    sections.push({
      index: multi ? i + 1 : null,
      name: dest.location_name || dest.title || `Destination ${i + 1}`,
      meta: sectionMeta(dest, destStart, nights),
      days,
    })
  })

  // ---- Header lines ----
  const names = dests
    .map((d) => d.location_name || d.title || "")
    .filter((n) => n.length > 0)
  const fallbackNames = [
    ...(input.tripCities ?? []),
    ...(input.tripCountries ?? []),
  ].filter((n): n is string => !!n && n.length > 0)
  const source = names.length ? names : fallbackNames
  const destinationsLine = !source.length
    ? "ITINERARY"
    : (() => {
        // Long multi-city trips would run off the cover — cap and elide.
        const shown = source
          .slice(0, 4)
          .map((s) => s.toUpperCase())
          .join("  ·  ")
        return source.length > 4 ? `${shown}  ·  +${source.length - 4}` : shown
      })()

  const start =
    dateOnly(input.startDate) ?? (dests.length ? dateOnly(dests[0].date) : null)
  const lastDest = dests[dests.length - 1]
  const end =
    dateOnly(input.endDate) ??
    (lastDest
      ? (() => {
          const d = dateOnly(lastDest.date)
          return d ? addDays(d, lastDest.nights ?? 0) : null
        })()
      : null)

  const stats: { label: string; value: string }[] = []
  if (start && end) {
    const days = Math.max(1, daysBetween(start, end) + 1)
    stats.push({ label: "Days", value: String(days) })
  }
  // "Stops" is the trip's destinations — the same count the Plan tab prints
  // next to "Your stops". A flat trip with no destination rows falls back to
  // the number of planned items so the band never reads 0 on a full itinerary.
  stats.push({ label: "Stops", value: String(dests.length || itemCount) })
  stats.push({ label: "Travelers", value: String(Math.max(1, input.travelerCount)) })
  const countries = new Set(
    [
      ...dests.map((d) => d.country).filter((c): c is string => !!c),
      ...(input.tripCountries ?? []).filter((c): c is string => !!c),
    ].map((c) => c.trim().toLowerCase())
  )
  if (countries.size) stats.push({ label: "Countries", value: String(countries.size) })

  const emptyNote = !dests.length
    ? "No stops planned yet. Add destinations in Drift and export again — this page will fill itself in."
    : itemCount === 0
      ? "The route is set, but nothing is booked into the days yet."
      : null

  const title = input.tripTitle?.trim() || "Untitled trip"

  return {
    title,
    destinationsLine,
    dateRangeText: rangeText(start, end),
    stats,
    sections,
    emptyNote,
    coverDataUri: input.coverDataUri ?? null,
    coverCredit: input.coverDataUri ? input.coverCredit ?? null : null,
    fileName: `${sanitizeFileName(title)} — Itinerary.pdf`,
  }
}

// ------------------------------------------------------------------- cards --

function card(
  item: TimelineItem,
  step: StepRow | null,
  booking: TransportBookingRow | null,
  blurbs: Record<string, string>
): ItineraryItem {
  const timeText =
    item.startTimeMinutes != null
      ? clock(item.startTimeMinutes)
      : item.type === "stay"
        ? "Check-in"
        : "—"

  // Address: the step's own, else the transport leg's route line.
  const address =
    trimmed(step?.address) ?? (booking ? trimmed(item.subtitle) : null)

  // Description, sourced never invented: the user's note first, then a cached
  // place-blurb for this place_id. Nothing else.
  const summary =
    trimmed(step?.notes) ??
    (step?.place_id ? trimmed(blurbs[step.place_id]) : null)

  return {
    id: item.id,
    tag: tagFor(item, step, booking),
    timeText,
    title: item.title,
    address,
    summary,
    booking: bookingMeta(item, step, booking),
    tinted: item.type === "stay",
  }
}

/** The card's type pill. Bookings resolve off `mode`; steps off `step_type`
 *  first, then `place_category`. Verbatim port of iOS `ItineraryPDF.tag(…)`. */
function tagFor(
  item: TimelineItem,
  step: StepRow | null,
  booking: TransportBookingRow | null
): ItineraryTag {
  const make = (label: string, style: { bg: string; fg: string }): ItineraryTag => ({
    label,
    bg: style.bg,
    fg: style.fg,
  })

  if (booking) {
    switch (booking.mode) {
      case "flight":
        return make("FLIGHT", TAG_STYLE.transit)
      case "rental_car":
        return make("CAR RENTAL", TAG_STYLE.transit)
      case "car":
        return make("DRIVE", TAG_STYLE.transit)
      default:
        return make(booking.mode.replace(/_/g, " ").toUpperCase(), TAG_STYLE.transit)
    }
  }

  if (step?.step_type === "stay" || item.type === "stay") {
    return make("STAY", TAG_STYLE.stay)
  }

  const cat = (step?.place_category ?? "").toLowerCase().replace(/ /g, "_")
  const catIs = (values: string[]) => values.includes(cat)

  // Eat-and-drink categories all read as RESTAURANT — a café tagged PLACE next
  // to a restaurant tagged RESTAURANT is a distinction the reader can't act on.
  if (
    catIs([
      "restaurant", "food", "dining", "meal_takeaway", "meal_delivery",
      "cafe", "bakery", "bar", "pub", "night_club",
    ])
  ) {
    return make("RESTAURANT", TAG_STYLE.restaurant)
  }
  if (
    step?.step_type === "activity" ||
    item.type === "activity" ||
    catIs(["activity", "amusement_park", "zoo", "aquarium", "spa"])
  ) {
    return make("ACTIVITY", TAG_STYLE.activity)
  }
  if (
    catIs([
      "park", "national_park", "garden", "botanical_garden", "nature",
      "tourist_attraction", "point_of_interest", "landmark", "monument",
      "museum", "art_gallery", "gallery", "castle", "historical_landmark",
      "church", "place_of_worship", "cathedral", "temple",
      "beach", "viewpoint", "scenic_lookout", "scenic_spot",
    ])
  ) {
    return make("SIGHT", TAG_STYLE.sight)
  }
  // A step carrying its own transport mode is a driving leg.
  const mode = trimmed(step?.transport_mode)
  if (mode) {
    return make(mode === "car" ? "DRIVE" : mode.toUpperCase(), TAG_STYLE.transit)
  }
  return make("PLACE", PLACE_STYLE)
}

/** The reservation line under the dashed rule. null when there is nothing
 *  booked to state. */
function bookingMeta(
  item: TimelineItem,
  step: StepRow | null,
  booking: TransportBookingRow | null
): string | null {
  const parts: string[] = []
  if (item.type === "stay" && step?.nights && step.nights > 0) {
    parts.push(`${step.nights} night${step.nights === 1 ? "" : "s"}`)
  }
  if (item.durationMinutes && item.durationMinutes > 0 && item.type !== "stay") {
    parts.push(durationText(item.durationMinutes))
  }
  const confirmation = trimmed(booking?.confirmation_number ?? step?.confirmation_number)
  if (confirmation) parts.push(`Confirmation ${confirmation}`)
  const seat = trimmed(booking?.seat)
  if (seat) parts.push(`Seat ${seat}`)
  if (step?.guest_count && step.guest_count > 0) {
    parts.push(`${step.guest_count} guest${step.guest_count === 1 ? "" : "s"}`)
  }
  return parts.length ? parts.join("  ·  ") : null
}

// ------------------------------------------------------------------ format --

function sectionMeta(dest: StepRow, start: DateStr, nights: number): string {
  const parts: string[] = []
  const where = dest.country || dest.city
  if (where) parts.push(where)
  if (nights > 0) parts.push(`${nights} night${nights === 1 ? "" : "s"}`)
  parts.push(rangeText(start, addDays(start, nights)))
  return parts.join("  ·  ")
}

/** All date formatting goes through UTC-anchored `Date`s built from the
 *  date-only string — the rows carry destination wall clock, never an instant,
 *  so a local-timezone parse would slide a whole day. */
function utcDate(d: DateStr): Date {
  const [y, m, day] = d.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, day))
}

function fmt(d: DateStr, opts: Intl.DateTimeFormatOptions): string {
  return utcDate(d).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" })
}

function weekdayDate(d: DateStr): string {
  return fmt(d, { weekday: "short", month: "short", day: "numeric" })
}

export function rangeText(start: DateStr | null, end: DateStr | null): string {
  if (!start) return "Dates to be confirmed"
  const long = (d: DateStr) => fmt(d, { month: "short", day: "numeric", year: "numeric" })
  if (!end || end === start) return long(start)
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  const head = sameYear ? fmt(start, { month: "short", day: "numeric" }) : long(start)
  return `${head} – ${long(end)}`
}

function daysBetween(a: DateStr, b: DateStr): number {
  return Math.round((utcDate(b).getTime() - utcDate(a).getTime()) / 86_400_000)
}

/** Minutes-from-midnight → "9:30 AM". The value is already the destination's
 *  wall clock, so it is formatted, never converted. */
function clock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  const ampm = h < 12 ? "AM" : "PM"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`
}

function durationText(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function trimmed(s: string | null | undefined): string | null {
  const t = s?.trim()
  return t ? t : null
}

function sanitizeFileName(s: string): string {
  const cleaned = s.replace(/[/\\:?%*|"<>]/g, " ").trim()
  return (cleaned || "Trip").slice(0, 60)
}
