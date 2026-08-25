"use client"

import { useState } from "react"
import Link from "next/link"
import TripCoverImg from "@/components/app/TripCoverImg"
import OptimizedImg from "@/components/app/OptimizedImg"
import CoverCredit from "@/components/app/CoverCredit"
import type { TripCoverResult } from "@/lib/drift/tripCover"
import type {
  InspireCard,
  InspireCategory,
  InspireMonth,
  InspireSource,
  InspireStop,
} from "@/app/app/(protected)/inspire/page"

// The browse half of Inspire. Every card is offering a SHAPE — an order and a
// count of nights somebody actually travelled — and the tailoring happens one
// screen in. So the job here is to make the shape legible, and to make the two
// ways of narrowing behave differently and visibly:
//
//   CATEGORY is a FILTER. You asked for old stones; you get old stones.
//   MONTH is a RANK. Season never hides a trip — a place is not closed in
//   February, it is just better in October, and the card says so on its face.
//
// Only those two need state, which is why this is the one client island.

/** The shared rail track — same string ActivityShell uses for its rails. */
const RAIL =
  "flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"

const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

/** The names of the months holding a given count, as prose: "March and
 *  October", "July, August and December". Two is the readable limit for a
 *  clause in the middle of a sentence, so a longer tie prints the first two and
 *  says so. */
function nameMonths(months: number[]): string {
  const names = months.map((m) => MONTH_LONG[m - 1])
  if (names.length === 0) return ""
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`
}

export default function InspireShell({
  cards,
  categories,
  months,
  everythingCover,
}: {
  cards: InspireCard[]
  categories: InspireCategory[]
  months: InspireMonth[]
  everythingCover: TripCoverResult
}) {
  const [category, setCategory] = useState<string | null>(null)
  const [monthKey, setMonthKey] = useState<string | null>(null)

  const selectedMonth = months.find((m) => m.key === monthKey) ?? null
  const categoryLabel = categories.find((c) => c.slug === category)?.label ?? null

  const filtered = category ? cards.filter((c) => c.tags.includes(category)) : cards

  // THE YEAR, MEASURED. Twelve real counts off the shelf you are actually
  // looking at — so the chart and the band header below can never disagree
  // about how many trips suit October.
  const counts = months.map((m) => filtered.filter((c) => c.bestMonths.includes(m.month)).length)
  const peakCount = Math.max(0, ...counts)
  const troughCount = counts.length ? Math.min(...counts) : 0
  const peaks = months.filter((_, i) => counts[i] === peakCount && peakCount > 0).map((m) => m.month)
  const troughs = months
    .filter((_, i) => counts[i] === troughCount && troughCount < peakCount)
    .map((m) => m.month)

  const shapeClause =
    peaks.length && peaks.length < 6
      ? troughs.length && troughs.length < 6
        ? `fullest in ${nameMonths(peaks)}, thinnest in ${nameMonths(troughs)}`
        : `fullest in ${nameMonths(peaks)}`
      : "spread evenly across the year"

  const selectedCount = selectedMonth ? counts[months.indexOf(selectedMonth)] : 0
  const monthSentence = selectedMonth
    ? `${selectedCount} of ${filtered.length} suit ${MONTH_LONG[selectedMonth.month - 1]} — this shelf is ${shapeClause}.`
    : `This shelf is ${shapeClause} — pick a month to bring those to the top.`

  // The rank. Order inside each group is the curated rank the server sent, so a
  // month reorders the shelf without scrambling it.
  const inSeason = selectedMonth
    ? filtered.filter((c) => c.bestMonths.includes(selectedMonth.month))
    : filtered
  const offSeason = selectedMonth
    ? filtered.filter((c) => !c.bestMonths.includes(selectedMonth.month))
    : []

  // The corpus skews long — most of it is ten days or more — and most people
  // take shorter trips than that. Only offered on the unfiltered shelf, where it
  // is a way in rather than a second copy of a list you are already reading.
  const shorter = !category && !selectedMonth ? cards.filter((c) => c.dayCount <= 8) : []

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-28 pt-6">
      <h1 className="font-drift-display text-3xl font-medium tracking-tight text-aurora-ink">
        Inspire
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-drift-muted">
        Real trips, in the order and the nights they were actually taken. Find one that fits, then
        tailor it to your dates.
      </p>

      {categories.length > 0 && (
        <section className="mt-5">
          <div className={RAIL}>
            <CategoryTile
              label="Everything"
              count={cards.length}
              cover={everythingCover}
              active={category === null}
              onClick={() => setCategory(null)}
            />
            {categories.map((c) => (
              <CategoryTile
                key={c.slug}
                label={c.label}
                count={c.count}
                cover={c.cover}
                active={category === c.slug}
                onClick={() => setCategory(category === c.slug ? null : c.slug)}
              />
            ))}
          </div>
          {/* Every photo on those tiles is somebody else's. One credit line for
              the rail rather than a chip on each 180px door. */}
          <p className="mt-1.5 text-[10.5px] text-aurora-ink3">
            Tile photos:{" "}
            <a
              className="underline decoration-white/20 underline-offset-2 hover:text-aurora-ink2"
              href="https://unsplash.com/?utm_source=drift&utm_medium=referral"
              target="_blank"
              rel="noreferrer noopener"
            >
              Unsplash
            </a>{" "}
            ·{" "}
            <a
              className="underline decoration-white/20 underline-offset-2 hover:text-aurora-ink2"
              href="https://commons.wikimedia.org"
              target="_blank"
              rel="noreferrer noopener"
            >
              Wikimedia Commons
            </a>
          </p>
        </section>
      )}

      <MonthChart
        months={months}
        counts={counts}
        peakCount={peakCount}
        selectedKey={monthKey}
        sentence={monthSentence}
        onSelect={(k) => setMonthKey(monthKey === k ? null : k)}
        onClear={() => setMonthKey(null)}
      />

      {shorter.length > 1 && (
        <section className="mt-7 border-t border-aurora-border pt-6">
          {/* One kicker line, not a title + right-aligned kicker: "UNDER A WEEK
              AND A BIT" is 22 characters of letter-spaced caps and reached the
              right padding edge dead-on at 375px, so it clipped on any narrower
              phone. */}
          <Kicker>Shorter · under a week and a bit</Kicker>
          <div className={`${RAIL} mt-3`}>
            {shorter.map((c) => (
              <CompactCard key={c.tripId} card={c} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-7 border-t border-aurora-border pt-6">
        <BandHeader
          title={categoryLabel ?? "Every pattern"}
          kicker={
            selectedMonth
              ? `${inSeason.length} SUIT ${selectedMonth.label.toUpperCase()}`
              : `${filtered.length} TRIP${filtered.length === 1 ? "" : "S"}`
          }
        />

        {inSeason.length === 0 && offSeason.length === 0 ? (
          <Empty
            title="Nothing here yet"
            body="Try another category — every trip on this shelf is one somebody actually took."
          />
        ) : (
          <div className="mt-4 space-y-7">
            {inSeason.map((c) => (
              <Card key={c.tripId} card={c} month={selectedMonth} />
            ))}
          </div>
        )}

        {offSeason.length > 0 && (
          <>
            {/* Season RANKS, it never hides. These are still real trips you can
                take in the month you picked — they are simply better later, and
                each one says when. */}
            <div className="mt-8 border-t border-aurora-border pt-5">
              <Kicker>
                Better in another month — still yours to take
              </Kicker>
            </div>
            <div className="mt-4 space-y-7">
              {offSeason.map((c) => (
                <Card key={c.tripId} card={c} month={selectedMonth} offSeason />
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  )
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-drift-muted">{children}</p>
  )
}

function BandHeader({ title, kicker }: { title: string; kicker?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="font-drift-display text-[20px] font-bold text-aurora-ink">{title}</h2>
      {kicker && (
        <span className="shrink-0 text-[12px] font-bold uppercase tracking-[0.12em] text-drift-muted">
          {kicker}
        </span>
      )}
    </div>
  )
}

/**
 * THE YEAR AS A CHART, not twelve identical pills.
 *
 * Twelve chips said nothing: every month looked equally good, so the only way
 * to find out that August has 8 trips behind it and October 19 was to tap all
 * twelve. The heights are the real counts off the shelf below, so the shape of
 * the corpus — heavy shoulders, a thin northern summer — is readable before you
 * touch anything.
 *
 * The current month is drawn dashed and muted rather than removed: you cannot
 * leave today, and its key already points a year out, so picking it is a real
 * choice that simply means "next August".
 */
function MonthChart({
  months,
  counts,
  peakCount,
  selectedKey,
  sentence,
  onSelect,
  onClear,
}: {
  months: InspireMonth[]
  counts: number[]
  peakCount: number
  selectedKey: string | null
  sentence: string
  onSelect: (key: string) => void
  onClear: () => void
}) {
  const TRACK = 76 // px of drawable column
  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between gap-3">
        <Kicker>When you could go</Kicker>
        <button
          type="button"
          onClick={onClear}
          className={`shrink-0 text-[11.5px] font-bold uppercase tracking-[0.12em] transition-colors ${
            selectedKey ? "text-aurora-teal hover:text-aurora-ink" : "text-aurora-ink3"
          }`}
          aria-pressed={selectedKey === null}
        >
          Any month
        </button>
      </div>

      <div className="mt-3 flex items-end gap-[3px]" role="group" aria-label="Trips by month">
        {months.map((m, i) => {
          const n = counts[i]
          const active = selectedKey === m.key
          // Floor at 4px so an empty month is still a column you can press,
          // rather than a gap you assume is broken.
          const h = peakCount > 0 ? Math.max(4, Math.round((n / peakCount) * TRACK)) : 4
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => onSelect(m.key)}
              aria-pressed={active}
              aria-label={`${MONTH_LONG[m.month - 1]}${m.yearLabel ? ` ${m.yearLabel}` : ""}, ${n} trip${n === 1 ? "" : "s"}${m.isCurrent ? ", this month" : ""}`}
              className="group flex flex-1 flex-col items-center gap-1.5 rounded-lg py-1 outline-none focus-visible:ring-2 focus-visible:ring-aurora-teal/50"
            >
              <span
                className={`text-[10px] font-bold leading-none transition-colors ${
                  active ? "text-aurora-teal" : "text-aurora-ink3 group-hover:text-aurora-ink2"
                }`}
              >
                {n}
              </span>
              <span
                style={{ height: h }}
                className={`w-full rounded-[4px] transition-colors ${
                  active
                    ? "bg-aurora-teal"
                    : m.isCurrent
                      ? "border border-dashed border-aurora-ink3/70 bg-transparent"
                      : "bg-aurora-glass2 group-hover:bg-aurora-border-strong"
                }`}
              />
              <span
                className={`text-[9.5px] leading-none tracking-tight transition-colors ${
                  active
                    ? "font-bold text-aurora-teal"
                    : m.isCurrent
                      ? "font-medium text-aurora-ink3"
                      : "font-medium text-drift-muted"
                }`}
              >
                {m.label}
              </span>
            </button>
          )
        })}
      </div>

      <p className="mt-2.5 text-[12.5px] leading-relaxed text-drift-muted">{sentence}</p>
    </section>
  )
}

/**
 * A door with a photo on it. 180×112, the cover of the strongest trip in the
 * category behind a scrim, the name bottom-left, the count as a chip — because
 * a category that cannot say how much is behind it is a door you open to find
 * out, which is one tap of nothing.
 */
function CategoryTile({
  label,
  count,
  cover,
  active,
  onClick,
}: {
  label: string
  count: number
  cover: TripCoverResult
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label}, ${count} trip${count === 1 ? "" : "s"}`}
      className={`relative h-[112px] w-[180px] shrink-0 overflow-hidden rounded-2xl text-left outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-aurora-teal/50 ${
        active ? "ring-2 ring-aurora-teal" : "ring-1 ring-aurora-border"
      }`}
    >
      <TripCoverImg cover={cover} sizes="180px" showCredit={false} />
      <span
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.10) 38%, rgba(0,0,0,0.80))",
        }}
      />
      <span
        className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-extrabold leading-tight ${
          active ? "bg-aurora-teal text-aurora-teal-ink" : "bg-black/55 text-white"
        }`}
      >
        {count}
      </span>
      {/* min-w-0 + the block below it: a long name ("Eat your way through") must
          wrap inside the tile, never set its width. */}
      <span className="absolute inset-x-0 bottom-0 block p-2.5">
        <span className="block text-[13px] font-bold leading-[1.15] text-white">{label}</span>
      </span>
    </button>
  )
}

/**
 * The shape, drawn. "Amman 2 · Petra 3 · Wadi Rum 2 · Dead Sea 1" — the nights
 * dimmer than the places so the run of towns reads first and the rhythm reads
 * second. The link that wraps it spells the whole thing out for aria.
 */
function Shape({ stops, className = "" }: { stops: InspireStop[]; className?: string }) {
  return (
    <p className={className} aria-hidden="true">
      {stops.map((s, i) => (
        <span key={`${s.name}-${i}`}>
          {i > 0 && <span className="text-aurora-ink3"> · </span>}
          <span className="text-aurora-ink2">{s.name}</span>{" "}
          <span className="text-aurora-ink3">{s.nights}</span>
        </span>
      ))}
    </p>
  )
}

/**
 * A sourced photo never renders bare. This sits ABOVE the stretched link rather
 * than inside it — an anchor may not contain another anchor, so the two are
 * siblings and the chip simply wins the stacking order over its own few pixels.
 */
function SourceChip({ source }: { source: InspireSource | null }) {
  if (!source) return null
  return (
    <a
      href={source.href}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(e) => e.stopPropagation()}
      className="pointer-events-auto rounded-full bg-black/50 px-2 py-1 text-[10px] leading-none text-white/85 backdrop-blur-sm transition-colors hover:bg-black/65"
    >
      {source.label}
    </a>
  )
}

function Card({
  card,
  month,
  offSeason = false,
}: {
  card: InspireCard
  month: InspireMonth | null
  offSeason?: boolean
}) {
  const season = card.seasonText ? `Best ${card.seasonText}` : null
  return (
    <article className="relative">
      <div className="relative h-[196px] overflow-hidden rounded-3xl">
        <TripCoverImg
          cover={card.cover}
          sizes="(max-width: 1024px) 100vw, 640px"
          showCredit={false}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, transparent 40%, rgba(0,0,0,0.82))",
          }}
        />
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3.5">
          <div className="flex items-start justify-between gap-2">
            <span className="flex flex-wrap gap-1.5">
              {card.tagLabel && (
                <span className="rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-bold tracking-wide text-white">
                  {card.tagLabel}
                </span>
              )}
              {month && !offSeason && (
                <span className="rounded-full bg-aurora-teal px-2.5 py-1 text-[11px] font-extrabold tracking-wide text-aurora-teal-ink">
                  GOOD IN {month.label.toUpperCase()}
                </span>
              )}
            </span>
            {/* Prefer the real credit now that it exists on every row: the
                author's name is what both licences actually ask for, and
                CoverCredit carries the link. SourceChip remains the fallback so
                a photo we did not take is never bare. */}
            {card.heroAttribution ? (
              <CoverCredit
                text={card.heroAttribution}
                href={card.heroLink}
                placement="inline"
              />
            ) : (
              <SourceChip source={card.source} />
            )}
          </div>
          <p className="font-drift-display text-[26px] font-bold leading-none text-white">
            {card.headline}
          </p>
        </div>
      </div>

      <div className="mt-2.5">
        <Shape stops={card.stops} className="text-[14px] leading-relaxed" />
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-1.5">
            {card.authorAvatar && (
              <span className="block h-[18px] w-[18px] shrink-0 overflow-hidden rounded-full">
                <OptimizedImg
                  src={card.authorAvatar}
                  alt=""
                  width={18}
                  height={18}
                  className="h-full w-full object-cover"
                />
              </span>
            )}
            <span className="truncate text-[12.5px] text-drift-muted">
              {card.authorHandle ? `@${card.authorHandle}` : "A Drift traveller"}
            </span>
          </span>
          {season && (
            <span className="shrink-0 text-[11.5px] font-bold uppercase tracking-[0.1em] text-aurora-ink3">
              {season}
            </span>
          )}
        </div>
      </div>

      {/* Stretched link, not a wrapper: the source chip is an anchor of its own
          and cannot legally sit inside this one. */}
      <Link
        href={`/app/inspire/${card.tripId}`}
        aria-label={`${card.headline}. ${card.title}. ${card.shapeText}.`}
        className="absolute inset-0 rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-aurora-teal/50"
      />
    </article>
  )
}

/** The Shorter rail's tile. Same offer, one swipe wide. */
function CompactCard({ card }: { card: InspireCard }) {
  return (
    <article className="relative w-[212px] shrink-0">
      <div className="relative h-[124px] overflow-hidden rounded-2xl">
        <TripCoverImg cover={card.cover} sizes="212px" showCredit={false} />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.78))" }}
        />
        <p className="pointer-events-none absolute inset-x-0 bottom-0 p-2.5 font-drift-display text-[16px] font-bold leading-tight text-white">
          {card.headline}
        </p>
      </div>
      <Shape stops={card.stops} className="mt-2 truncate text-[12.5px]" />
      <Link
        href={`/app/inspire/${card.tripId}`}
        aria-label={`${card.headline}. ${card.title}. ${card.shapeText}.`}
        className="absolute inset-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-aurora-teal/50"
      />
    </article>
  )
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-6">
      <p className="font-drift-display text-[22px] font-bold text-aurora-ink">{title}</p>
      <p className="mt-1.5 text-[14px] text-drift-muted">{body}</p>
    </div>
  )
}
