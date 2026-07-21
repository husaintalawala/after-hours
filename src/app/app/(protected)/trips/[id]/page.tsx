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

  const flag = countryFlagEmoji(trip.countries?.[0])

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6">
      <Link href="/app" className="text-sm text-drift-muted hover:text-drift-ink">
        ← Trips
      </Link>

      <header className="mt-3">
        <h1 className="font-drift-display text-3xl font-medium tracking-tight">
          {trip.title || "Untitled trip"} {flag && <span className="text-2xl">{flag}</span>}
        </h1>
        <p className="mt-1 text-drift-muted">{tripSubtitle(trip)}</p>
      </header>

      <TripTabs destinations={destVMs} expenses={expenseVMs} kitItems={kitVMs}>
        <TripChat
          tripId={trip.id}
          tripTitle={trip.title || "your trip"}
          tripStart={trip.start_date ?? null}
          country={trip.countries?.[0] ?? null}
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
