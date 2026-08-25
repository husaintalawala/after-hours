"use client"

import { useState } from "react"
import OptimizedImg from "@/components/app/OptimizedImg"
import BackLink from "@/components/app/BackLink"
import TailorPanel from "@/components/app/inspire/TailorPanel"
import {
  bestWindowLabel,
  monthShort,
  nightsWord,
  type InspirePattern,
  type YearMonth,
} from "@/lib/drift/inspire"

// The block pattern.
//
// This screen's whole job is to show the SHAPE and be honest about what a
// tailored copy will and will not bring. A block pattern is an ORDER and a set
// of DURATIONS — the knowledge you cannot search for — so it is drawn as a
// spine, stop by stop, with the nights on each.
//
// Nothing here is booked and nothing pretends to be. The line under the button
// says so plainly, because a copy that quietly carried someone else's hotels or
// prices would be the worst bug this feature could have.

export default function PatternView({
  pattern,
  months,
}: {
  pattern: InspirePattern
  months: YearMonth[]
}) {
  // The tailor is a state of this screen, not a route: the pattern is what you
  // are altering, and going "back" from the alteration must return you to it
  // rather than to wherever you came from.
  const [tailoring, setTailoring] = useState(false)
  const s = pattern.snapshot

  if (tailoring) {
    return <TailorPanel pattern={pattern} months={months} onCancel={() => setTailoring(false)} />
  }

  const stops = s.destinations.length
  const shapeSummary = [
    `${s.day_count} days`,
    stops > 0 ? (stops === 1 ? "1 stop" : `${stops} stops`) : null,
    s.countries[0] ?? null,
  ]
    .filter(Boolean)
    .join(" · ")

  const window = bestWindowLabel(pattern.bestMonths)
  const longest = Math.max(0, ...s.destinations.map((d) => d.nights))
  const soleLongest =
    s.destinations.length > 1 && s.destinations.filter((d) => d.nights === longest).length === 1

  return (
    <main className="mx-auto w-full max-w-2xl pb-44">
      {/* ---- Hero ---- */}
      <div className="relative h-[300px] w-full overflow-hidden sm:mt-4 sm:rounded-hero">
        {pattern.heroUrl ? (
          <OptimizedImg
            src={pattern.heroUrl}
            alt=""
            fill
            priority
            sizes="(max-width: 768px) 100vw, 672px"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-aurora-midnight2" />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 40%, rgba(0,0,0,0.88))",
          }}
        />
        <div className="absolute left-4 top-4">
          {/* The LOGICAL parent — the shelf this pattern came off — so back
              resolves on a cold deep link, not just on history. */}
          <BackLink href="/app/inspire" label="Inspire" />
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4">
          <h1 className="font-drift-display text-[31px] font-bold leading-tight text-white">
            {s.title}
          </h1>
          <p className="mt-1.5 text-[13px] text-white/85">{shapeSummary}</p>
          {/* Attribution is not decoration. A pattern made from a real person's
              trip carries their name, and that is also what makes it credible. */}
          {pattern.authorHandle && (
            <div className="mt-2.5 flex items-center gap-2">
              {pattern.authorAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pattern.authorAvatarUrl}
                  alt=""
                  className="h-[19px] w-[19px] rounded-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="h-[19px] w-[19px] rounded-full bg-aurora-indigo" />
              )}
              <span className="text-[12px] text-white/75">
                Shaped from {pattern.authorHandle}&apos;s trip
              </span>
            </div>
          )}
        </div>
      </div>

      {pattern.blurb && (
        <p className="mt-5 px-4 text-[14.5px] leading-relaxed text-aurora-ink2">{pattern.blurb}</p>
      )}

      {/* ---- When it works ---- */}
      {pattern.bestMonths.length > 0 && (
        <section className="mt-6 px-4">
          <div className="flex items-baseline justify-between gap-3">
            <Kicker>When it works</Kicker>
            {/* Season only RANKS a pattern, it never hides one. An out-of-season
                trip still shows, with its window on its face. */}
            {window && (
              <span className="shrink-0 text-[11.5px] font-bold tracking-[0.12em] text-aurora-teal">
                {window}
              </span>
            )}
          </div>
          <div className="mt-2.5 flex gap-[3px]">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const good = pattern.bestMonths.includes(m)
              return (
                <span
                  key={m}
                  title={monthShort(m)}
                  className={`flex-1 rounded-[5px] py-[5px] text-center text-[9px] ${
                    good
                      ? "bg-aurora-teal/15 font-bold text-aurora-teal"
                      : "bg-aurora-glass font-normal text-aurora-ink3"
                  }`}
                >
                  {monthShort(m).charAt(0)}
                </span>
              )
            })}
          </div>
        </section>
      )}

      {/* ---- The shape ---- */}
      <section className="mt-7 px-4">
        <Kicker>The shape</Kicker>
        <ol className="mt-2.5">
          {s.destinations.map((d, i) => {
            const isLast = i === s.destinations.length - 1
            const spots = s.items
              .filter((it) => it.destination_ref === d.ref && it.step_type !== "stay")
              .map((it) => it.title ?? it.location_name)
              .filter((t): t is string => !!t)
              .slice(0, 3)
            // The longest stop gets a word about why. A number alone does not
            // tell you that three nights in Petra is the point of the trip.
            const nights = Math.max(0, d.nights)
            const detail =
              soleLongest && nights === longest
                ? `${nightsWord(nights)} — the one to give time to`
                : nightsWord(nights)
            return (
              <li key={`${d.ref}-${i}`} className="flex items-start gap-3">
                <span className="flex w-[26px] shrink-0 flex-col items-center self-stretch">
                  <span className="mt-[5px] h-[11px] w-[11px] shrink-0 rounded-full bg-aurora-teal" />
                  {!isLast && <span className="w-[2px] flex-1 bg-aurora-teal/35" />}
                </span>
                <div className={`min-w-0 flex-1 ${isLast ? "" : "pb-4"}`}>
                  <p className="font-drift-display text-[16px] font-semibold text-aurora-ink">
                    {d.name ?? "—"}
                  </p>
                  <p className="mt-0.5 text-[12px] text-aurora-ink3">{detail}</p>
                  {spots.length > 0 && (
                    <p className="mt-1.5 line-clamp-2 text-[12px] text-aurora-ink2">
                      {spots.join(" · ")}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </section>

      {/* ---- CTA ---- */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-aurora-border bg-aurora-midnight/95 px-4 pb-5 pt-3 backdrop-blur lg:bottom-0 lg:left-[76px]">
        <div className="mx-auto w-full max-w-2xl">
          {/* The verb is TAILOR, not copy. What comes next is an alteration, and
              the button must not promise a duplicate. */}
          <button
            onClick={() => setTailoring(true)}
            className="h-[52px] w-full rounded-2xl bg-aurora-teal text-[15.5px] font-bold text-aurora-teal-ink transition-transform active:scale-[0.99]"
          >
            Tailor this to my days
          </button>
          <p className="mt-2 text-center text-[11.5px] text-aurora-ink3">
            Stops, nights and places. No bookings, no prices.
          </p>
        </div>
      </div>
    </main>
  )
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-aurora-ink3">{children}</p>
  )
}
