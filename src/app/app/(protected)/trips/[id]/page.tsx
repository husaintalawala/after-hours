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
import { countryFlagEmoji } from "@/lib/drift/flags"
import TripTabs, {
  type DestinationVM,
  type ExpenseVM,
  type KitItemVM,
  type StepDetailVM,
  type BookingDetailVM,
  type LedgerVM,
} from "@/components/app/trip/TripTabs"
import { balances, minimalTransfers } from "@/lib/drift/balances"
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
  searchParams,
}: {
  params: { id: string }
  searchParams?: { ask?: string }
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

  // Trip hero cover: explicit cover → first photo media (iOS cover chain).
  let tripCover: string | null = trip.cover_url
  if (!tripCover) {
    const { data: media } = await supabase
      .from("media")
      .select("url,type,created_at")
      .eq("trip_id", trip.id)
      .eq("type", "photo")
      .order("created_at", { ascending: true })
      .limit(1)
      .returns<Array<{ url: string }>>()
    tripCover = media?.[0]?.url ?? null
  }
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

  // Destination view-models: day timeline. Hero photo is intentionally NOT
  // resolved here — a per-destination resolve-place→Google lookup (cache:
  // no-store) on the SSR path blocked opening a trip for 1-3s on a cold
  // lambda (same cause as the slow Chats list). heroUrl starts null and is
  // hydrated lazily on the client (TripTabs), falling back to the amber
  // gradient until it loads.
  const fmtShort = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number)
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
      month: "short", day: "numeric", timeZone: "UTC",
    })
  }
  const destVMs: DestinationVM[] = destinations.map((destination) => {
    const label = destination.title || destination.location_name || "Destination"
    const children = steps.filter((s) => s.parent_step_id === destination.id)
    const timeline = buildDestinationTimeline(destination, children, transport)
    const start = dateOnly(destination.date) ?? "1970-01-01"
    const nights = destination.nights ?? 0
    const days = groupTimelineByDay(timeline, start, nights)
    const arriving = transportRows.find((b) => b.to_destination_id === destination.id)
    return {
      id: destination.id,
      label,
      country: destination.country,
      nights,
      heroUrl: null,
      dateRange: `${fmtShort(start)} – ${fmtShort(addDaysStr(start, nights))}`,
      plansCount: children.length,
      bookedChip: arriving ? `${(MODE_LABEL[arriving.mode] ?? arriving.mode).toLowerCase()} booked` : null,
      lat: destination.latitude,
      lng: destination.longitude,
      days,
    }
  })

  // Steps that aren't parented to a known destination (flat/legacy trips, or
  // chat-added items whose destination was deleted) must not vanish — they
  // get a synthetic bucket at the end of the journey strip.
  const destIdSet = new Set(destinations.map((d) => d.id))
  // Dangling-parent steps (their destination was deleted) go to a synthetic
  // bucket. FLAT steps (no parent) are Track recordings on iOS — never Plan.
  const unassigned = steps.filter(
    (s) =>
      s.step_type !== "destination" &&
      s.parent_step_id != null &&
      !destIdSet.has(s.parent_step_id)
  )
  const trackSteps = steps
    .filter((s) => s.step_type !== "destination" && s.parent_step_id == null)
    .sort((a, b) => (dateOnly(a.date) ?? "").localeCompare(dateOnly(b.date) ?? ""))
    .map((s) => ({
      id: s.id,
      title: s.title || s.location_name || "Moment",
      subtitle: s.location_name,
      dateLabel: dateOnly(s.date) ? fmtShort(dateOnly(s.date)!) : "",
    }))
  if (unassigned.length) {
    const startD = dateOnly(trip.start_date) ?? dateOnly(unassigned[0].date) ?? "1970-01-01"
    const endD = dateOnly(trip.end_date) ?? startD
    const [sy, sm, sd] = startD.split("-").map(Number)
    const [ey, em, ed] = endD.split("-").map(Number)
    const spanNights = Math.max(
      0,
      Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000)
    )
    const synthDest = {
      id: "unassigned",
      trip_id: trip.id,
      step_type: "destination",
      parent_step_id: null,
      title: destinations.length ? "More stops" : trip.cities?.[0] ?? "Itinerary",
      location_name: null,
      country: trip.countries?.[0] ?? null,
      date: startD,
      nights: spanNights,
    } as unknown as StepRow
    // Transport legs pointing at destinations that no longer exist land here too.
    const orphanTransport = transport
      .filter(
        (b) =>
          (b.to_destination_id && !destIdSet.has(b.to_destination_id)) ||
          (b.from_destination_id && !destIdSet.has(b.from_destination_id))
      )
      .map((b) => ({
        ...b,
        to_destination_id:
          b.to_destination_id && !destIdSet.has(b.to_destination_id)
            ? "unassigned"
            : b.to_destination_id,
        from_destination_id:
          b.from_destination_id && !destIdSet.has(b.from_destination_id)
            ? "unassigned"
            : b.from_destination_id,
      }))
    const timeline = buildDestinationTimeline(synthDest, unassigned, orphanTransport)
    destVMs.push({
      id: "unassigned",
      label: synthDest.title as string,
      country: synthDest.country,
      nights: spanNights,
      heroUrl: null,
      dateRange: `${fmtShort(startD)} – ${fmtShort(endD)}`,
      plansCount: unassigned.length,
      bookedChip: null,
      lat: null,
      lng: null,
      days: groupTimelineByDay(timeline, startD, spanNights),
    })
  }

  // ---- Shared-ledger balances (ExpenseBalances port) ----
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const meId = session?.user?.id ?? ""
  const expenseIds = expenseRows.map((e) => e.id)
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const sb: any = supabase
  const [splitsRes, householdsRes, settlementsRes] = await Promise.all([
    expenseIds.length
      ? sb.from("expense_splits").select("expense_id,household_id,share_minor").in("expense_id", expenseIds)
      : Promise.resolve({ data: [] }),
    sb.from("households").select("id,name,member_user_ids").eq("trip_id", trip.id),
    sb.from("settlements").select("from_household,to_household,amount_minor,status").eq("trip_id", trip.id).eq("status", "recorded"),
  ])
  const splitRows: Array<{ expense_id: string; household_id: string; share_minor: number }> =
    splitsRes.data ?? []
  const householdRows: Array<{ id: string; name: string | null; member_user_ids: string[] }> =
    householdsRes.data ?? []
  const settlementRows: Array<{ from_household: string; to_household: string; amount_minor: number }> =
    settlementsRes.data ?? []

  // Member display names for household labels + payer attribution.
  const memberIds = [...new Set(householdRows.flatMap((h) => h.member_user_ids ?? []))]
  const memberNames = new Map<string, string>()
  if (memberIds.length) {
    const { data: profs } = await sb
      .from("profiles")
      .select("id,display_name,username")
      .in("id", memberIds)
    for (const p of profs ?? []) {
      memberNames.set(p.id, (p.display_name || p.username || "Traveler").split(" ")[0])
    }
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const payerLabel = (uid: string | null): string | null =>
    !uid ? null : uid === meId ? "You" : memberNames.get(uid) ?? null

  const expenseVMs: ExpenseVM[] = expenseRows.map((e) => ({
    id: e.id,
    label: e.label,
    subtitle: e.subtitle,
    amount: e.amount,
    currency: e.currency,
    category: e.category,
    expense_date: e.expense_date,
    payer: payerLabel(e.payer_user_id),
  }))

  let ledger: LedgerVM | null = null
  if (householdRows.length >= 2 && splitRows.length) {
    const bhs = householdRows.map((h) => ({
      id: h.id,
      memberUserIds: new Set(h.member_user_ids ?? []),
    }))
    // Paid per expense = the sum of its materialized splits (Σpaid = Σshare
    // by construction, so the zero-sum invariant holds without FX concerns).
    const shareByExpense = new Map<string, number>()
    for (const s of splitRows) {
      shareByExpense.set(s.expense_id, (shareByExpense.get(s.expense_id) ?? 0) + s.share_minor)
    }
    const paidByPayer = expenseRows.map((e) => ({
      payerUserId: e.payer_user_id,
      amountMinor: shareByExpense.get(e.id) ?? 0,
    }))
    const bals = balances(
      bhs,
      paidByPayer,
      splitRows.map((s) => ({ householdId: s.household_id, shareMinor: s.share_minor })),
      settlementRows.map((s) => ({
        fromHousehold: s.from_household,
        toHousehold: s.to_household,
        amountMinor: s.amount_minor,
      }))
    )
    const hLabel = (id: string): { label: string; mine: boolean } => {
      const h = householdRows.find((x) => x.id === id)
      const mine = !!h?.member_user_ids?.includes(meId)
      if (mine) return { label: "You", mine }
      const names = (h?.member_user_ids ?? []).map((m) => memberNames.get(m)).filter(Boolean)
      return { label: h?.name || names.join(" & ") || "Household", mine }
    }
    ledger = {
      rows: bals.map((b) => ({ ...hLabel(b.householdId), netMinor: b.netMinor })),
      transfers: minimalTransfers(bals).map((t) => ({
        from: hLabel(t.fromHousehold).label,
        to: hLabel(t.toHousehold).label,
        amountMinor: t.amountMinor,
      })),
    }
  }

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
          statusLine: tripStatusLine(trip.start_date, trip.end_date),
          cover: tripCover,
        }}
        trackSteps={trackSteps}
        ledger={ledger}
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
          prefill={searchParams?.ask ?? null}
          destinations={destVMs.map((d) => {
            // The synthetic "More stops" bucket has no steps row — fall back
            // to the trip's start date for its day math.
            const src = destinations.find((x) => x.id === d.id)
            return {
              id: d.id,
              date: src?.date ?? trip.start_date ?? "",
              nights: d.nights,
              label: d.label,
            }
          })}
        />
      </TripTabs>
    </main>
  )
}

function addDaysStr(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number)
  const t = Date.UTC(y, m - 1, d) + n * 86_400_000
  const dt = new Date(t)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`
}

function tripStatusLine(start: string | null, end: string | null): string {
  const today = new Date().toISOString().slice(0, 10)
  const s = start?.slice(0, 10)
  const e = end?.slice(0, 10)
  if (!s || !e) return ""
  const days =
    Math.round((Date.parse(e) - Date.parse(s)) / 86_400_000) + 1
  const lenLabel = `${days}-day trip`
  if (today < s) {
    const inDays = Math.round((Date.parse(s) - Date.parse(today)) / 86_400_000)
    return `Starts in ${inDays} day${inDays === 1 ? "" : "s"} · ${lenLabel}`
  }
  if (today > e) {
    const ago = Math.round((Date.parse(today) - Date.parse(e)) / 86_400_000)
    return `Ended ${ago} day${ago === 1 ? "" : "s"} ago · ${lenLabel}`
  }
  const dayN = Math.round((Date.parse(today) - Date.parse(s)) / 86_400_000) + 1
  return `Day ${dayN} of ${days}`
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
