import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type {
  StepRow,
  TripRow,
  TransportBookingRow,
  ExpenseRow,
  KitItemRow,
} from "@/lib/db-types"
import {
  buildDestinationTimeline,
  groupTimelineByDay,
  type TransportBookingLike,
} from "@/lib/drift/timeline"
import { compareDate, dateOnly } from "@/lib/drift/dates"
import { destinationPhotoUrl } from "@/lib/drift/placePhoto"
import { countryFlagEmoji } from "@/lib/drift/flags"
import TripTabs, {
  type DestinationVM,
  type ExpenseVM,
  type KitItemVM,
  type StepDetailVM,
  type BookingDetailVM,
} from "@/components/app/trip/TripTabs"
import TripChat from "@/components/app/chat/TripChat"

// Trip workspace — web port of TripStepScrollView: title header, 4-tab strip
// (Plan · Kit · Expenses · Track), DestinationDaysView-style Plan tab (hero +
// day filmstrip + timeline incl. transport legs), embedded Ask-Drift chat.

const MODE_LABEL: Record<string, string> = {
  car: "Drive", motorbike: "Motorbike", bike: "Bike", hike: "Hike",
  bus: "Bus", train: "Train", flight: "Flight", sailboat: "Ferry", direct: "Travel",
}

export default async function TripDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createClient()

  const { data: tripRaw } = await supabase
    .from("trips")
    .select("*")
    .eq("id", params.id)
    .maybeSingle()
  const trip = tripRaw as TripRow | null
  if (!trip) notFound()

  const [{ data: stepsRaw }, { data: transportRaw }, { data: expensesRaw }, { data: kitRaw }] =
    await Promise.all([
      supabase.from("steps").select("*").eq("trip_id", trip.id),
      supabase.from("transport_bookings").select("*").eq("trip_id", trip.id),
      supabase.from("expenses").select("*").eq("trip_id", trip.id),
      supabase.from("kit_items").select("*").eq("trip_id", trip.id),
    ])

  const steps = (stepsRaw ?? []) as StepRow[]
  const transportRows = (transportRaw ?? []) as TransportBookingRow[]
  const expenseRows = (expensesRaw ?? []) as ExpenseRow[]
  const kitRows = (kitRaw ?? []) as KitItemRow[]
  const destinations = steps
    .filter((s) => s.step_type === "destination" && !s.parent_step_id)
    .sort((a, b) => compareDate(dateOnly(a.date) ?? "", dateOnly(b.date) ?? ""))

  const transport: TransportBookingLike[] = transportRows.map((b) => ({
    id: b.id,
    to_destination_id: b.to_destination_id,
    from_destination_id: b.from_destination_id,
    arrival_at: b.arrival_at,
    departure_at: b.departure_at,
    modeDisplayName: MODE_LABEL[b.mode] ?? b.mode,
    title:
      b.title ||
      [b.operator_name, b.flight_number].filter(Boolean).join(" ") ||
      MODE_LABEL[b.mode] ||
      "Travel",
    departure_location: b.departure_location,
    arrival_location: b.arrival_location,
  }))

  // Destination view-models: hero photo (shared POI cache) + day timeline.
  const destVMs: DestinationVM[] = await Promise.all(
    destinations.map(async (destination) => {
      const label = destination.title || destination.location_name || "Destination"
      const children = steps.filter((s) => s.parent_step_id === destination.id)
      const timeline = buildDestinationTimeline(destination, children, transport)
      const days = groupTimelineByDay(
        timeline,
        dateOnly(destination.date) ?? "1970-01-01",
        destination.nights ?? 0
      )
      return {
        id: destination.id,
        label,
        country: destination.country,
        nights: destination.nights ?? 0,
        heroUrl: await destinationPhotoUrl(label, destination.country),
        days,
      }
    })
  )

  const expenseVMs: ExpenseVM[] = expenseRows.map((e) => ({
    id: e.id,
    label: e.label,
    subtitle: e.subtitle,
    amount: e.amount,
    currency: e.currency,
    category: e.category,
    expense_date: e.expense_date,
  }))

  const kitVMs: KitItemVM[] = kitRows
    .filter((k) => k.state !== "dismissed")
    .map((k) => ({
      id: k.id,
      title: k.title,
      category: k.category,
      phase: k.phase,
      state: k.state,
      quantity: k.quantity,
    }))

  // Inspector detail maps.
  const fmtDate = (iso: string | null) => {
    const d = dateOnly(iso)
    if (!d) return null
    const [y, mo, day] = d.split("-").map(Number)
    return new Date(Date.UTC(y, mo - 1, day)).toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
    })
  }
  const fmtTime = (iso: string | null) => {
    const m = iso ? /T(\d{2}):(\d{2})/.exec(iso) : null
    if (!m) return null
    const h = Number(m[1]), min = m[2]
    const ampm = h < 12 ? "am" : "pm"
    const h12 = h % 12 === 0 ? 12 : h % 12
    return `${h12}:${min}${ampm}`
  }
  const stepDetails: Record<string, StepDetailVM> = {}
  for (const s of steps) {
    if (s.step_type === "destination") continue
    stepDetails[s.id] = {
      id: s.id,
      title: s.title || s.location_name || "Untitled",
      badge: s.place_category || s.step_type || "",
      dateLabel: fmtDate(s.date),
      timeLabel: fmtTime(s.scheduled_at),
      durationMinutes: s.duration_minutes,
      notes: s.notes,
      address: s.address,
      lat: s.latitude,
      lng: s.longitude,
      bookingUrl: s.booking_url,
      websiteUrl: s.website_url,
      importProvider: s.import_source_provider,
      confirmationNumber: s.confirmation_number,
      guestCount: s.guest_count,
    }
  }
  const bookingDetails: Record<string, BookingDetailVM> = {}
  for (const b of transportRows) {
    const route = [b.departure_location, b.arrival_location]
      .filter(Boolean)
      .join(" → ")
    const fmtDT = (iso: string | null) =>
      iso ? [fmtDate(iso), fmtTime(iso)].filter(Boolean).join(" · ") : null
    bookingDetails[b.id] = {
      id: b.id,
      title:
        b.title ||
        [b.operator_name, b.flight_number].filter(Boolean).join(" ") ||
        MODE_LABEL[b.mode] ||
        "Travel",
      modeLabel: MODE_LABEL[b.mode] ?? b.mode,
      route: route || null,
      departLabel: fmtDT(b.departure_at),
      arriveLabel: fmtDT(b.arrival_at),
      confirmation: b.confirmation_number,
      seat: b.seat,
      provider: b.provider ?? b.operator_name,
      bookingUrl: b.booking_url,
    }
  }

  const flag = countryFlagEmoji(trip.countries?.[0])

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-4 lg:max-w-[1400px] lg:px-8 lg:pt-6">
      <TripTabs
        tripId={trip.id}
        tripMeta={{
          title: trip.title || "Untitled trip",
          flag,
          dateRange: tripSubtitle(trip),
        }}
        destinations={destVMs}
        stepDetails={stepDetails}
        bookingDetails={bookingDetails}
        expenses={expenseVMs}
        kitItems={kitVMs}
      >
        <TripChat
          tripId={trip.id}
          tripTitle={trip.title || "your trip"}
          tripStart={trip.start_date ?? null}
          country={trip.countries?.[0] ?? null}
          fill
          destinations={destVMs.map((d) => {
            const src = destinations.find((x) => x.id === d.id)!
            return {
              id: d.id,
              date: src.date,
              nights: d.nights,
              label: d.label,
            }
          })}
        />
      </TripTabs>
    </main>
  )
}

function tripSubtitle(trip: {
  cities?: string[] | null
  countries?: string[] | null
  start_date?: string | null
  end_date?: string | null
}): string {
  const place =
    trip.cities?.filter(Boolean).join(", ") ||
    trip.countries?.filter(Boolean).join(", ") ||
    ""
  const fmt = (iso?: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        })
      : ""
  const range = [fmt(trip.start_date), fmt(trip.end_date)].filter(Boolean).join(" – ")
  return [place, range].filter(Boolean).join(" · ")
}
