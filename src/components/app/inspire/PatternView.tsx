"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import OptimizedImg from "@/components/app/OptimizedImg"
import CoverCredit from "@/components/app/CoverCredit"
import BackLink from "@/components/app/BackLink"
import TailorPanel from "@/components/app/inspire/TailorPanel"
import PlaceCard from "@/components/app/inspire/PlaceCard"
import { PatternPhotoCredits } from "@/components/app/inspire/PhotoCredits"
import { buildPoints } from "@/components/app/inspire/GuideMap"
import {
  bestWindowLabel,
  guideUrl,
  nightsWord,
  photoAt,
  type InspireDestination,
  type InspireItem,
  type InspirePattern,
  type YearMonth,
} from "@/lib/drift/inspire"
import type { TripMapPoint } from "@/components/app/trip/TripMap"

// The block pattern, as a GUIDE.
//
// The shape — an order and a set of nights — is still the knowledge you cannot
// search for, and it is still the thing being offered. But a spine of place
// names with a nights count under each is a diagram of a trip, not a reason to
// take one. 519 of the 520 items in this corpus carry a NOTE somebody wrote
// ("Twenty minutes up through the old walls. The Pakleni islands laid out
// below."), and 296 carry a photo. That is a guide. So the page reads as one:
// every place gets its picture and its sentence, in the order they were
// travelled, grouped by the day they happened on.
//
// Nothing here is booked and nothing pretends to be. The line under the button
// says so plainly, because a copy that quietly carried someone else's hotels or
// prices would be the worst bug this feature could have.
//
// DAYS ARE OFFSETS. `day_offset` is days from the trip's own day 0 — the
// snapshot has no dates in it at all, and nothing on this screen may compute
// one. "Day 4" is a position in a sequence, not the 4th of anything.

// Mapbox + its CSS is ~700kB. A static import puts every byte of it in the
// route's first load whether or not the map is ever opened, so it stays lazy
// and client-only — the repo rule, and the reason the trip screen imports it
// the same way.
const TripMap = dynamic(() => import("@/components/app/trip/TripMap"), { ssr: false })

/** localStorage key for saved patterns. There is no saved-inspire table, and
 *  inventing one to make a bookmark button light up would be a schema for a
 *  feature nobody has asked for yet. This keeps the promise it can keep: this
 *  browser remembers what you starred. */
const SAVED_KEY = "drift.inspire.saved"

function readSaved(): string[] {
  try {
    const raw = window.localStorage.getItem(SAVED_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []
  } catch {
    return []
  }
}

/** One stop plus the days inside it. */
interface GuideDay {
  /** 1-based POSITION in the trip. Never a date. */
  day: number
  items: InspireItem[]
}
interface GuideStop {
  dest: InspireDestination
  n: number
  /** "Days 4–6", or "Day 4" when the stop is one day long. */
  dayRange: string
  days: GuideDay[]
  placeCount: number
}

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
  const [mapOpen, setMapOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [shareNote, setShareNote] = useState<string | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const s = pattern.snapshot

  // Read on the client only. Rendering a saved state on the server would be a
  // hydration mismatch on a control whose whole job is to look pressed.
  useEffect(() => {
    setSaved(readSaved().includes(pattern.tripId))
  }, [pattern.tripId])

  const stops: GuideStop[] = useMemo(() => {
    const dests = [...s.destinations].sort((a, b) => a.day_offset - b.day_offset)
    return dests.map((dest, i) => {
      // The stop ENDS where the next one begins — not at day_offset + nights,
      // which double-counts the travel day and leaves the last day of a trip
      // outside every stop.
      const startDay = dest.day_offset + 1
      const endDay = Math.max(
        startDay,
        i + 1 < dests.length ? dests[i + 1].day_offset : Math.max(s.day_count, startDay),
      )
      const mine = s.items
        .filter((it) => it.destination_ref === dest.ref)
        .sort((a, b) => a.day_offset - b.day_offset)
      const byDay = new Map<number, InspireItem[]>()
      for (const it of mine) {
        const day = Math.max(startDay, it.day_offset + 1)
        const bucket = byDay.get(day)
        if (bucket) bucket.push(it)
        else byDay.set(day, [it])
      }
      return {
        dest,
        n: i + 1,
        dayRange: endDay > startDay ? `Days ${startDay}–${endDay}` : `Day ${startDay}`,
        days: [...byDay.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([day, items]) => ({ day, items })),
        placeCount: mine.filter((it) => it.step_type !== "note").length,
      }
    })
  }, [s])

  // Stops AND their places, from the ONE shared builder — the same function
  // the public /i/<slug> page calls, so the two web surfaces cannot disagree
  // about what a guide contains.
  const mapPoints: TripMapPoint[] = useMemo(() => buildPoints(s), [s])
  const pinnedStops = mapPoints.filter((p) => p.rank === "stop").length
  const pinnedPlaces = mapPoints.length - pinnedStops

  if (tailoring) {
    return <TailorPanel pattern={pattern} months={months} onCancel={() => setTailoring(false)} />
  }

  const placeCount = s.items.filter((it) => it.step_type !== "note").length
  const stayCount = s.items.filter((it) => it.step_type === "stay").length
  // NOT `window` — this component reads `window.location` and
  // `window.localStorage`, and a const of that name in the same scope shadows
  // the global for every closure in the function.
  const bestWindow = bestWindowLabel(pattern.bestMonths)
  const shareUrl = pattern.slug ? guideUrl(pattern.slug) : null
  const longest = Math.max(0, ...s.destinations.map((d) => d.nights))
  const soleLongest =
    s.destinations.length > 1 && s.destinations.filter((d) => d.nights === longest).length === 1
  const longestName = soleLongest
    ? (s.destinations.find((d) => d.nights === longest)?.name ?? null)
    : null

  const countryText = s.countries.slice(0, 2).join(" & ")
  const names = stops.map((st) => st.dest.name ?? st.dest.city).filter((n): n is string => !!n)
  // No blurb column is populated on any of the 38 rows, so the opening line is
  // BUILT from the pattern rather than left blank — and it says the one thing
  // the shape is for: the order, and where the time actually goes.
  const opener =
    pattern.blurb ??
    (names.length > 1
      ? `${s.day_count} days through ${countryText || names[0]}, in the order they were travelled: ${
          names.length > 2
            ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
            : names.join(" and ")
        }.${longestName ? ` The longest stretch is ${longestName} — ${nightsWord(longest)}.` : ""}`
      : `${s.day_count} days in ${names[0] ?? (countryText || s.title)}${
          longest > 0 ? ` — ${nightsWord(longest)} in one place.` : "."
        }`)

  function note(text: string) {
    setShareNote(text)
    window.setTimeout(() => setShareNote(null), 2200)
  }

  // THE PUBLIC GUIDE, never this screen's own URL.
  //
  // `window.location.href` is /app/inspire/<uuid>, which lives inside
  // (protected): everyone it was ever sent to met a sign-in wall where a trip
  // was promised. The shareable artefact is /i/<slug> — the same trip, whole,
  // readable with no account. A pattern with no slug has nothing to share, and
  // the button is not drawn at all rather than copying a link that cannot work.
  async function onShare() {
    if (!shareUrl) return
    const url = shareUrl
    if (navigator.share) {
      try {
        await navigator.share({ title: s.title, url })
      } catch (e) {
        // A DISMISSED share sheet is a choice, not a failure — copying the
        // link behind their back would be the app doing something they just
        // declined. Only a share that could not open falls through to copy.
        if ((e as { name?: string })?.name === "AbortError") return
        void copyLink(url)
      }
      return
    }
    void copyLink(url)
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      note("Link copied")
    } catch {
      note("Couldn't copy the link")
    }
  }

  function onToggleSave() {
    const next = !saved
    setSaved(next)
    try {
      const list = readSaved().filter((id) => id !== pattern.tripId)
      if (next) list.push(pattern.tripId)
      window.localStorage.setItem(SAVED_KEY, JSON.stringify(list))
    } catch {
      // A browser refusing storage (private mode, quota) must not break the
      // page — the star simply does not persist.
    }
  }

  function onToggleMap() {
    const next = !mapOpen
    setMapOpen(next)
    if (next) {
      // Opening a panel you cannot see is the same as not opening it.
      requestAnimationFrame(() =>
        mapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      )
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl pb-44">
      {/* ---- Hero ---- */}
      <div className="relative h-[368px] w-full overflow-hidden sm:mt-4 sm:rounded-hero">
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
        {/* The credit rides with the photo. Both licences bind attribution to
            the display, so it cannot live on some other screen. */}
        {pattern.heroAttribution && (
          <CoverCredit text={pattern.heroAttribution} href={pattern.heroLink} />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 38%, rgba(0,0,0,0.92))",
          }}
        />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
          {/* The LOGICAL parent — the shelf this pattern came off — so back
              resolves on a cold deep link, not just on history. */}
          <BackLink href="/app/inspire" label="Inspire" />
          <div className="flex items-center gap-2">
            {shareUrl && (
              <RoundButton label="Share this trip" onClick={onShare}>
                <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 16V4M12 4 8 8M12 4l4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
                </svg>
              </RoundButton>
            )}
            <RoundButton
              label={saved ? "Saved — tap to remove" : "Save this trip"}
              pressed={saved}
              onClick={onToggleSave}
            >
              <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1z" />
              </svg>
            </RoundButton>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4">
          <h1 className="font-drift-display text-[31px] font-bold leading-tight text-white">
            {s.title}
          </h1>
          {/* Attribution is not decoration. A pattern made from a real person's
              trip carries their name, and that is also what makes it credible. */}
          {pattern.authorHandle && (
            <div className="mt-2.5 flex items-center gap-2">
              {pattern.authorAvatarUrl ? (
                // Through OptimizedImg like every other image on this screen —
                // it is the one place that decides what may go through Vercel's
                // optimizer and what must stay a bare <img>, and a raw tag here
                // opts one image out of that decision for no reason.
                <span className="relative block h-[19px] w-[19px] shrink-0 overflow-hidden rounded-full">
                  <OptimizedImg
                    src={pattern.authorAvatarUrl}
                    alt=""
                    fill
                    sizes="19px"
                    className="h-full w-full object-cover"
                  />
                </span>
              ) : (
                <span className="h-[19px] w-[19px] rounded-full bg-aurora-indigo" />
              )}
              <span className="text-[12px] text-white/75">
                Shaped from {pattern.authorHandle}&apos;s trip
              </span>
            </div>
          )}
        </div>
        {shareNote && (
          <span className="absolute right-4 top-[68px] rounded-full bg-black/70 px-3 py-1.5 text-[12px] font-semibold text-white backdrop-blur-sm">
            {shareNote}
          </span>
        )}
      </div>

      {/* ---- What it is, in numbers you can count ---- */}
      <div className="mt-4 flex flex-wrap gap-1.5 px-4">
        <Chip>{s.day_count} days</Chip>
        <Chip>{stops.length === 1 ? "1 stop" : `${stops.length} stops`}</Chip>
        {placeCount > 0 && (
          <Chip>{placeCount === 1 ? "1 place" : `${placeCount} places`}</Chip>
        )}
        {stayCount > 0 && <Chip>{stayCount === 1 ? "1 stay" : `${stayCount} stays`}</Chip>}
        {s.countries.slice(0, 2).map((c) => (
          <Chip key={c}>{c}</Chip>
        ))}
        {bestWindow && <Chip accent>{bestWindow}</Chip>}
      </div>

      <p className="mt-4 px-4 text-[15px] leading-relaxed text-aurora-ink2">{opener}</p>

      {/* ---- The route, when you ask for it ---- */}
      <div ref={mapRef} className="scroll-mt-4">
        {mapOpen && mapPoints.length > 0 && (
          <section className="mt-6 px-4">
            <Kicker>The route</Kicker>
            <div className="mt-2.5">
              <TripMap
                points={mapPoints}
                className="h-[320px] w-full overflow-hidden rounded-card border border-aurora-border"
              />
            </div>
            {/* Counted BY RANK. Comparing the mixed total against the stop
                count read "31 of 3 stops carry coordinates" the moment places
                joined the map. */}
            <p className="mt-2 text-[12px] text-aurora-ink3">
              {[
                pinnedStops === stops.length
                  ? `All ${stops.length} stops, in order.`
                  : `${pinnedStops} of ${stops.length} stops carry coordinates.`,
                pinnedPlaces > 0
                  ? `${pinnedPlaces} place${pinnedPlaces === 1 ? "" : "s"} pinned.`
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
            </p>
          </section>
        )}
        {mapOpen && mapPoints.length === 0 && (
          <p className="mt-6 px-4 text-[13px] text-aurora-ink3">
            This pattern carries no coordinates, so there is no map to draw.
          </p>
        )}
      </div>

      {/* ---- The guide ---- */}
      {stops.map((st) => (
        <section key={`${st.dest.ref}-${st.n}`} className="mt-8 px-4">
          <div className="flex items-start gap-3">
            <span className="mt-[3px] flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-aurora-teal text-[13px] font-extrabold text-aurora-teal-ink">
              {st.n}
            </span>
            {/* min-w-0 + flex-1: without it this column's ideal width is its
                longest unwrapped line, and the row sets the page width. */}
            <div className="min-w-0 flex-1">
              <h2 className="font-drift-display text-[22px] font-bold leading-tight text-aurora-ink">
                {st.dest.name ?? st.dest.city ?? "—"}
              </h2>
              <p className="mt-0.5 text-[12.5px] text-aurora-ink3">
                {[
                  st.dayRange,
                  // A pass-through stop carries no nights, and "0 nights" is a
                  // number where a fact should be. Print nothing, exactly as the
                  // public guide does.
                  st.dest.nights > 0 ? nightsWord(st.dest.nights) : null,
                  st.placeCount > 0
                    ? `${st.placeCount} place${st.placeCount === 1 ? "" : "s"}`
                    : null,
                  st.dest.country && st.dest.country !== st.dest.name ? st.dest.country : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-5">
            {st.days.map((d) => (
              <div key={d.day}>
                {/* An OFFSET, drawn as a position. Nothing here knows a date. */}
                {st.days.length > 1 && (
                  <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-aurora-ink3">
                    Day {d.day}
                  </p>
                )}
                <ul className="space-y-3">
                  {d.items.map((it, i) => (
                    <PlaceCard
                      key={`${it.source_step_id ?? it.title}-${i}`}
                      item={it}
                      authorHandle={pattern.authorHandle}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Per-photo credit, not a service name. Every place photograph is now a
          Wikimedia Commons file, and Commons is not CC0 — CC BY-SA needs the
          AUTHOR and the LICENCE. A line saying only "Wikimedia Commons" now
          under-credits every one of them. */}
      <PatternPhotoCredits pattern={pattern} className="mt-10 px-4" />

      {/* ---- CTA ---- */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-aurora-border bg-aurora-midnight/95 px-4 pb-5 pt-3 backdrop-blur lg:bottom-0 lg:left-[76px]">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2.5">
          <button
            onClick={onToggleMap}
            aria-pressed={mapOpen}
            className={`flex h-[52px] shrink-0 items-center gap-2 rounded-2xl border px-4 text-[14px] font-bold transition-colors ${
              mapOpen
                ? "border-aurora-teal bg-drift-coral-50 text-aurora-teal"
                : "border-aurora-border bg-aurora-glass text-aurora-ink"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3zM9 3v15M15 6v15" />
            </svg>
            {mapOpen ? "Hide map" : "Map"}
          </button>
          {/* The verb is TAILOR, not copy. What comes next is an alteration, and
              the button must not promise a duplicate. */}
          <button
            onClick={() => setTailoring(true)}
            className="h-[52px] min-w-0 flex-1 rounded-2xl bg-aurora-teal text-[15.5px] font-bold text-aurora-teal-ink transition-transform active:scale-[0.99]"
          >
            Tailor this to my days
          </button>
        </div>
        <p className="mx-auto mt-2 w-full max-w-2xl text-center text-[11.5px] text-aurora-ink3">
          Stops, nights and places. No bookings, no prices.
        </p>
      </div>
    </main>
  )
}

function RoundButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string
  pressed?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className={`flex h-11 w-11 items-center justify-center rounded-[15px] bg-black/45 outline-none ring-1 ring-white/15 backdrop-blur-sm transition-all hover:bg-black/60 active:scale-[0.93] focus-visible:ring-2 focus-visible:ring-aurora-teal/60 ${
        pressed ? "text-aurora-teal" : "text-white"
      }`}
    >
      {children}
    </button>
  )
}

function Chip({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${
        accent
          ? "bg-drift-coral-50 text-aurora-teal"
          : "border border-aurora-border bg-aurora-glass text-aurora-ink2"
      }`}
    >
      {children}
    </span>
  )
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-aurora-ink3">{children}</p>
  )
}
