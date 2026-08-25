import { createClient } from "@/lib/supabase/server"
import { tripCover, type TripCoverResult } from "@/lib/drift/tripCover"
import InspireShell from "@/components/app/inspire/InspireShell"

// Inspire — BROWSE.
//
// The premise the whole surface exists to express: a tailor does not invent a
// suit, they alter a block pattern to your measurements. Each row here is a real
// trip somebody took, and its ORDER and NIGHTS — Amman 2 → Petra 3 → Wadi Rum 2
// → Dead Sea 1 — are the pattern. That shape is knowledge you cannot search for,
// so it goes on the face of the card: a photo tells you it is Jordan, only the
// shape tells you whether it is four cities in nine days or one.
//
// This page fetches and decodes; InspireShell renders. Same split as Activity
// and Home — the filter/rank state is the only thing that needs a client, so the
// page must NOT become a client component. The detail + tailor screens are
// separate (/app/inspire/[tripId]); this file knows nothing about them beyond
// the href.

export const dynamic = "force-dynamic"

/** The ONLY seven. Slug → the words a person would actually use. Order is
 *  deliberate and stable: the rail should not reshuffle between visits. */
export const INSPIRE_TAGS: Record<string, string> = {
  wild: "Into the wild",
  stones: "Old stones",
  drive: "The long drive",
  eat: "Eat your way through",
  islands: "Slow islands",
  high: "Up high",
  stay: "Stay put",
}

const TAG_ORDER = Object.keys(INSPIRE_TAGS)

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

export interface InspireStop {
  name: string
  nights: number
}

export interface InspireSource {
  label: string
  href: string
}

export interface InspireCard {
  tripId: string
  /** The author's own name for the trip. Not drawn on the card face — the
   *  headline and the shape already say what it is — but it is the accessible
   *  name of the link, which is where a screen reader wants it. */
  title: string
  /** "9 days in Jordan", the way someone would say it out loud. */
  headline: string
  dayCount: number
  stops: InspireStop[]
  /** Spelled out for aria: "2 nights in Amman, 3 nights in Petra, …". */
  shapeText: string
  /** Slugs, already narrowed to the seven. */
  tags: string[]
  tagLabel: string
  bestMonths: number[]
  /** "Mar – May · Sep – Nov", or "" when the trip has no stated window. */
  seasonText: string
  cover: TripCoverResult
  source: InspireSource | null
  authorHandle: string | null
  authorAvatar: string | null
}

export interface InspireCategory {
  slug: string
  label: string
  count: number
}

export interface InspireMonth {
  /** "2027-10" — the exact shape /api/drift/tailor takes as `month`. */
  key: string
  month: number
  label: string
  /** "'27" on months that fall in a later year, otherwise "". */
  yearLabel: string
}

// ── Tolerant decoding. This corpus is hand-edited, so a malformed row must drop
//    quietly rather than throw and take the whole screen with it.

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
 * The months this trip is good in, as contiguous runs around the 12-month
 * wheel: [10,11,12,1,2,3] is ONE window ("Oct – Mar"), not six. Kenya's
 * [7,8,9,10,1,2] is genuinely two, and prints as two — collapsing it to a
 * single min–max span would claim March is a good month for the Mara.
 */
function seasonText(months: number[]): string {
  const set = new Set(months.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12))
  if (!set.size || set.size === 12) return ""
  const next = (m: number) => (m === 12 ? 1 : m + 1)
  const prev = (m: number) => (m === 1 ? 12 : m - 1)
  const runs: string[] = []
  for (let m = 1; m <= 12; m++) {
    if (!set.has(m) || set.has(prev(m))) continue // not the start of a run
    let end = m
    while (set.has(next(end)) && next(end) !== m) end = next(end)
    runs.push(m === end ? MONTHS[m - 1] : `${MONTHS[m - 1]} – ${MONTHS[end - 1]}`)
  }
  return runs.slice(0, 2).join(" · ")
}

/**
 * Every hero in this corpus is sourced stock (Unsplash or Wikimedia Commons),
 * so it carries a source chip — the codebase rule is that a photo we did not
 * take never renders bare.
 *
 * It does NOT go through CoverCredit: that component is Unsplash-specific down
 * to the string it prints, and `inspire_trips` carries no photographer column,
 * so routing a Wikimedia hero through it would print the wrong service and an
 * Unsplash hero would print "Photo by the photographer". Naming the source we
 * actually know beats inventing a byline we do not.
 */
function sourceFor(url: string | null): InspireSource | null {
  if (!url) return null
  let host: string
  let path: string
  try {
    const u = new URL(url)
    host = u.hostname
    path = u.pathname
  } catch {
    return null
  }
  if (host.endsWith("unsplash.com")) {
    return { label: "Unsplash", href: "https://unsplash.com/?utm_source=drift&utm_medium=referral" }
  }
  if (host.endsWith("wikimedia.org") || host.endsWith("wikipedia.org")) {
    // .../wiki/Special:FilePath/Delicatearch.png → the file's own page.
    const file = /\/Special:FilePath\/(.+)$/.exec(path)?.[1]
    return {
      label: "Wikimedia Commons",
      href: file
        ? `https://commons.wikimedia.org/wiki/File:${file}`
        : "https://commons.wikimedia.org",
    }
  }
  return null
}

function decode(raw: unknown): InspireCard | null {
  const row = asRecord(raw)
  if (!row) return null
  const tripId = asString(row.trip_id)
  const snap = asRecord(row.snapshot)
  if (!tripId || !snap) return null

  // An empty card with a working click target is a bug the user finds by
  // clicking it, so a row missing any of the three load-bearing fields drops.
  const title = asString(snap.title)
  const dayCount = asNumber(snap.day_count)
  if (!title || !dayCount || dayCount < 1) return null

  const stops: InspireStop[] = asArray(snap.destinations)
    .map((d) => {
      const dest = asRecord(d)
      if (!dest) return null
      const name = asString(dest.name) ?? asString(dest.city)
      if (!name) return null
      return {
        name,
        nights: Math.max(0, asNumber(dest.nights) ?? 0),
        offset: asNumber(dest.day_offset) ?? 0,
      }
    })
    .filter((s): s is InspireStop & { offset: number } => s !== null)
    // The order IS the pattern, so sort by it rather than trusting insertion
    // order in hand-edited JSON.
    .sort((a, b) => a.offset - b.offset)
    .map(({ name, nights }) => ({ name, nights }))
  if (!stops.length) return null

  const country = asString(asArray(snap.countries)[0])
  const days = Math.round(dayCount)
  const headline = country ? `${days} days in ${country}` : title

  const tags = asArray(row.tags)
    .map(asString)
    .filter((t): t is string => !!t && t in INSPIRE_TAGS)
  const bestMonths = asArray(row.best_months)
    .map(asNumber)
    .filter((m): m is number => m !== null && m >= 1 && m <= 12)

  const heroUrl = asString(row.hero_url)

  return {
    tripId,
    title,
    headline,
    dayCount: days,
    stops,
    shapeText: stops
      .map((s) => (s.nights === 1 ? `1 night in ${s.name}` : `${s.nights} nights in ${s.name}`))
      .join(", "),
    tags,
    tagLabel: tags.map((t) => INSPIRE_TAGS[t]).join(" · "),
    bestMonths,
    seasonText: seasonText(bestMonths),
    // Stock, so it goes in at rung 3 and inherits the deterministic gradient
    // placeholder for the day a hero URL rots.
    cover: tripCover({ id: tripId, title, cover_fallback_url: heroUrl }),
    source: sourceFor(heroUrl),
    authorHandle: asString(row.author_handle),
    authorAvatar: asString(row.author_avatar_url),
  }
}

/** Next month first, six out. You cannot leave today, so "this month" is not an
 *  answer to "when could you go" — it is an answer to "when could you have
 *  gone". Computed on the server so both renders agree on what month it is. */
function nextSixMonths(): InspireMonth[] {
  const now = new Date()
  const out: InspireMonth[] = []
  for (let i = 1; i <= 6; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1))
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth() + 1
    out.push({
      key: `${y}-${String(m).padStart(2, "0")}`,
      month: m,
      label: MONTHS[m - 1],
      yearLabel: y === now.getUTCFullYear() ? "" : `'${String(y).slice(2)}`,
    })
  }
  return out
}

export default async function InspirePage() {
  const supabase = await createClient()

  // Read as `unknown` on purpose, despite the generated row type: `snapshot` is
  // Json, this corpus is hand-edited, and decode() is what actually establishes
  // the shape. Trusting the column types here would only move the throw.
  const { data, error } = await supabase
    .from("inspire_trips")
    .select(
      "trip_id,rank,tags,best_months,blurb,hero_url,author_handle,author_avatar_url,snapshot"
    )
    .eq("is_active", true)
    .order("rank", { ascending: false })
    // Ranks tie — the seed leaves most rows at their default — and an unbroken
    // tie orders arbitrarily per query. Without a second key the shelf
    // reshuffles on every visit (this route is force-dynamic), so a card the
    // user just opened is somewhere else when they press back.
    .order("trip_id", { ascending: true })
    .returns<unknown[]>()

  // A FAILED QUERY AND AN EMPTY SHELF RENDER IDENTICALLY unless we say
  // otherwise: `data` is null either way, every rail comes back empty, and the
  // page invites the user to try a category it did not draw. Nothing in the
  // browser or the server log would say the query failed.
  if (error) {
    console.error("[inspire] shelf query failed", error)
  }

  const rows = data ?? []
  const cards = rows.map(decode).filter((c): c is InspireCard => c !== null)

  // A curation mistake that blanks the shelf is otherwise undetectable: the
  // rows arrive and decode() drops them all, which looks exactly like an empty
  // table.
  if (rows.length > 0 && cards.length === 0) {
    console.error("[inspire] every shelf row failed to decode", { rows: rows.length })
  } else if (rows.length !== cards.length) {
    console.warn("[inspire] dropped unusable shelf rows", {
      rows: rows.length,
      kept: cards.length,
    })
  }

  // A category is never a dead end: it carries its count, and one with nothing
  // behind it is not drawn at all.
  const categories: InspireCategory[] = TAG_ORDER.map((slug) => ({
    slug,
    label: INSPIRE_TAGS[slug],
    count: cards.filter((c) => c.tags.includes(slug)).length,
  })).filter((c) => c.count > 0)

  return <InspireShell cards={cards} categories={categories} months={nextSixMonths()} />
}
