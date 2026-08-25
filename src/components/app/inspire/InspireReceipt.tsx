"use client"

import { useState } from "react"
import Link from "next/link"
import OptimizedImg from "@/components/app/OptimizedImg"
import {
  formatDay,
  nightsWord,
  normName,
  tailoringCollapsed,
  type CopiedTrip,
  type InspirePattern,
  type TailoredDropped,
} from "@/lib/drift/inspire"

// What you land on after a copy.
//
// The one thing this screen owes you is an account of what was ALTERED, in the
// language a person would use. Not a disclaimer — a RECEIPT: what was
// protected, what was cut to fit, and what deliberately did not come.
//
// It is dismissible, because it is a receipt. A permanent banner would be the
// app apologising for its own feature.
//
// AND IT MUST NEVER LOOK BOOKED. A trip that arrived carrying someone else's
// hotels would be the worst bug this feature could have, so every stop says
// plainly that it still needs a stay.

export default function InspireReceipt({
  pattern,
  copied,
  tailorDropped,
}: {
  pattern: InspirePattern
  copied: CopiedTrip
  /** What the TAILORING cut. Distinct from `copied.dropped`, which is what the
   *  writer refused — and the two are not interchangeable. */
  tailorDropped: TailoredDropped[]
}) {
  const [receiptShown, setReceiptShown] = useState(true)
  const s = pattern.snapshot

  // Every date here is a calendar day the SERVER computed. UTC-pinned on
  // purpose: formatted in the browser zone they render the previous day for
  // everyone west of UTC, so the tailor screen would promise "back Thu 14 Oct"
  // and this screen, one click later, would say the trip ends on the 13th.
  const long: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }
  const short: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }
  const span = copied.endDay
    ? `${formatDay(copied.startDay, long)} – ${formatDay(copied.endDay, long)}`
    : formatDay(copied.startDay, long)
  const metaLine = `${span} · ${copied.stops.length} ${copied.stops.length === 1 ? "stop" : "stops"}`

  const provenance = `Tailored from ${pattern.authorHandle ?? "a real trip"}'s ${s.day_count} days`

  // ---- What was protected -------------------------------------------------
  // The protected stop, named. This is the sentence that makes the alteration
  // legible rather than magical.
  const longest = [...copied.stops].sort((a, b) => b.nights - a.nights)[0]
  const keptLines: string[] = []
  if (longest && longest.nights > 0) {
    const original = s.destinations.find((d) => normName(d.name) === normName(longest.name))?.nights
    keptLines.push(
      original === longest.nights
        ? `${longest.name} kept all ${longest.nights} nights — the reason to come`
        : `${longest.name} keeps the most time, at ${nightsWord(longest.nights)}`,
    )
  }

  // ---- What was cut, and why ---------------------------------------------
  //
  // TWO DIFFERENT CUTS can happen and they are not interchangeable. The
  // TAILORING cut is what the alteration decided. The COPY cut is what the
  // writer refused — and its one entry that matters is a tailored plan that
  // failed validation, where the trip actually written is the curated original
  // rather than the one the traveller shaped. That is not an error server-side,
  // so `copied.dropped` is the only signal it happened, and it has to WIN:
  // otherwise the receipt confidently explains a cut that was not made, about a
  // stop the trip contains.
  const droppedLines: string[] = (() => {
    if (tailoringCollapsed(copied)) {
      return [
        `The tailoring didn't hold, so this is the trip as it was taken — ${s.day_count} days, unchanged.`,
      ]
    }
    // A PARTIAL WRITE HAS NOTHING TO SAY ABOUT CUTS. Its response carries no
    // stops at all, so the name-diff below would find every destination
    // "missing" and announce that the whole itinerary was dropped — directly
    // above the honest line saying the stops simply did not finish writing.
    // Let the partial warning speak alone.
    if (copied.isPartial || copied.stops.length === 0) return []

    // TWO SOURCES, BOTH REAL. `tailorDropped` is what the ALTERATION decided;
    // `copied.dropped` is what the WRITER refused — a stop whose identity failed
    // the guard, or an offset outside the trip. Showing only the first leaves a
    // genuinely absent stop unaccounted for, which is the silent removal this
    // whole mechanism exists to prevent.
    const line = (d: { title?: string | null; reason?: string | null }) =>
      d.title
        ? d.reason
          ? `${d.title} — ${d.reason.toLowerCase()}`
          : `${d.title} did not fit these days`
        : null

    const merged: string[] = []
    const seen = new Set<string>()
    for (const d of [
      ...tailorDropped,
      // the collapse sentinel is handled above, not repeated here
      ...copied.dropped.filter((d) => d.title !== "tailored plan"),
    ]) {
      const text = line(d)
      if (!text) continue
      const key = normName(text)
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(text)
    }
    if (merged.length) return merged.slice(0, 3)

    // Names arrive here from two provenances: the server's have been through
    // its whitespace collapsing, the snapshot's have not. Comparing them raw
    // printed "Wadi  Rum dropped" above a list containing Wadi Rum.
    const keptNames = new Set(copied.stops.map((st) => normName(st.name)))
    const gone = s.destinations
      .map((d) => d.name)
      .filter((n): n is string => !!n)
      .filter((n) => !keptNames.has(normName(n)))
    if (!gone.length) return []
    return [`${gone.join(", ")} dropped to fit ${copied.stops.length} stops`]
  })()

  return (
    <main className="mx-auto w-full max-w-2xl pb-28">
      {/* ---- Hero ---- */}
      <div className="relative h-[206px] w-full overflow-hidden sm:mt-4 sm:rounded-hero">
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
              "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, transparent 42%, rgba(0,0,0,0.88))",
          }}
        />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <h1 className="font-drift-display text-[31px] font-bold leading-tight text-white">
            {copied.title}
          </h1>
          <p className="mt-1 text-[12.5px] text-white/85">{metaLine}</p>
        </div>
      </div>

      {/* ---- The receipt ---- */}
      {receiptShown && (
        <div className="mx-5 mt-4 rounded-[18px] border border-aurora-border bg-aurora-glass p-4">
          <p className="text-[14px] font-semibold text-aurora-ink">{provenance}</p>
          {keptLines.map((line) => (
            <ReceiptLine key={line} tone="kept" text={line} />
          ))}
          {droppedLines.map((line) => (
            <ReceiptLine key={line} tone="cut" text={line} />
          ))}
          {/* A partial write is a real state — the trips row commits before its
              steps — and the traveller has to be told rather than shown a trip
              that merely looks short. */}
          {copied.isPartial && (
            <ReceiptLine
              tone="warn"
              text="Some stops didn't finish writing. Refresh the trip in a moment."
            />
          )}
          {/* What deliberately did not come. Saying it plainly is the point. */}
          <ReceiptLine tone="cut" text="No stays, flights or costs came across. Those are yours." />
          <button
            onClick={() => setReceiptShown(false)}
            className="mt-3 text-[12px] font-semibold text-aurora-teal"
          >
            Got it
          </button>
        </div>
      )}

      <div className="mt-5 px-5">
        <Link
          href={`/app/trips/${copied.id}`}
          className="flex h-[52px] w-full items-center justify-center rounded-2xl bg-aurora-teal text-[15.5px] font-bold text-aurora-teal-ink"
        >
          Open the trip
        </Link>
      </div>

      {/* ---- Your stops ---- */}
      <section className="mt-7 px-5">
        <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.13em] text-aurora-ink3">
          Your stops · {copied.stops.length}
        </p>
        <ul>
          {copied.stops.map((stop, i) => (
            <li
              key={stop.id}
              className={`flex items-start gap-3 py-3 ${
                i === copied.stops.length - 1 ? "" : "border-b border-aurora-border"
              }`}
            >
              <span className="h-12 w-12 shrink-0 rounded-[13px] bg-aurora-midnight2" />
              <div className="min-w-0 flex-1">
                <p className="font-drift-display text-[16px] font-semibold text-aurora-ink">
                  {stop.name}
                </p>
                <p className="mt-0.5 text-[12.5px] text-aurora-ink3">
                  {[
                    stop.date ? formatDay(stop.date, short) : null,
                    nightsWord(stop.nights),
                    stop.itemCount > 0
                      ? `${stop.itemCount} ${stop.itemCount === 1 ? "place" : "places"} saved`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {/* Never look booked. */}
                <span className="mt-1.5 inline-block rounded-full bg-aurora-warn/15 px-2 py-[3px] text-[10.5px] font-bold text-aurora-warn">
                  NEEDS A STAY
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

function ReceiptLine({ tone, text }: { tone: "kept" | "cut" | "warn"; text: string }) {
  const glyph = tone === "kept" ? "✓" : tone === "warn" ? "!" : "–"
  const color =
    tone === "kept" ? "text-aurora-teal" : tone === "warn" ? "text-aurora-warn" : "text-aurora-ink3"
  return (
    <p className="mt-2.5 flex items-start gap-2.5">
      <span aria-hidden className={`w-3 shrink-0 text-[11px] font-bold leading-5 ${color}`}>
        {glyph}
      </span>
      <span className="min-w-0 flex-1 text-[12.5px] leading-5 text-aurora-ink2">{text}</span>
    </p>
  )
}
