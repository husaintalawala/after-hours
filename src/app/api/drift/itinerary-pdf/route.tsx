import React from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import { createClient } from "@/lib/supabase/server"
import { getDriftUpstream } from "@/lib/drift/server"
import { tripCover } from "@/lib/drift/tripCover"
import { compareDate, dateOnly } from "@/lib/drift/dates"
import { STEP_BOOKING_EMBED } from "@/lib/drift/stepBooking"
import type { StepRow, TripRow, TransportBookingRow } from "@/lib/db-types"
import { buildItineraryDocument } from "@/lib/pdf/itinerary"
import { ItineraryPdf } from "@/lib/pdf/ItineraryPdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// Rendering a photo-heavy cover + a long itinerary is comfortably under this,
// but a cold lambda paying font + image cost shouldn't be cut off at 10s.
export const maxDuration = 60

// GET /api/drift/itinerary-pdf?trip=<uuid>
//
// Renders the trip's plan to a designed, multi-page US-Letter PDF and returns
// it as a download. Server-side on purpose: @react-pdf/renderer never reaches
// the client bundle, the cover photo is fetched without a CORS dance, and the
// place-blurb call goes out with the caller's own token.
//
// The document is assembled by `buildItineraryDocument`, which runs the very
// same timeline helpers the Plan tab renders from — so print order, day
// bucketing and times match the screen rather than approximating it.

const MODE_LABEL: Record<string, string> = {
  car: "Drive", motorbike: "Motorbike", bike: "Bike", hike: "Hike",
  bus: "Bus", train: "Train", flight: "Flight", sailboat: "Ferry", direct: "Travel",
}

/** Hosts whose bytes we're allowed to embed in an artifact the user keeps.
 *  Deliberately mirrors OptimizedImg's allow-list posture: Google Place Photos
 *  (served through the maps-photo proxy) must never be copied or re-hosted
 *  (Places ToS §3.2.3), so an unlisted host simply yields the brand gradient
 *  cover instead of a photo. */
const COVER_HOSTS = new Set([
  "d309w7wk5bnk1z.cloudfront.net", // user-uploaded photos (S3 → CloudFront)
  "images.unsplash.com", // sourced stock — printed WITH its credit, see below
])

const MAX_COVER_BYTES = 8 * 1024 * 1024

export async function GET(request: Request) {
  const tripId = new URL(request.url).searchParams.get("trip")
  if (!tripId) return json({ ok: false, error: "missing trip" }, 400)

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return json({ ok: false, error: "unauthorized" }, 401)

  // RLS scopes this: a trip the caller can't read simply isn't there.
  const { data: tripRaw } = await supabase
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .maybeSingle()
  const trip = tripRaw as TripRow | null
  if (!trip) return json({ ok: false, error: "not found" }, 404)

  const [{ data: stepsRaw }, { data: transportRaw }, { data: mediaRaw }, { data: buddyRaw }] =
    await Promise.all([
      supabase.from("steps").select(`*, ${STEP_BOOKING_EMBED}`).eq("trip_id", trip.id),
      supabase.from("transport_bookings").select("*").eq("trip_id", trip.id),
      supabase
        .from("media")
        .select("url,created_at")
        .eq("trip_id", trip.id)
        .eq("type", "photo")
        .order("created_at", { ascending: true })
        .limit(1)
        .returns<Array<{ url: string }>>(),
      supabase.from("trip_buddies").select("id").eq("trip_id", trip.id),
    ])

  const steps = (stepsRaw ?? []) as StepRow[]
  const bookings = (transportRaw ?? []) as TransportBookingRow[]

  const destinations = steps
    .filter((s) => s.step_type === "destination" && !s.parent_step_id)
    .sort((a, b) => compareDate(dateOnly(a.date) ?? "", dateOnly(b.date) ?? ""))

  // Steps whose destination was deleted must not silently vanish from the
  // export — the Plan tab gives them a synthetic bucket, so this does too.
  // FLAT steps (no parent at all) are Track recordings and stay out of Plan.
  const destIds = new Set(destinations.map((d) => d.id))
  const orphans = steps.filter(
    (s) =>
      s.step_type !== "destination" &&
      s.parent_step_id != null &&
      !destIds.has(s.parent_step_id)
  )
  const planSteps = [...steps]
  const planDestinations = [...destinations]
  if (orphans.length) {
    const startD =
      dateOnly(trip.start_date) ?? dateOnly(orphans[0].date) ?? "1970-01-01"
    const endD = dateOnly(trip.end_date) ?? startD
    const synthetic = {
      id: "unassigned",
      trip_id: trip.id,
      step_type: "destination",
      parent_step_id: null,
      title: destinations.length ? "More stops" : trip.cities?.[0] ?? "Itinerary",
      location_name: null,
      country: trip.countries?.[0] ?? null,
      city: trip.cities?.[0] ?? null,
      date: startD,
      nights: Math.max(0, daysBetween(startD, endD)),
    } as unknown as StepRow
    planDestinations.push(synthetic)
    for (const o of orphans) {
      planSteps[planSteps.indexOf(o)] = { ...o, parent_step_id: "unassigned" }
    }
  }

  const [coverDataUri, blurbs] = await Promise.all([
    loadCover(trip, mediaRaw?.[0]?.url ?? null),
    loadBlurbs(planDestinations, planSteps),
  ])

  const headcount =
    (trip.travelers_adults ?? 0) +
    (trip.travelers_children ?? 0) +
    (trip.travelers_infants ?? 0)

  const doc = buildItineraryDocument({
    tripTitle: trip.title,
    tripCities: trip.cities,
    tripCountries: trip.countries,
    startDate: trip.start_date,
    endDate: trip.end_date,
    destinations: planDestinations,
    allSteps: planSteps,
    bookings,
    travelerCount: headcount || (buddyRaw?.length ?? 0) + 1,
    blurbs,
    coverDataUri: coverDataUri.dataUri,
    coverCredit: coverDataUri.credit,
    modeLabel: (mode) => MODE_LABEL[mode] ?? mode,
  })

  const buffer = await renderToBuffer(<ItineraryPdf doc={doc} />)

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      // RFC 5987 so the em dash and any non-ASCII title survive the header.
      "content-disposition": `attachment; filename="itinerary.pdf"; filename*=UTF-8''${encodeURIComponent(
        doc.fileName
      )}`,
      "cache-control": "no-store",
    },
  })
}

// ------------------------------------------------------------------- cover --

/** Fetch the trip's cover through the shared 4-rung chain and inline it.
 *  Best-effort: a slow, oversized, or unlisted-host photo just yields the brand
 *  gradient band rather than failing the export. */
async function loadCover(
  trip: TripRow,
  firstPhotoUrl: string | null
): Promise<{ dataUri: string | null; credit: string | null }> {
  const cover = tripCover({
    id: trip.id,
    title: trip.title,
    cover_url: trip.cover_url,
    firstPhotoUrl,
    cover_fallback_url: trip.cover_fallback_url,
    cover_fallback_attribution: trip.cover_fallback_attribution,
    cover_fallback_link: trip.cover_fallback_link,
    countries: trip.countries,
  })
  if (!cover.url) return { dataUri: null, credit: null }

  let url: URL
  try {
    url = new URL(cover.url)
  } catch {
    return { dataUri: null, credit: null }
  }
  if (!COVER_HOSTS.has(url.hostname)) return { dataUri: null, credit: null }
  // Ask Unsplash for a page-width JPEG rather than the original 4000px frame.
  if (url.hostname === "images.unsplash.com") {
    url.searchParams.set("w", "1400")
    url.searchParams.set("q", "72")
    url.searchParams.set("fm", "jpg")
  }

  try {
    const res = await fetch(url.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { dataUri: null, credit: null }
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim()
    if (!/^image\/(jpeg|jpg|png)$/.test(type)) return { dataUri: null, credit: null }
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (!bytes.length || bytes.length > MAX_COVER_BYTES) {
      return { dataUri: null, credit: null }
    }
    return {
      dataUri: `data:${type};base64,${Buffer.from(bytes).toString("base64")}`,
      // Rung 3 is sourced stock; printing the photo without its credit is the
      // ToS violation the chain's `credit` field exists to prevent.
      credit: cover.credit?.text ?? null,
    }
  } catch {
    return { dataUri: null, credit: null }
  }
}

// ------------------------------------------------------------ descriptions --

/** Resolve the "what to do there" line for every card that needs one.
 *
 *  `steps.notes` always wins — it is the user's own text, and is read straight
 *  off the row by the builder. Only steps with NO note and a `place_id` come
 *  here, batched into one place-blurb call. Nothing is ever invented: a step
 *  with neither source renders without a description, and the whole fetch is
 *  fail-open. */
async function loadBlurbs(
  destinations: StepRow[],
  allSteps: StepRow[]
): Promise<Record<string, string>> {
  const destIds = new Set(destinations.map((d) => d.id))
  const cityByParent = new Map(
    destinations.map((d) => [d.id, d.location_name || d.title || ""])
  )

  const needed = allSteps.filter(
    (s) =>
      !destIds.has(s.id) &&
      s.step_type !== "destination" &&
      !s.notes?.trim() &&
      !!s.place_id?.trim()
  )
  if (!needed.length) return {}

  const up = await getDriftUpstream()
  if (!up) return {}

  // place-blurb caps a call at 24 places; a long trip needs several rounds.
  const chunks: StepRow[][] = []
  for (let i = 0; i < needed.length; i += 24) chunks.push(needed.slice(i, i + 24))

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await fetch(`${up.functionsBase}/place-blurb`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${up.token}`,
            apikey: up.anonKey,
          },
          body: JSON.stringify({
            places: chunk.map((s) => ({
              id: s.place_id,
              name: s.title || s.location_name || "",
              city:
                (s.parent_step_id ? cityByParent.get(s.parent_step_id) : null) ||
                s.city ||
                undefined,
              category: s.place_category ?? undefined,
            })),
          }),
          signal: AbortSignal.timeout(12_000),
        })
        if (!res.ok) return {}
        const body = (await res.json()) as { blurbs?: Record<string, string> }
        return body.blurbs ?? {}
      } catch {
        return {}
      }
    })
  )

  return Object.assign({}, ...results) as Record<string, string>
}

// ------------------------------------------------------------------ helpers --

function daysBetween(a: string, b: string): number {
  const at = Date.parse(`${a}T00:00:00Z`)
  const bt = Date.parse(`${b}T00:00:00Z`)
  if (Number.isNaN(at) || Number.isNaN(bt)) return 0
  return Math.round((bt - at) / 86_400_000)
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}
