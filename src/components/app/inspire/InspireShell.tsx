"use client"

import { useState } from "react"
import Link from "next/link"
import TripCoverImg from "@/components/app/TripCoverImg"
import OptimizedImg from "@/components/app/OptimizedImg"
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

export default function InspireShell({
  cards,
  categories,
  months,
}: {
  cards: InspireCard[]
  categories: InspireCategory[]
  months: InspireMonth[]
}) {
  const [category, setCategory] = useState<string | null>(null)
  const [monthKey, setMonthKey] = useState<string | null>(null)

  const selectedMonth = months.find((m) => m.key === monthKey) ?? null
  const categoryLabel = categories.find((c) => c.slug === category)?.label ?? null

  const filtered = category ? cards.filter((c) => c.tags.includes(category)) : cards

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
              active={category === null}
              onClick={() => setCategory(null)}
            />
            {categories.map((c) => (
              <CategoryTile
                key={c.slug}
                label={c.label}
                count={c.count}
                active={category === c.slug}
                onClick={() => setCategory(category === c.slug ? null : c.slug)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <Kicker>When you could go</Kicker>
        <div className={`${RAIL} mt-2.5`}>
          <MonthChip label="Any" active={monthKey === null} onClick={() => setMonthKey(null)} />
          {months.map((m) => (
            <MonthChip
              key={m.key}
              label={m.label}
              sub={m.yearLabel}
              active={monthKey === m.key}
              onClick={() => setMonthKey(monthKey === m.key ? null : m.key)}
            />
          ))}
        </div>
      </section>

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

/** 96×104. The count is not decoration: a category that cannot say how much is
 *  behind it is a door you open to find out, which is one tap of nothing. */
function CategoryTile({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-[104px] w-[96px] shrink-0 flex-col justify-between rounded-2xl border p-2.5 text-left transition-colors ${
        active
          ? "border-aurora-teal bg-drift-coral-50 text-aurora-ink"
          : "border-aurora-border bg-aurora-glass text-aurora-ink hover:bg-aurora-glass2"
      }`}
    >
      <span
        className={`text-[20px] font-bold leading-none ${
          active ? "text-aurora-teal" : "text-aurora-ink"
        }`}
      >
        {count}
      </span>
      <span className="text-[12.5px] font-semibold leading-[1.2]">{label}</span>
    </button>
  )
}

function MonthChip({
  label,
  sub,
  active,
  onClick,
}: {
  label: string
  sub?: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] transition-colors ${
        active
          ? "bg-aurora-teal font-bold text-aurora-teal-ink"
          : "bg-aurora-glass font-medium text-drift-muted hover:text-aurora-ink"
      }`}
    >
      {label}
      {sub && <span className="ml-1 opacity-70">{sub}</span>}
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
            <SourceChip source={card.source} />
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
