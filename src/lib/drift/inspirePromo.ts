import type { SupabaseClient } from "@supabase/supabase-js"
import {
  parseDestination,
  photoAt,
  photoSrcSet,
  type InspireDestination,
} from "@/lib/drift/inspire"
import { tripCover, type TripCoverResult } from "@/lib/drift/tripCover"
import type { Plate } from "@/lib/drift/daybreakArt"
import type { GlobeTripPin } from "@/components/app/GlobeHero"

/**
 * The Inspire corpus, as the logged-in home needs it: a few photographed cards
 * and one globe pin per guide.
 *
 * It exists because a brand-new account's home was a globe with nothing on it
 * and two grey tiles, while forty finished, photographed trips sat one route
 * away — a routing problem, not a supply one. A photo is the only thing on that
 * screen that can say "this is what a trip looks like here" before the reader
 * has made one.
 *
 * ONE PIN PER TRIP, not one per destination. 40 guides carry 108 stops between
 * them, and pinning all 108 draws clusters (three dots on the Amalfi coast) that
 * read as three trips rather than one. The pin is the guide's face, so it goes
 * where the guide starts.
 */

/** One card on the deck. `cover` carries its own credit — see TripCoverImg. */
export interface InspirePromoCard {
  tripId: string
  href: string
  /** The author's own name for the trip — the sentence a person would say. */
  title: string
  /** "10 days · Iceland". */
  kicker: string
  cover: TripCoverResult
  /** Spoken name of the stretched link. */
  aria: string
}

export interface InspirePromo {
  /** The one big photo. */
  hero: InspirePromoCard
  /** The smaller cards beside it. */
  rest: InspirePromoCard[]
  /** How many guides were actually READ, not a number typed into copy. */
  total: number
  /** One per guide, for the globe. */
  pins: GlobeTripPin[]
}

/**
 * The same shelf, as the first-run flow needs it: the WHOLE corpus rather than
 * a deck, carrying the three facts Daybreak reads that the deck never does.
 *
 * It is the same row, the same projection and the same ordering — a second
 * query would be a second place for the tie-break to be forgotten.
 */
export interface DaybreakGuide extends InspirePromoCard {
  /** The shape tags the row stores (`wild`, `stones`, …).
   *
   *  NO LONGER WHAT THE SHAPE ANSWER IS SCORED ON — see `shapeMissFor`. Kept
   *  because the shelf's category rails and its search read it. */
  tags: string[]
  /** What the guide is FOR, ordered by prominence. Position 0 is the primary,
   *  and it is what screen 3's answer is matched against now. */
  interests: string[]
  optimizeFor: string[]
  setting: string[]
  /** Stops the trip sleeps in. Read only by the `stay` shape. */
  cityCount: number
  /** See RankableGuide.shapeWeights / shapePrimary / monthScores / blackoutMonths. */
  shapeWeights: Record<string, number>
  shapePrimary: string | null
  monthScores: number[]
  blackoutMonths: number[]
  /** Months 1…12 the guide is editorially at its best, empty when the row says
   *  nothing. RANKED on, never filtered on — and absent editorial is not a
   *  claim that any month will do. See rankGuides. */
  bestMonths: number[]
  /** The editorial columns screen 4's answers are matched against. Null is a
   *  MISS: absent editorial has never been a claim that anything fits, which
   *  is the stance bestMonths above already takes. */
  party: string | null
  pace: string | null
  budget: string | null
  /** `snapshot.day_count`, which screen 3's length pills are matched against.
   *  Already on the card's kicker as prose; carried as a number because
   *  re-parsing "10 days" to sort by it is how a kicker becomes an API. */
  days: number
  /** The guide's first located stop — the same coordinate the globe pins it at.
   *  The far end of the distance shown on the card. */
  pin: { lat: number; lng: number } | null
  /** How many stops the guide has — the "Placing your stops" line. */
  stops: number
  /** "Rome 3 · Florence 2 · Venice 2" — the shape, in one line. Same
   *  derivation as the iOS InspireSnapshot.shapeLine, including skipping a
   *  nameless stop (a bare number in the line reads as a rendering fault) and
   *  printing a nights-less stop as its bare name ("Tokyo 0" reads as one too). */
  shapeLine: string
  /** This guide's face on a mosaic tile, with the credit bound to it. A
   *  photographed STOP it travels ON TO before its hero — never the arrival,
   *  which every guide photographs and which is never what a category is
   *  named for. See the note beside `shot` in `decode`. */
  tile: Plate
  /** The hero at full-bleed width, with the credit bound to it — the ground
   *  under one screen of the flow. */
  backdrop: Plate
}

/** How many cards the deck draws. The rest of the corpus is behind "see all".
 *
 *  Was 5, which is a phone rail's worth: at that size a 1760px laptop grid drew
 *  five covers out of ninety and left half the row empty. Eight fills the wide
 *  grid and still fits the phone, where the rail scrolls and always did. */
const DECK_SIZE = 8

// Photo widths, negotiated with the photo's OWN host (see photoAt) — these are
// Wikimedia and Unsplash URLs and must never touch our optimizer.
const HERO_W = 1000
const TILE_W = 400
const PIN_W = 96
/** Daybreak stacks three full-width cards on a phone. */
const CARD_W = 760
/** A mosaic tile is ~200px wide on a phone; iOS asks for the same 420. */
const MOSAIC_W = 420
/** Full-bleed behind a whole screen. iOS's DaybreakArt.backdrop default, and
 *  the `src` a browser without srcset support falls back to — a phone-sized
 *  default is the right floor for that. */
const BACKDROP_W = 1200

/**
 * The backdrop is the one photo that covers the WHOLE window, so it is the one
 * where a phone-sized constant shows. iOS can use a single width because a
 * phone is one size; a browser cannot, and `BACKDROP_W` stretched across a
 * laptop at 2x was roughly a 2.5x upscale — visibly grainy, and reported as
 * exactly that.
 *
 * Paired with `sizes="100vw"`, the browser picks by window width times device
 * pixel ratio, so a phone still fetches the smallest and only a large window
 * pays for a large photo. Wikimedia snaps these to its own thumbnail sizes
 * (1200 -> 1280, 1600 -> 1920, 2560 -> the 3840 original on a typical hero),
 * which is why the top of the ladder is worth asking for at all.
 */
const BACKDROP_WIDTHS = [800, 1200, 1600, 2048, 2560, 3200]

/** Three stacked cards, at most ~640pt wide even on a desktop layout. */
const CARD_WIDTHS = [480, 760, 1100, 1520]

/** Six small tiles in a grid; the seventh is full-width. */
const MOSAIC_WIDTHS = [280, 420, 640, 840]

interface PromoSource {
  tripId: string
  title: string
  days: number
  place: string | null
  heroUrl: string | null
  heroAttribution: string | null
  heroLink: string | null
  pin: { lat: number; lng: number } | null
  tags: string[]
  /** What the guide is FOR, ordered by prominence — position 0 is 94%
   *  consistent with the row's own tags and is the single signal that
   *  separates a beach trip from a safari that ends at a beach. `tags` is kept
   *  for free-text search and is no longer scored. */
  interests: string[]
  optimizeFor: string[]
  setting: string[]
  /** Stops the trip sleeps in. Only `stay` reads it — see shapeMissFor. */
  cityCount: number
  shapeWeights: Record<string, number>
  shapePrimary: string | null
  monthScores: number[]
  blackoutMonths: number[]
  bestMonths: number[]
  /** Who the guide is shaped for / how much a day holds / what it costs, as
   *  the editorial columns record them. Null is a MISS, not a wildcard — see
   *  rankGuides. */
  party: string | null
  pace: string | null
  budget: string | null
  stops: number
  shapeLine: string
  /** A stop that carries its OWN photograph, with the attribution that stop
   *  stores — preferring one the trip travels on to over the arrival. Null when
   *  no stop carries one. */
  stopPhoto: {
    url: string | null
    attribution: string | null
    link: string | null
    place: string | null
  } | null
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}
function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

/**
 * A coordinate a globe may actually draw.
 *
 * (0,0) is the unset sentinel both platforms already reject — it is in the Gulf
 * of Guinea, so an unset stop does not look wrong, it looks like a trip to the
 * middle of the Atlantic. Out-of-range values are rejected for the same reason:
 * Mapbox clamps rather than throwing, so a bad latitude lands silently at a pole.
 */
function usableCoord(d: InspireDestination): d is InspireDestination & { latitude: number; longitude: number } {
  const { latitude: lat, longitude: lng } = d
  if (lat === null || lng === null) return false
  if (lat === 0 && lng === 0) return false
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

/** A jsonb object of numbers. Anything else reads as no weights — the ranker
 *  then falls back to the tier alone, exactly as it did before this column. */
/** Twelve numbers or nothing. A partial array would score the missing months
 *  as undefined, so anything but exactly twelve falls back to bestMonths. */
function asMonthScores(v: unknown): number[] {
  const out = asArray(v).map(asNumber)
  return out.length === 12 && out.every((n): n is number => n !== null) ? (out as number[]) : []
}

function asWeights(v: unknown): Record<string, number> {
  const r = asRecord(v)
  if (!r) return {}
  const out: Record<string, number> = {}
  for (const [k, x] of Object.entries(r)) {
    const n = asNumber(x)
    if (n !== null) out[k] = n
  }
  return out
}

function decode(raw: unknown): PromoSource | null {
  const row = asRecord(raw)
  if (!row) return null
  const tripId = asString(row.trip_id)
  const title = asString(row.title)
  const days = asNumber(row.day_count)
  // A card with no title or no shape is a working click target with nothing on
  // its face — the bug a reader finds by pressing it.
  if (!tripId || !title || !days || days < 1) return null

  // The order IS the pattern, so the first stop is the one with the lowest day
  // offset rather than whichever the hand-edited JSON happens to list first.
  const destinations = asArray(row.destinations)
    .map(parseDestination)
    .sort((a, b) => a.day_offset - b.day_offset)
  const first = destinations.find(usableCoord)
  // Its own photo before the guide's hero, and NOT restricted to a stop with
  // coordinates: a mosaic tile is a picture, not a pin. Read from the same
  // `destinations` payload the projection already fetches, so seven tiles cost
  // no extra query — the fields were arriving and being thrown away.
  //
  // A STOP YOU TRAVEL ON TO, NOT THE ARRIVAL. `destinations` is sorted by
  // day_offset directly above, and every active guide carries a photo on its
  // day-0 stop, so `find((d) => d.photo)` resolved to the arrival city on all
  // forty — every time, by construction. A mosaic tile is labelled with what
  // you travel TO SEE, and in an itinerary that is never day 0: "History &
  // ruins" showed Tokyo Tower and "Nature & wildlife" a Reykjavík city
  // panorama, while Machu Picchu and Petra sat photographed in the same corpus
  // and unreachable by the rule. Label and picture were not uncorrelated, they
  // were anti-correlated. A one-stop guide still falls back to its arrival —
  // passing it over is a preference, not a prohibition, and a tile with no
  // picture reads as one that failed to load. Mirrors DaybreakArt.plate(of:).
  const shot =
    destinations.find((d) => d.photo && d.day_offset > 0) ??
    destinations.find((d) => d.photo)

  return {
    tripId,
    title,
    days: Math.round(days),
    // Same choice the shelf headline makes, so the two surfaces name a trip the
    // same way — falling through to the first city for the (currently zero)
    // rows with no country.
    place: asString(asArray(row.countries)[0]) ?? asString(asArray(row.cities)[0]),
    heroUrl: asString(row.hero_url),
    heroAttribution: asString(row.hero_attribution),
    heroLink: asString(row.hero_link),
    pin: first ? { lat: first.latitude, lng: first.longitude } : null,
    tags: asArray(row.tags)
      .map(asString)
      .filter((t): t is string => t !== null),
    // ORDER PRESERVED. `interests[0]` is the primary, and the whole fix rests
    // on it, so these must not be sorted or de-duplicated on the way in.
    interests: asArray(row.interests)
      .map(asString)
      .filter((t): t is string => t !== null),
    optimizeFor: asArray(row.optimize_for)
      .map(asString)
      .filter((t): t is string => t !== null),
    setting: asArray(row.setting)
      .map(asString)
      .filter((t): t is string => t !== null),
    cityCount: asArray(row.cities).length,
    shapeWeights: asWeights(row.shape_weights),
    shapePrimary: asString(row.shape_primary),
    monthScores: asMonthScores(row.month_scores),
    blackoutMonths: asArray(row.blackout_months)
      .map(asNumber)
      .filter((m): m is number => m !== null && m >= 1 && m <= 12),
    // Months, not month names: the column is int[] and a row that carries a 13
    // or a null would otherwise rank as a month nobody can depart in.
    bestMonths: asArray(row.best_months)
      .map(asNumber)
      .filter((m): m is number => m !== null && m >= 1 && m <= 12),
    party: asString(row.party),
    pace: asString(row.pace),
    budget: asString(row.budget),
    stopPhoto: shot
      ? {
          url: shot.photo,
          attribution: shot.photo_attribution,
          link: shot.photo_link,
          place: shot.name ?? shot.city,
        }
      : null,
    stops: destinations.length,
    shapeLine: destinations
      .map((d) => {
        const name = asString(d.name)
        if (!name) return null
        return d.nights > 0 ? `${name} ${d.nights}` : name
      })
      .filter((s): s is string => s !== null)
      .join(" · "),
  }
}

function card(src: PromoSource, width: number, widths?: number[]): InspirePromoCard {
  const kicker = `${src.days} ${src.days === 1 ? "day" : "days"}${src.place ? ` · ${src.place}` : ""}`
  return {
    tripId: src.tripId,
    href: `/app/inspire/${src.tripId}`,
    title: src.title,
    kicker,
    // Stock, so it enters the chain at rung 3 WITH its credit — which is what
    // makes the attribution structurally impossible to render without.
    cover: tripCover({
      id: src.tripId,
      title: src.title,
      cover_fallback_url: photoAt(src.heroUrl, width),
      cover_fallback_srcset: widths ? photoSrcSet(src.heroUrl, widths) : null,
      cover_fallback_attribution: src.heroAttribution,
      cover_fallback_link: src.heroLink,
    }),
    aria: `${src.title}. ${kicker}. Make it mine.`,
  }
}

/**
 * One photograph and the attribution bound to it, in ONE value.
 *
 * It goes through `tripCover` rather than carrying a bare url so the picture
 * enters the chain at rung 3 WITH its credit — which is what makes rendering it
 * uncredited structurally awkward rather than merely discouraged. Rung 4 is the
 * same deterministic gradient every other cover falls back to, so a stop with no
 * photograph draws a designed tile instead of a hole.
 */
function plate(
  id: string,
  title: string,
  photo: { url: string | null; attribution: string | null; link: string | null; place: string | null },
  width: number,
  widths?: number[]
): Plate {
  return {
    cover: tripCover({
      id,
      title,
      cover_fallback_url: photoAt(photo.url, width),
      // The SAME photo at other widths. Null when the host cannot resize, and
      // the single `url` above is then all there is — which is what every
      // caller got before this existed.
      cover_fallback_srcset: widths ? photoSrcSet(photo.url, widths) : null,
      cover_fallback_attribution: photo.attribution,
      cover_fallback_link: photo.link,
    }),
    place: photo.place,
  }
}

/**
 * Read the shelf down to what a promo needs.
 *
 * ONE QUERY, TWO CALLERS. The home deck and the first-run flow want different
 * slices of the same forty rows, and the ordering below is load-bearing for
 * both — a second query somewhere else is a second place for the tie-break to
 * be left off.
 *
 * Returns null on ANY failure or empty result, and the caller falls back to the
 * screen it already had. A FAILED QUERY AND AN EMPTY SHELF MUST NOT RENDER THE
 * SAME: an outage dressed as a deck with no photos on it is indistinguishable
 * from a curated shelf that happens to be empty, and nothing anywhere would say
 * the query failed — so the failure is logged and the deck is simply not drawn.
 *
 * `label` names the surface in the log, because "the corpus query failed" is
 * only actionable if you know which screen went blank.
 */
/**
 * THE SHELF IS THE SAME FOR EVERY READER, so it is read once and kept.
 *
 * This query takes no user id and filters on nothing but `is_active` — every
 * reader, on every load, gets byte-identical rows. Measured against production
 * it is **1.71s and 274KB**, and `buildInspirePromo` runs inside the home's
 * Suspense boundary, so the document cannot finish until it returns. The first
 * byte leaves in ~25ms and then the reader watches a skeleton for three and a
 * half seconds, which is what "the site is slow" actually is: not bandwidth
 * (the whole home is ~115KB over the wire) and not the server being far away.
 *
 * The projection comment above measured 98KB when the shelf held forty guides.
 * It holds ninety now and the cost grew with it, which is the other half of why
 * this got worse without anyone changing this file.
 *
 * NOT A `LIMIT` INSTEAD, and that is deliberate. The deck shows eight, but
 * `total` is the "90 guides" count in the section header and `pins` is one
 * globe marker per guide — a LIMIT would quietly shrink both while looking
 * like a pure win.
 *
 * FAILURES ARE NOT CACHED. Storing a null would turn one bad request into a
 * shelf that stays missing for the whole window — the same trap that kept the
 * friends banner empty for the life of the app, and not one to re-import here.
 */
const SHELF_TTL_MS = 10 * 60 * 1000
let shelfMemo: { at: number; sources: PromoSource[] } | null = null

async function readShelf(
  supabase: SupabaseClient,
  label: string
): Promise<PromoSource[] | null> {
  if (shelfMemo && Date.now() - shelfMemo.at < SHELF_TTL_MS) return shelfMemo.sources

  // PROJECTED, not `select(snapshot)`. The shelf reads whole snapshots because
  // it searches inside them; this needs a title, a day count, a country and one
  // coordinate. Pulling all 40 snapshots costs 861KB over the wire and parses
  // 520 itinerary items to draw five cards — the projection is 98KB. Measured
  // against production, both.
  //
  // `tags` and `best_months` are real columns, not snapshot fields — the same
  // two the shelf at /app/inspire orders its category rails and its month rail
  // by. `best_months` is here because Daybreak ranks on the season: without it
  // in the projection the season term reads an array that is always empty, so
  // every guide scores out of season and the ranking silently does nothing —
  // which is exactly the class of bug this whole change exists to remove.
  //
  // `party`, `pace` and `budget` are here for the same reason and would fail
  // the same silent way: unselected, every guide would decode them as null,
  // null ranks as a miss, and three of the six components would go flat
  // together — a ranker that consults nothing while looking like it consults
  // everything.
  const { data, error } = await supabase
    .from("inspire_trips")
    .select(
      // `interests`, `optimize_for` and `setting` are what the shape answer is
      // scored on now. They were populated on all 90 rows the whole time and
      // NEITHER platform selected them, which is why a beach pick could return
      // a Highland rail journey: the ranker was matching `tags`, where 30 of 90
      // guides carry `islands`, so one pick tied thirty guides at zero and the
      // decision fell through to party, pace and budget.
      //
      // Shipping the ranker without this line is STRICTLY WORSE than today —
      // every array decodes empty, every guide ties, and all seven chips return
      // the same three guides.
      "trip_id,tags,best_months,party,pace,budget," +
        "interests,optimize_for,setting,shape_weights,shape_primary,month_scores,blackout_months," +
        "hero_url,hero_attribution,hero_link," +
        "title:snapshot->>title,day_count:snapshot->day_count," +
        "countries:snapshot->countries,cities:snapshot->cities," +
        "destinations:snapshot->destinations"
    )
    .eq("is_active", true)
    .order("rank", { ascending: false })
    // Ranks tie — six rows share rank 13 — and an unbroken tie orders
    // arbitrarily per query, so without a second key the deck deals a different
    // hero on every visit.
    .order("trip_id", { ascending: true })
    .returns<unknown[]>()

  if (error) {
    console.error(`[${label}] inspire shelf query failed`, error)
    return null
  }

  const rows = data ?? []
  const sources = rows.map(decode).filter((s): s is PromoSource => s !== null)
  // Rows arriving and every one of them dropping looks exactly like an empty
  // table from the outside. It is a curation fault, and only the log can say so.
  if (rows.length > 0 && sources.length === 0) {
    console.error(`[${label}] every inspire shelf row failed to decode`, { rows: rows.length })
  }
  if (!sources.length) return null
  // Only a real answer is kept — see the note on SHELF_TTL_MS.
  shelfMemo = { at: Date.now(), sources }
  return sources
}

/** The home deck: one big photo, four smaller faces, one pin per guide. */
export async function buildInspirePromo(
  supabase: SupabaseClient
): Promise<InspirePromo | null> {
  const sources = await readShelf(supabase, "home")
  if (!sources) return null

  const [hero, ...rest] = sources
  return {
    hero: card(hero, HERO_W),
    rest: rest.slice(0, DECK_SIZE - 1).map((s) => card(s, TILE_W)),
    total: sources.length,
    pins: sources
      .filter((s) => s.pin)
      .map((s) => ({
        tripId: s.tripId,
        lat: s.pin!.lat,
        lng: s.pin!.lng,
        imageURL: photoAt(s.heroUrl, PIN_W),
        // No polyline. Forty routes drawn over an otherwise empty planet is a
        // ball of string, and the guide's shape is the deck's job to tell.
        route: [],
        kind: "inspire" as const,
      })),
  }
}

/**
 * The guides this reader kept, as cards.
 *
 * FILTERED IN MEMORY from the same `readShelf` the other two builders use, not
 * queried by id. The projection is what makes reading the whole corpus cheap —
 * the note on `buildDaybreakShelf` records that all ninety cost the same ~98KB
 * — so a second query keyed on ids would be slower AND would let the Saved band
 * and the Inspire band disagree about a guide's cover, credit or kicker.
 *
 * ORDERED BY WHEN IT WAS SAVED, not by the curated rank: `ids` arrives
 * newest-first from `readSavedGuideIds` and that order is preserved here.
 *
 * A SAVED ID WITH NO SURVIVING SOURCE SIMPLY DROPS OUT, which is the tolerance
 * the table requires: a guide is de-listed by `is_active = false`, which leaves
 * the save intact and merely unresolvable.
 */
export async function buildSavedGuides(
  supabase: SupabaseClient,
  ids: string[],
  width: number = TILE_W
): Promise<InspirePromoCard[]> {
  if (ids.length === 0) return []
  const sources = await readShelf(supabase, "saved")
  if (!sources) return []
  const byId = new Map(sources.map((s) => [s.tripId, s]))
  return ids.flatMap((id) => {
    const src = byId.get(id)
    return src ? [card(src, width)] : []
  })
}

/**
 * The whole shelf for the first-run flow.
 *
 * WHOLE, not a deck: screen 3 ranks it by shape, season and length, so the five
 * the home deck draws would put the same handful at the top of every answer.
 * Forty cards is the same 98KB read — the projection is what makes reading all
 * of them cheap, and only the three that screen 4 chooses are ever rendered.
 */
export async function buildDaybreakShelf(
  supabase: SupabaseClient
): Promise<DaybreakGuide[] | null> {
  const sources = await readShelf(supabase, "daybreak")
  if (!sources) return null
  return sources.map((s) => {
    const hero = {
      url: s.heroUrl,
      attribution: s.heroAttribution,
      link: s.heroLink,
      place: s.place,
    }
    return {
      ...card(s, CARD_W, CARD_WIDTHS),
      tags: s.tags,
      interests: s.interests,
      optimizeFor: s.optimizeFor,
      setting: s.setting,
      cityCount: s.cityCount,
      shapeWeights: s.shapeWeights,
      shapePrimary: s.shapePrimary,
      monthScores: s.monthScores,
      blackoutMonths: s.blackoutMonths,
      bestMonths: s.bestMonths,
      party: s.party,
      pace: s.pace,
      budget: s.budget,
      days: s.days,
      pin: s.pin,
      stops: s.stops,
      shapeLine: s.shapeLine,
      tile: plate(s.tripId, s.title, s.stopPhoto ?? hero, MOSAIC_W, MOSAIC_WIDTHS),
      backdrop: plate(s.tripId, s.title, hero, BACKDROP_W, BACKDROP_WIDTHS),
    }
  })
}
