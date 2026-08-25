import { cache } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import OptimizedImg from "@/components/app/OptimizedImg"
import CoverCredit from "@/components/app/CoverCredit"
import {
  bestWindowLabel,
  categoryName,
  guideUrl,
  hasUsableSnapshot,
  isGuideSlug,
  nightsWord,
  parseSnapshot,
  photoAt,
  type InspireDestination,
  type InspireItem,
  type InspireSnapshot,
} from "@/lib/drift/inspire"

// The PUBLIC guide — a curated Drift trip, whole, at a URL a stranger can open.
//
// NOT BEHIND AUTH, AND NOT A TEASER. This route lives outside /app/(protected)
// on purpose: the entire value of a share link is that the person it was sent
// to can read the trip before they have any relationship with Drift. A wall on
// arrival — a sign-in gate, a blurred half — wastes the one moment somebody
// arrived already curious. Every stop, every photo, every note renders for
// everyone. The ask is ONE button, at the BOTTOM, after the value has landed.
//
// `inspire_trips` RLS is `SELECT to public WHERE is_active`, verified against
// the anon role, so the ordinary server client reads this with no session and
// no service key. The `.eq("is_active", true)` is redundant with the policy and
// stated anyway — it keeps the (is_active, rank) index usable and keeps the
// query honest if the policy is ever widened.

/** The row, asserted here.
 *
 *  `slug` is newer than src/lib/database.types.ts, and regenerating that file
 *  would drop a large unrelated diff into this feature — the same call the
 *  invite page made for `preview_trip_invite`. `snapshot` is read as `unknown`
 *  regardless: it is jsonb over a hand-edited corpus, and parseSnapshot is what
 *  actually establishes its shape. */
interface GuideRow {
  trip_id: string
  slug: string
  tags: string[] | null
  best_months: number[] | null
  blurb: string | null
  hero_url: string | null
  hero_attribution: string | null
  hero_link: string | null
  author_handle: string | null
  author_avatar_url: string | null
  snapshot: unknown
}

interface Guide {
  row: GuideRow
  snapshot: InspireSnapshot
}

/** One lookup per request, shared by generateMetadata and the page. Next only
 *  dedupes `fetch`; without this every share link is queried twice. */
const loadGuide = cache(async (slug: string): Promise<Guide | null> => {
  if (!isGuideSlug(slug)) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("inspire_trips")
    .select(
      "trip_id,slug,tags,best_months,blurb,hero_url,hero_attribution,hero_link,author_handle,author_avatar_url,snapshot"
    )
    .eq("slug" as never, slug as never)
    .eq("is_active", true)
    .maybeSingle()
    .returns<GuideRow | null>()

  // A share link that 500s is worse than one that 404s: the recipient sees a
  // crash where a trip was promised, and every unfurl retry re-runs it. Log
  // loudly, answer with "no such guide".
  if (error) {
    console.error("[i/[slug]] lookup failed", slug, error)
    return null
  }
  if (!data) return null

  const snapshot = parseSnapshot(data.snapshot)
  // Nothing to draw is a 404, not a blank page with a working CTA on it.
  if (!hasUsableSnapshot(snapshot)) return null
  return { row: data, snapshot }
})

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** The opening line — the first sentence of the guide AND the og:description.
 *
 *  `blurb` is the editorial one when it exists; all 38 live rows are still
 *  null, so the derived line below is what actually ships and it has to read
 *  like a sentence rather than a stat block. */
function openingLine(row: GuideRow, s: InspireSnapshot): string {
  if (row.blurb) return row.blurb

  const names = s.destinations
    .map((d) => d.name ?? d.city)
    .filter((n): n is string => !!n)
  const where = s.countries.length
    ? s.countries.slice(0, 3).map(withArticle).join(" and ")
    : names.slice(0, 2).join(" and ")
  const route =
    names.length > 1 ? `${names[0]} to ${names[names.length - 1]}` : names[0]

  const days = s.day_count > 0 ? `${s.day_count} days` : "A route"
  const head = where ? `${days} in ${where}` : days
  if (!route) return `${head}, in the order it was actually travelled.`
  return `${head} — ${s.destinations.length} stops, ${route}, in the order they were actually travelled.`
}

/** "11 days in United States" is the sentence a join() writes and a person
 *  never would. Exactly two of the 38 country names in the live corpus take an
 *  article; the list is short and explicit rather than a rule guessing at
 *  plurals (which would put "the" in front of Faroe Islands and Philippines
 *  correctly, and in front of Netherlands wrongly for the wrong reason). */
const ARTICLE_COUNTRIES = new Set(["United States", "United Kingdom", "Faroe Islands", "Netherlands", "Philippines"])

function withArticle(country: string): string {
  return ARTICLE_COUNTRIES.has(country) ? `the ${country}` : country
}

const TYPE_LABEL: Record<string, string> = {
  stay: "Stay",
  food: "Eat",
  activity: "Do",
  spot: "See",
  note: "Note",
  restaurant: "Eat",
  time_block: "Do",
}

function typeLabel(item: InspireItem): string | null {
  const t = item.step_type.toLowerCase()
  if (TYPE_LABEL[t]) return TYPE_LABEL[t]
  if (!t) return null
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, " ")
}

// NO CLOCK TIMES ON THIS PAGE, deliberately — `item.time` orders the day here
// and is never printed. Measured across the live corpus: 520 items carry a time
// but only 24 DISTINCT values exist, 160 of them at exactly 13:00 and 38 of the
// 66 meals at 23:45. They are packing slots the seeder assigned, not hours
// anybody chose. Printing them puts "dinner, 11:45 PM" and "golden hour,
// 10:45 PM" on a page whose whole job is to be believed by a stranger. The
// knowledge this corpus actually holds is the ORDER and the NIGHTS, and that is
// what renders. If real editorial times ever land, print them then.

// RESIZING IS `photoAt`, shared with every other Inspire surface. This page had
// its own narrower copy that only understood wikimedia.org — so the corpus's 33
// Unsplash photos, and any Wikimedia URL not shaped as Special:FilePath, were
// served at FULL RESOLUTION into a 640px card. On the public page, which is the
// one a stranger opens on mobile data. photoAt knows both hosts' own resizers
// and, like the copy it replaces, never routes bytes through our optimizer.

/** Identity of a photo regardless of the size it was asked for, so the same
 *  file at ?width=1200 and ?width=640 is recognised as one image. */
function photoKey(url: string): string {
  try {
    const u = new URL(url)
    u.search = ""
    return u.toString()
  } catch {
    return url
  }
}

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

/** An item with the photo it should actually draw — null once that image has
 *  already appeared higher up the page. */
interface Entry {
  item: InspireItem
  photo: string | null
}

interface DayBlock {
  /** day_offset + 1. An OFFSET, printed as "Day 3" — the snapshot has no dates
   *  and nothing here computes one. */
  dayNumber: number
  entries: Entry[]
}

interface Stop {
  destination: InspireDestination | null
  photo: string | null
  days: DayBlock[]
}

/** Day, then the packing slot in `time` — which orders the day correctly even
 *  though it is never shown (see above). Array#sort is stable, so the 160 items
 *  sharing 13:00 keep the order the snapshot stored them in. */
function sortKey(i: InspireItem): string {
  return `${String(i.day_offset).padStart(4, "0")}-${(i.time ?? "99:99").padStart(5, "0")}`
}

/** Stops in travel order, each with its items grouped by day. Items whose
 *  `destination_ref` matches nothing still render, at the end — a broken ref
 *  must lose a heading, never a place.
 *
 *  PHOTOS ARE DE-DUPLICATED as the page is walked, because the corpus reuses
 *  one: a destination's photo is often its first item's photo, so Split's
 *  Diocletian's Palace was drawn full-bleed and then again on the card right
 *  under it. First use wins, and later uses render as a text card — which the
 *  layout already handles for the 224 items that have no photo at all. */
function buildStops(s: InspireSnapshot, heroUrl: string | null): Stop[] {
  const seen = new Set<string>()
  if (heroUrl) seen.add(photoKey(heroUrl))

  const take = (url: string | null, width: number): string | null => {
    if (!url) return null
    const key = photoKey(url)
    if (seen.has(key)) return null
    seen.add(key)
    return photoAt(url, width)
  }

  const toDays = (items: InspireItem[]): DayBlock[] => {
    const byDay = new Map<number, Entry[]>()
    for (const item of [...items].sort((a, b) =>
      sortKey(a).localeCompare(sortKey(b))
    )) {
      const entry: Entry = { item, photo: take(item.photo, 640) }
      const list = byDay.get(item.day_offset)
      if (list) list.push(entry)
      else byDay.set(item.day_offset, [entry])
    }
    return [...byDay.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([offset, entries]) => ({ dayNumber: offset + 1, entries }))
  }

  const refs = new Set(s.destinations.map((d) => d.ref))
  const stops: Stop[] = [...s.destinations]
    .sort((a, b) => a.day_offset - b.day_offset)
    .map((d) => ({
      destination: d,
      // Claimed before the items so the big image is the one that survives.
      photo: take(d.photo, 1200),
      days: toDays(s.items.filter((i) => i.destination_ref === d.ref)),
    }))

  const orphans = s.items.filter(
    (i) => !i.destination_ref || !refs.has(i.destination_ref)
  )
  if (orphans.length)
    stops.push({ destination: null, photo: null, days: toDays(orphans) })
  return stops
}

// ---------------------------------------------------------------------------
// Metadata — what the link looks like when it is pasted into a message
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  // Promises since Next 15. Reading them synchronously typechecks and then
  // reads undefined at runtime — the bug that 404'd every web trip for six days.
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const guide = await loadGuide(slug)
  if (!guide) return { title: "Trip not found · Drift" }

  const { row, snapshot } = guide
  const title = snapshot.title || "A trip on Drift"
  const description = openingLine(row, snapshot)
  const url = guideUrl(row.slug)
  // Absolute already (Wikimedia). A relative og:image unfurls as no image at
  // all, and there is no render-time signal when that happens.
  const image = photoAt(row.hero_url, 1200)

  return {
    title: `${title} · Drift`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      siteName: "Drift",
      url,
      title,
      description,
      ...(image ? { images: [{ url: image, width: 1200, height: 800, alt: title }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PublicGuidePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const guide = await loadGuide(slug)
  if (!guide) notFound()

  const { row, snapshot } = guide
  const stops = buildStops(snapshot, row.hero_url)
  const opening = openingLine(row, snapshot)
  const season = bestWindowLabel(row.best_months ?? [])
  const tags = (row.tags ?? [])
    .map((t) => categoryName(t))
    .filter((n): n is string => !!n)
  const hero = photoAt(row.hero_url, 1600)
  const itemCount = snapshot.items.length

  return (
    <main className="min-h-screen bg-aurora-midnight font-drift-body text-aurora-ink overflow-x-hidden">
      {/* Fraunces (display) — Inter comes from the root layout. */}
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&display=swap"
        rel="stylesheet"
      />

      {/* Hero */}
      <header className="relative">
        <div className="relative h-[46vh] min-h-[300px] w-full overflow-hidden">
          {hero && (
            <OptimizedImg
              src={hero}
              alt=""
              fill
              priority
              className="h-full w-full object-cover"
            />
          )}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(8,19,29,0.35) 0%, rgba(8,19,29,0.55) 45%, rgba(8,19,29,0.92) 82%, #08131D 100%)",
            }}
          />
          {/* The credit belongs wherever the photo is, and this is the most
              exposed photo we have: a public page that unfurls into messages.
              Unsplash's API Terms bind attribution to the DISPLAY, and Commons
              needs its author and licence — so it renders here, not on some
              other screen the reader will never open. Pinned above the gradient
              so it never lands on the title below it. */}
          {row.hero_attribution && (
            <CoverCredit text={row.hero_attribution} href={row.hero_link} />
          )}
        </div>

        <div className="relative -mt-32 md:-mt-40 mx-auto max-w-3xl px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-aurora-border bg-aurora-glass px-3.5 py-1.5 text-xs text-aurora-ink2">
              <span className="h-1.5 w-1.5 rounded-full bg-aurora-teal" />
              A real trip, on Drift
            </span>
            {season && (
              <span className="rounded-full border border-aurora-border px-3 py-1.5 text-[11px] tracking-[0.14em] text-aurora-ink3">
                {season}
              </span>
            )}
          </div>

          <h1 className="font-drift-display text-4xl md:text-6xl font-semibold leading-[1.06] mt-5">
            {snapshot.title}
          </h1>

          <p className="mt-4 text-[17px] leading-relaxed text-aurora-ink2">
            {opening}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-aurora-ink3">
            {snapshot.day_count > 0 && <span>{snapshot.day_count} days</span>}
            <Dot />
            <span>
              {snapshot.destinations.length}{" "}
              {snapshot.destinations.length === 1 ? "stop" : "stops"}
            </span>
            {itemCount > 0 && (
              <>
                <Dot />
                <span>{itemCount} places</span>
              </>
            )}
            {snapshot.countries.length > 0 && (
              <>
                <Dot />
                <span>{snapshot.countries.join(", ")}</span>
              </>
            )}
          </div>

          {(row.author_handle || tags.length > 0) && (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {row.author_handle && (
                <span className="inline-flex items-center gap-2 text-sm text-aurora-ink2">
                  {row.author_avatar_url && (
                    <span className="relative h-7 w-7 overflow-hidden rounded-full border border-aurora-border">
                      <OptimizedImg
                        src={row.author_avatar_url}
                        alt=""
                        fill
                        className="h-full w-full object-cover"
                      />
                    </span>
                  )}
                  Travelled by @{row.author_handle}
                </span>
              )}
              {tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-aurora-glass border border-aurora-border px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-aurora-ink3"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* The guide itself — whole, ungated. */}
      <div className="mx-auto max-w-3xl px-6 pt-14 pb-20 space-y-16">
        {stops.map((stop, index) => (
          <StopSection
            key={stop.destination?.ref ?? `orphans-${index}`}
            stop={stop}
            index={index}
          />
        ))}

        {/* THE ASK, and only here. */}
        <section className="relative overflow-hidden rounded-hero border border-aurora-border bg-aurora-glass px-6 py-10 md:py-12 text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(70% 80% at 50% 100%, rgba(55,214,196,0.12), transparent 70%)",
            }}
          />
          <div className="relative">
            <h2 className="font-drift-display text-2xl md:text-3xl font-medium mb-3">
              This trip, on your dates
            </h2>
            <p className="mx-auto mb-7 max-w-md text-sm text-aurora-ink2">
              Drift fits this route to your dates and your days, then keeps the
              plan, the bookings and the costs in one place for everyone coming.
            </p>
            {/* The tailor screen for this exact pattern — via /start, which
                writes down where they were going before the app's own gate asks
                for a sign-in. Linking straight at /app/inspire/<id> sent every
                signed-out reader to login and then to the app home, with no
                trace of the trip they had just read and been promised. */}
            <a
              href={`/i/${row.slug}/start`}
              className="inline-flex items-center gap-2 rounded-full bg-aurora-teal px-8 py-3.5 font-semibold text-aurora-teal-ink shadow-aurora-glow transition-transform hover:scale-[1.02]"
            >
              Make this trip mine
            </a>
            <p className="mt-5">
              <a
                href="/"
                className="text-xs text-aurora-ink3 transition-colors hover:text-aurora-ink2"
              >
                What is Drift?
              </a>
            </p>
          </div>
        </section>
      </div>

      <footer className="border-t border-aurora-border py-8 text-center">
        <p className="text-xs text-aurora-ink3">Drift</p>
      </footer>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Bits
// ---------------------------------------------------------------------------

function Dot() {
  return <span className="text-aurora-ink3/50">·</span>
}

function StopSection({ stop, index }: { stop: Stop; index: number }) {
  const d = stop.destination
  const name = d ? d.name ?? d.city ?? "Stop" : "Also on this trip"
  const where = d
    ? [d.city && d.city !== name ? d.city : null, d.country]
        .filter(Boolean)
        .join(", ")
    : ""
  const photo = stop.photo

  return (
    <section>
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="font-drift-display text-lg text-aurora-teal tabular-nums">
          {String(index + 1).padStart(2, "0")}
        </span>
        <h2 className="font-drift-display text-3xl font-medium">{name}</h2>
        {d && d.nights > 0 && (
          <span className="text-sm text-aurora-ink3">{nightsWord(d.nights)}</span>
        )}
      </div>
      {where && <p className="mt-1 pl-9 text-sm text-aurora-ink3">{where}</p>}

      {photo && (
        <div className="relative mt-5 aspect-[16/9] overflow-hidden rounded-hero border border-aurora-border bg-aurora-glass">
          <OptimizedImg src={photo} alt={name} fill className="h-full w-full object-cover" />
        </div>
      )}

      <div className="mt-6 space-y-8">
        {stop.days.map((day) => (
          <div key={day.dayNumber}>
            <div className="mb-3 flex items-center gap-3">
              <span className="text-[11px] uppercase tracking-[0.25em] text-aurora-ink3">
                Day {day.dayNumber}
              </span>
              <div className="h-px flex-1 bg-aurora-border" />
            </div>
            <ul className="space-y-4">
              {day.entries.map((entry, i) => (
                <ItemCard
                  key={entry.item.source_step_id ?? `${day.dayNumber}-${i}`}
                  entry={entry}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

function ItemCard({ entry }: { entry: Entry }) {
  const { item, photo } = entry
  const title = item.title ?? item.location_name ?? "A stop"
  const label = typeLabel(item)

  return (
    <li className="overflow-hidden rounded-card border border-aurora-border bg-aurora-glass">
      <div className="sm:flex">
        {photo && (
          <div className="relative aspect-[16/10] w-full overflow-hidden sm:aspect-auto sm:w-44 sm:shrink-0 sm:self-stretch">
            <OptimizedImg src={photo} alt={title} fill className="h-full w-full object-cover" />
          </div>
        )}
        {/* min-w-0 so a long unbroken word wraps instead of setting the row's
            width and pushing the card off the screen. */}
        <div className="min-w-0 flex-1 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            {label && (
              <span className="rounded-full border border-aurora-border bg-aurora-glass2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-aurora-ink3">
                {label}
              </span>
            )}
            {item.step_type === "stay" && item.nights > 0 && (
              <span className="text-[11px] text-aurora-ink3">
                {nightsWord(item.nights)}
              </span>
            )}
          </div>
          <h3 className="mt-1.5 font-drift-display text-xl font-medium leading-snug break-words">
            {title}
          </h3>
          {item.notes && (
            <p className="mt-1.5 text-[15px] leading-relaxed text-aurora-ink2 break-words">
              {item.notes}
            </p>
          )}
          {item.location_name && item.location_name !== title && (
            <p className="mt-1.5 text-xs text-aurora-ink3 break-words">
              {item.location_name}
            </p>
          )}
        </div>
      </div>
    </li>
  )
}
