// The single source of truth for "which imported bookings are worth showing".
//
// This exists because the count and the list used to be computed separately.
// ScanStatus announced `segments_matched - segments_applied` straight off the
// import_batches counters, while FindBookings rendered
// buildReviewList(rows, scope, itinerary). Those are two different
// populations: the counters are written at scan time, before anything is
// judged against the trip, whereas buildReviewList drops clusters that are
// already on the itinerary, were dismissed, or don't anchor to the trip at all
// (anchorsToTrip — a matching place, or a date inside the window ± buffer).
//
// On a live trip the two mostly coincide, so the split went unnoticed. On a
// PAST trip it breaks badly: a calendar sweep matches recent events, the
// banner announces "Found 4 bookings", every one of them fails anchorsToTrip
// because they are nowhere near the trip's dates or places, and the review
// screen opens empty.
//
// The rule now: any surface that says a number and any surface that renders
// the rows must both come from here. A count that can disagree with its list
// eventually will.

import {
  buildReviewList,
  objectIdentityKeys,
  type ItineraryKeys,
  type ReviewSegmentRow,
  type TripScope,
} from "@/lib/drift/reviewSegments"

export interface SegmentVM {
  id: string
  /** Every segment id this card stands for (duplicates collapsed into it) —
   *  dismissing the card has to dismiss all of them, or the twin comes back. */
  ids: string[]
  /** Batches every member of the cluster came from — a scan-scoped review
   *  keeps the card if THIS scan found any copy of the booking. */
  batchIds: string[]
  /** The representative's batch, used as the apply-import-batch anchor. */
  batchId: string | null
  category: string
  label: string
  sub: string
  needsReview: boolean
}

function cap(s: string | null): string | null {
  if (!s) return null
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Load the reviewable bookings for a trip, already deduped, already stripped
 * of anything applied/dismissed/out-of-scope.
 *
 * @param reviewBatchId when set, narrows to bookings THIS scan found (a
 *   cluster counts if any of its members came from that batch), so a
 *   scan-scoped banner and its review screen agree.
 */
/** TEMPORARY, demo only — see buildReviewList's ReviewListOptions.
 *
 *  Sticky on purpose. Reading window.location.search alone did not work: the
 *  parameter is present when the trip page loads, but opening "Find bookings"
 *  is a client-side transition and the query string is gone by the time this
 *  runs. Latching it into sessionStorage on first sight makes it survive for
 *  the rest of the tab, which is what recording a video needs.
 *
 *  Clear it by closing the tab, or ?showDismissed=0. */
function demoShowDismissed(): boolean {
  if (typeof window === "undefined") return false
  const KEY = "drift.demo.showDismissed"
  const param = new URLSearchParams(window.location.search).get("showDismissed")
  try {
    if (param === "1") {
      window.sessionStorage.setItem(KEY, "1")
      return true
    }
    if (param === "0") {
      window.sessionStorage.removeItem(KEY)
      return false
    }
    return window.sessionStorage.getItem(KEY) === "1"
  } catch {
    return param === "1"
  }
}

export async function loadReviewList(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  tripId: string,
  reviewBatchId?: string | null
): Promise<SegmentVM[]> {
  // Pull EVERY segment for the trip — applied and ignored included. They're
  // never rendered, but buildReviewList needs them to recognise a duplicate
  // of something already added, or a booking the user dismissed.
  const [segRes, tripRes, stepRes, transportRes] = await Promise.all([
    db
      .from("reservation_segments")
      .select(
        "id, category, status, title, origin_name, origin_code, destination_name, destination_code, starts_at, ends_at, address, confirmation_number, dedupe_key, needs_review, parsed_reservation_id, applied_at, applied_object_id, created_at"
      )
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false })
      .limit(300),
    db.from("trips").select("start_date, end_date, cities, countries").eq("id", tripId).limit(1),
    db
      .from("steps")
      .select("id, step_type, city, title, location_name, confirmation_number, dedupe_key, date, scheduled_at")
      .eq("trip_id", tripId)
      .limit(400),
    db
      .from("transport_bookings")
      .select("id, confirmation_number, dedupe_key, mode, title, departure_at, departure_code, arrival_code, departure_location, arrival_location")
      .eq("trip_id", tripId)
      .limit(200),
  ])

  const rows: ReviewSegmentRow[] = segRes?.data ?? []
  if (rows.length === 0) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trip: any = tripRes?.data?.[0] ?? null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const steps: any[] = stepRes?.data ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transport: any[] = transportRes?.data ?? []

  // Trip scope: the window plus the places the trip actually covers. Only
  // destination steps contribute place names — a spot in New York on the way
  // out would otherwise anchor every New York booking to this trip.
  const scope: TripScope = {
    startDay: trip?.start_date ? String(trip.start_date).slice(0, 10) : null,
    endDay: trip?.end_date ? String(trip.end_date).slice(0, 10) : null,
    places: [
      ...(trip?.cities ?? []),
      ...(trip?.countries ?? []),
      ...steps
        .filter((s) => s.step_type === "destination")
        .flatMap((s) => [s.city, s.title, s.location_name]),
    ].filter((p): p is string => typeof p === "string" && p.length > 0),
  }

  // What's already on the itinerary — the strongest "already added" signal,
  // because it survives the segment row being re-parsed under a new id.
  const itinerary: ItineraryKeys = {
    confirmationNumbers: [...steps, ...transport]
      .map((r) => r.confirmation_number)
      .filter((c): c is string => !!c),
    dedupeKeys: [...steps, ...transport]
      .map((r) => r.dedupe_key)
      .filter((k): k is string => !!k),
    // What is actually on the trip right now. An applied segment pointing at
    // something no longer in here was undone by the user, so it must stop
    // suppressing a re-scan of the same booking.
    liveObjectIds: new Set(
      [...steps, ...transport].map((r) => String(r.id)).filter(Boolean)
    ),
    // Derived from what each object already stores. Covers bookings no applied
    // segment points at — half the imported steps in production.
    objectIdentityKeys: [
      ...steps.flatMap((s) =>
        objectIdentityKeys({
          kind: s.step_type ?? "", title: s.title, locationName: s.location_name,
          day: s.date ?? null, altDay: s.scheduled_at ?? null,
          originCode: null, destinationCode: null, originName: null, destinationName: null,
        })
      ),
      ...transport.flatMap((t) =>
        objectIdentityKeys({
          kind: t.mode ?? "", title: t.title, locationName: null,
          day: t.departure_at ?? null, altDay: null,
          originCode: t.departure_code ?? null, destinationCode: t.arrival_code ?? null,
          originName: t.departure_location ?? null, destinationName: t.arrival_location ?? null,
        })
      ),
    ],
  }

  // TEMPORARY, demo only: ?showDismissed=1 re-surfaces dismissed bookings.
  //
  // Read here rather than at the call sites so the banner count and the review
  // list cannot disagree — they both come through this function, which is the
  // whole reason it exists. Absent the parameter, behaviour is unchanged.
  const includeDismissed = demoShowDismissed()

  const clusters = buildReviewList(rows, scope, itinerary, { includeDismissed })

  // Batch lookup covers every cluster MEMBER, not just the representative:
  // the fullest copy of a booking often came from an earlier scan, and a
  // batch-scoped review must still show it if this scan found it too.
  const parsedByRow = new Map(rows.map((r) => [r.id, r.parsed_reservation_id]))
  const resIds = [
    ...new Set(clusters.flatMap((c) => c.ids.map((id) => parsedByRow.get(id))).filter(Boolean)),
  ]
  const batchByRes = new Map<string, string | null>()
  if (resIds.length > 0) {
    const { data: res } = await db
      .from("parsed_reservations")
      .select("id, batch_id")
      .in("id", resIds)
    for (const r of res ?? []) batchByRes.set(r.id, r.batch_id)
  }

  const vms: SegmentVM[] = clusters.map(({ segment: r, ids }) => {
    const route =
      r.origin_name && r.destination_name
        ? `${r.origin_name} → ${r.destination_name}`
        : r.destination_name || r.origin_name || r.address || r.title || "Booking"
    const when = r.starts_at
      ? new Date(r.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : null
    const batchIds = [
      ...new Set(
        ids
          .map((id) => parsedByRow.get(id))
          .map((resId) => (resId ? batchByRes.get(resId) : null))
          .filter((b): b is string => !!b)
      ),
    ]
    return {
      id: r.id,
      ids,
      batchIds,
      batchId: batchByRes.get(r.parsed_reservation_id) ?? null,
      category: r.category ?? "booking",
      label: route,
      sub: [cap(r.category), when, r.confirmation_number ? `#${r.confirmation_number}` : null]
        .filter(Boolean)
        .join(" · "),
      needsReview: !!r.needs_review,
    }
  })

  // When opened from a scan chip, show only that scan's segments so the
  // "Found N" count matches the list (not every accumulated segment).
  // Demo override also lifts the batch scoping. Without this the flag looks
  // broken from the only path that matters: tapping "Scan Gmail" creates a NEW
  // batch, the re-surfaced bookings belong to OLD ones, and batch scoping
  // filters them out before includeDismissed is ever consulted.
  if (includeDismissed) return vms
  return reviewBatchId ? vms.filter((v) => v.batchIds.includes(reviewBatchId)) : vms
}
