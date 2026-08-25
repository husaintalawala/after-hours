import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import PatternView from "@/components/app/inspire/PatternView"
import {
  hasUsableSnapshot,
  isGuideSlug,
  monthsYouCouldGo,
  parseSnapshot,
  type InspirePattern,
} from "@/lib/drift/inspire"

// One block pattern.
//
// A tailor does not invent a suit; they alter a block pattern to your
// measurements. This route loads the pattern — a real trip somebody took,
// frozen as an ORDER and a set of NIGHTS — and hands it to the island
// fully-formed. Nothing is fetched on the client.
//
// `inspire_trips` is readable by everyone via RLS (`SELECT WHERE is_active`),
// so the `.eq("is_active", true)` below is redundant with the policy and stated
// anyway: it is what makes the (is_active, rank desc) partial index usable, and
// it keeps the query honest if the policy is ever widened.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The row, asserted here. `slug` is newer than src/lib/database.types.ts and
 *  regenerating that file would drop a large unrelated diff into this feature —
 *  the same call /i/[slug] made. `snapshot` is read as `unknown` regardless:
 *  parseSnapshot is what establishes its shape. */
interface PatternRow {
  trip_id: string
  slug: string | null
  tags: string[] | null
  best_months: number[] | null
  blurb: string | null
  hero_url: string | null
  author_handle: string | null
  author_avatar_url: string | null
  snapshot: unknown
}

export default async function InspirePatternPage({
  params,
}: {
  // Promises since Next 15. Declaring them as plain objects compiles fine and
  // then reads `undefined` at runtime — the bug that 404'd every web trip for
  // six days.
  params: Promise<{ tripId: string }>
}) {
  const { tripId } = await params
  // An invalid uuid is a 22P02 from Postgres, not a row — 404 it here rather
  // than letting a database error surface as a 500.
  if (!UUID.test(tripId)) notFound()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("inspire_trips")
    .select(
      "trip_id, slug, tags, best_months, blurb, hero_url, author_handle, author_avatar_url, snapshot",
    )
    .eq("trip_id", tripId)
    .eq("is_active", true)
    .maybeSingle()
    .returns<PatternRow | null>()

  if (error) {
    console.error("[inspire/[tripId]] lookup failed", tripId, error)
    throw new Error(`Couldn't load this trip: ${error.message}`)
  }
  if (!data) notFound()

  const snapshot = parseSnapshot(data.snapshot)
  // A pattern with no shape has nothing to draw and nothing to tailor. Better a
  // 404 than a blank page with a working "Tailor this" button on it.
  if (!hasUsableSnapshot(snapshot)) notFound()

  const pattern: InspirePattern = {
    tripId: data.trip_id,
    // The public handle. Without it this screen has no shareable URL at all —
    // its own is behind the auth gate — so the Share control hides rather than
    // hand somebody a login wall.
    slug: isGuideSlug(data.slug) ? data.slug : null,
    tags: (data.tags ?? []).filter(Boolean),
    bestMonths: (data.best_months ?? []).filter((m): m is number => typeof m === "number"),
    blurb: data.blurb,
    heroUrl: data.hero_url,
    authorHandle: data.author_handle,
    authorAvatarUrl: data.author_avatar_url,
    snapshot,
  }

  // The months rail is computed HERE rather than in the island. It depends on
  // "today", and a client-computed today renders differently from the server's
  // on the first paint — a hydration mismatch on the one control that decides
  // when the trip happens.
  const today = new Date().toISOString().slice(0, 10)
  const months = monthsYouCouldGo(today)

  return <PatternView pattern={pattern} months={months} />
}
