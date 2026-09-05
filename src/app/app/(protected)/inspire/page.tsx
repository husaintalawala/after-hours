import { createClient } from "@/lib/supabase/server"
import { tripCover, type TripCoverResult } from "@/lib/drift/tripCover"
import { photoAt } from "@/lib/drift/inspire"
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
  /** The real credit for the cover, when it could be recovered. Preferred over
   *  `source`, which only names the service. */
  heroAttribution: string | null
  heroLink: string | null
  authorHandle: string | null
  /** Everything a reader might type, folded to lowercase: the title, countries,
   *  cities, stops, tags, and the name of every place inside the guide. Built
   *  here because only the server has the snapshot — without it a shelf search
   *  can match titles and nothing else, and nobody searches forty guides by
   *  title. */
  search: string
  authorAvatar: string | null
}

export interface InspireCategory {
  slug: string
  label: string
  count: number
  /** The cover of the STRONGEST trip carrying this tag — the shelf's own rank
   *  order picks it. A tile is a door, and a door with a photo on it tells you
   *  where it goes; a gradient tells you nothing. Resized by the photo's own
   *  host to tile width, never re-hosted. */
  cover: TripCoverResult
}

export interface InspireMonth {
  /** "2027-10" — the exact shape /api/drift/tailor takes as `month`. It is
   *  always the NEXT occurrence of this month, so January picked in August
   *  means next January, not the one that has gone. */
  key: string
  month: number
  label: string
  /** "'27" on months that fall in a later year, otherwise "". */
  yearLabel: string
  /** The month it is right now — drawn dashed and muted, because you cannot
   *  leave today: picking it means the same month a year out. */
  isCurrent: boolean
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
  const heroAttribution = asString(row.hero_attribution)
  const heroLink = asString(row.hero_link)

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
    // The real credit now exists on the row, so the shelf stops printing a bare
    // service chip and names the author. `source` stays as the fallback for any
    // row whose credit could not be recovered — a photo we did not take still
    // never renders bare.
    source: sourceFor(heroUrl),
    heroAttribution,
    heroLink,
    search: foldSearch([
      title,
      headline,
      ...asArray(snap.countries).map(asString),
      ...asArray(snap.cities).map(asString),
      ...stops.map((s) => s.name),
      ...tags.map((t) => INSPIRE_TAGS[t]),
      asString(row.author_handle),
      asString(row.blurb),
      // The places themselves — this is the half that makes "ramen" or
      // "onsen" find anything.
      ...asArray(snap.items).flatMap((i) => {
        const it = asRecord(i)
        if (!it) return []
        return [
          asString(it.title),
          asString(it.location_name),
          asString(it.canonical_name),
          asString(it.kind),
          asString(it.place_category),
        ]
      }),
    ]),
    authorHandle: asString(row.author_handle),
    authorAvatar: asString(row.author_avatar_url),
  }
}

/** Lowercased and stripped of accents, so "sao paulo" finds "São Paulo" and
 *  "kyoto" finds "Kyōto" — half this corpus carries a macron or a cedilla. */
function foldSearch(parts: (string | null | undefined)[]): string {
  return parts
    .filter((p): p is string => typeof p === "string" && p.length > 0)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

/**
 * All twelve, in calendar order, each pointing at its NEXT occurrence.
 *
 * The rail used to offer six. A chart of the year cannot: the shape of the
 * shelf — full shoulders, an empty July and August — is only visible when all
 * twelve are drawn to scale next to each other, and half a year is half a
 * shape. The ORDER is Jan → Dec because that is what a year looks like; the
 * "you cannot leave today" truth is carried by the key instead, which rolls
 * every month at or before this one into next year.
 *
 * Computed on the server so both renders agree on what month it is — a
 * client-computed "today" is a hydration mismatch on the one control that
 * decides when the trip happens.
 */
function twelveMonths(): InspireMonth[] {
  const now = new Date()
  const thisYear = now.getUTCFullYear()
  const thisMonth = now.getUTCMonth() + 1
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    const y = m > thisMonth ? thisYear : thisYear + 1
    return {
      key: `${y}-${String(m).padStart(2, "0")}`,
      month: m,
      label: MONTHS[m - 1],
      yearLabel: y === thisYear ? "" : `'${String(y).slice(2)}`,
      isCurrent: m === thisMonth,
    }
  })
}

/** The shelf could not be read. Not "nothing here yet" — that sentence blames
 *  the corpus for a fault on our side and sends the user hunting through rails
 *  that were never drawn. This route is force-dynamic, so the link is a real
 *  retry: it re-runs the query. */
function ShelfUnavailable() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-28 pt-6">
      <h1 className="font-drift-display text-3xl font-medium tracking-tight text-aurora-ink">
        Inspire
      </h1>
      <div className="mt-8 rounded-card border border-aurora-border bg-aurora-glass px-5 py-8 text-center">
        <p className="font-drift-display text-[19px] font-semibold text-aurora-ink">
          Drift couldn&apos;t load the shelf
        </p>
        <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-drift-muted">
          The trips are still there — this is on our side. Try again in a moment.
        </p>
        <a
          href="/app/inspire"
          className="mt-5 inline-flex h-[46px] items-center justify-center rounded-2xl bg-aurora-teal px-6 text-[14.5px] font-bold text-aurora-teal-ink"
        >
          Try again
        </a>
      </div>
    </main>
  )
}

export default async function InspirePage() {
  const supabase = await createClient()

  // Read as `unknown` on purpose, despite the generated row type: `snapshot` is
  // Json, this corpus is hand-edited, and decode() is what actually establishes
  // the shape. Trusting the column types here would only move the throw.
  const { data, error } = await supabase
    .from("inspire_trips")
    .select(
      "trip_id,rank,tags,best_months,blurb,hero_url,hero_attribution,hero_link,author_handle,author_avatar_url,snapshot"
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
  // …and saying otherwise means saying it ON THE SCREEN, not only in the log.
  // Falling through to `data ?? []` drew twelve zero-height month columns, a
  // "0 TRIPS" header and an empty state telling the user to try a category rail
  // that was not rendered — an outage dressed as a curated shelf with nothing on
  // it. A failure gets a failure's copy and a way to retry.
  if (error && rows.length === 0) return <ShelfUnavailable />

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

  // A category is never a dead end: it carries its count and the face of the
  // best trip behind it, and one with nothing behind it is not drawn at all.
  //
  // `cards` arrives in rank order, so "strongest" is simply the first one that
  // has a photo to show — falling back to the first of the tag, whose cover is
  // then the deterministic placeholder rather than a hole.
  const categories: InspireCategory[] = TAG_ORDER.map((slug) => {
    const inTag = cards.filter((c) => c.tags.includes(slug))
    const face = inTag.find((c) => c.cover.url) ?? inTag[0]
    return {
      slug,
      label: INSPIRE_TAGS[slug],
      count: inTag.length,
      // Re-cut at tile width by the photo's OWN host. The 1200px hero behind a
      // 180px tile is 40× the bytes it draws.
      cover: face
        ? tripCover({
            id: face.tripId,
            title: face.title,
            cover_fallback_url: photoAt(face.cover.url, 480),
          })
        : tripCover({ id: slug, title: INSPIRE_TAGS[slug] }),
    }
  }).filter((c) => c.count > 0)

  const everything = cards.find((c) => c.cover.url) ?? cards[0]

  return (
    <InspireShell
      cards={cards}
      categories={categories}
      months={twelveMonths()}
      everythingCover={
        everything
          ? tripCover({
              id: everything.tripId,
              title: "Everything",
              cover_fallback_url: photoAt(everything.cover.url, 480),
            })
          : tripCover({ id: "00000000", title: "Everything" })
      }
    />
  )
}
