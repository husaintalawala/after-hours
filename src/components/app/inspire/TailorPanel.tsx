"use client"

import { useEffect, useMemo, useState } from "react"
import InspireReceipt from "@/components/app/inspire/InspireReceipt"
import {
  addDays,
  adultsFor,
  attemptKey,
  categoryName,
  childrenFor,
  copyErrorMessage,
  firstOfMonth,
  formatDay,
  localFit,
  mayHaveLanded,
  mintUuid,
  monthKey,
  monthLong,
  monthShort,
  nightsWord,
  parseCopyResponse,
  parseTailorResponse,
  RESERVED_TRIP_IDS,
  type CopiedTrip,
  type InspirePattern,
  type Measurements,
  type ShapeRow,
  type TailorResult,
  type YearMonth,
} from "@/lib/drift/inspire"

// Tailor — where a block pattern becomes your trip.
//
// Not a form and not a chatbot. ONE continuous control, and the itinerary
// re-forms under your thumb as you move it. You watch the Dead Sea night go and
// Amman come down from 2 to 1, so the trade is visible WHILE you make it rather
// than explained afterwards. There is no "Apply" — the trip below the dial
// already IS the answer.
//
// WHAT THE MODEL MAY DO is the trustworthiness of the whole feature. It may
// drop a stop, shorten or lengthen one, move an item, reorder a day, rewrite a
// note, and add an item. It may NOT invent a stop, change any place's identity,
// or emit a date. That is enforced server-side in tailor-trip's sanitiser and
// again in copy-trip's guard — the UI just has to be honest about the result,
// which is what the struck-through rows and the one-sentence reason are for.

const DEBOUNCE_MS = 350

export default function TailorPanel({
  pattern,
  months,
  onCancel,
}: {
  pattern: InspirePattern
  months: YearMonth[]
  onCancel: () => void
}) {
  const s = pattern.snapshot

  // The dial's range. The native length is the centre; five days either way is
  // an alteration, not a different trip.
  const native = Math.max(2, s.day_count)
  const minDays = Math.max(3, native - 5)
  const maxDays = native + 5

  const [days, setDays] = useState(() => Math.min(maxDays, Math.max(minDays, native)))
  // You cannot leave today, so today is the wrong default: lead with the first
  // month you could actually go.
  const [month, setMonth] = useState<YearMonth>(
    () => months[0] ?? { year: new Date().getUTCFullYear(), month: 1 },
  )
  const [pace, setPace] = useState<Measurements["pace"]>("balanced")
  const [who, setWho] = useState<Measurements["who"]>("just_me")
  const [cameFor, setCameFor] = useState<string | null>(null)

  const [result, setResult] = useState<TailorResult | null>(null)
  const [isTailoring, setIsTailoring] = useState(true)

  const [isCopying, setIsCopying] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [copied, setCopied] = useState<CopiedTrip | null>(null)

  // The reserved-id map is deliberately NOT component state.
  //
  // It exists for exactly one path: a copy whose request failed after copy-trip
  // had already committed the trips row. Reusing the id on the retry is what
  // lets the function recognise the replay (23505 on trips.id → return the trip
  // that is already there) instead of writing a second one. But PatternView
  // unmounts this panel the moment the user presses Cancel — which is precisely
  // what someone does after seeing "couldn't reach the server" — so a map living
  // in component state dies at the only moment it is needed, and re-entering the
  // panel mints a fresh id and produces two identical trips. iOS keeps this on
  // the TripCopyService singleton for the same reason.
  const inFlightIds = RESERVED_TRIP_IDS

  const startDay = firstOfMonth(month)

  // Every input that changes the answer. Changing any of them re-tailors.
  const measurementKey = `${days}|${pace}|${who}|${cameFor ?? ""}|${monthKey(month)}`

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    // The previous plan describes a DIFFERENT length. Dropping it the moment
    // the dial moves is what lets the local arithmetic fit render instantly
    // underneath, rather than leaving a convincing stale shape on screen.
    setResult(null)
    setIsTailoring(true)

    const timer = setTimeout(() => {
      requestTailor(
        {
          source_trip_id: pattern.tripId,
          days,
          month: monthKey(month),
          adults: adultsFor(who),
          children: childrenFor(who),
          pace,
          came_for: cameFor ?? undefined,
        },
        controller.signal,
      ).then((r) => {
        if (cancelled) return
        setResult(r)
        setIsTailoring(false)
      })
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
      // Cancel the in-flight request when the dial moves again — its answer is
      // for a length nobody is looking at any more.
      controller.abort()
    }
    // measurementKey is the whole dependency: it is built from exactly the
    // fields the request body reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurementKey, pattern.tripId])

  // ---- What the dial has produced ----------------------------------------
  // Before the server answers — and if it never does — this is the
  // deterministic local fit, so the trip under the dial is never blank.
  const rows: ShapeRow[] = useMemo(() => {
    const plan = result?.plan
    if (plan && plan.destinations.length) {
      const wasByRef = new Map(s.destinations.map((d) => [d.ref, d.nights]))
      const kept: ShapeRow[] = plan.destinations.map((d, i) => ({
        id: d.ref || `p${i}`,
        name: d.name ?? "—",
        nights: d.nights,
        was: wasByRef.get(d.ref) ?? null,
        dropped: false,
      }))
      const keptRefs = new Set(plan.destinations.map((d) => d.ref))
      // Dropped stops stay ON SCREEN, struck through. A tool that silently
      // removes things is one you stop trusting the first time you notice.
      const gone: ShapeRow[] = s.destinations
        .filter((d) => !keptRefs.has(d.ref))
        .map((d, i) => ({
          id: d.ref || `g${i}`,
          name: d.name ?? "—",
          nights: 0,
          was: d.nights,
          dropped: true,
        }))
      return [...kept, ...gone]
    }
    return localFit(s.destinations, days)
  }, [result, s.destinations, days])

  // ---- THE LENGTH THAT WILL ACTUALLY BE WRITTEN --------------------------
  //
  // Which is the PLAN's, not the dial's. The two diverge more often than you
  // would guess: the tailoring call can fail, the model can be unreachable, the
  // reply can be unparseable. In every one of those cases tailor-trip honestly
  // returns the pattern at its ORIGINAL length. If the footer read off the
  // dial, someone would set 6, be shown a convincing six-day shape, click the
  // button and land on a nine-day trip — the feature quietly not working while
  // looking like it worked.
  //
  // A plan with no day_count at all is as untrustworthy as no plan: it is the
  // field copy-trip makes the trip's length.
  const effectiveDays = result?.plan.day_count ?? s.day_count
  const planMatchesDial = result !== null && effectiveDays === days

  const endDay = addDays(startDay, Math.max(0, effectiveDays - 1))
  const dateFmt: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }
  // The return date is a claim about LENGTH, and while a request is in flight
  // there is no plan to make it from — asserting one off the dial is the exact
  // lie the button's own label refuses to tell. Leaving day only, until there
  // is an answer.
  const dateLine = isTailoring
    ? `Leaving ${formatDay(startDay, dateFmt)}`
    : `Leaving ${formatDay(startDay, dateFmt)} · back ${formatDay(endDay, dateFmt)}`

  const placeWord = s.countries[0] ?? "trip"
  const buttonLabel = isCopying
    ? "Making it yours…"
    : isTailoring
      ? `Fitting it to ${days} days…`
      : planMatchesDial
        ? "Make it mine"
        : `Make it mine · ${effectiveDays} days`

  // ---- The copy ----------------------------------------------------------
  async function makeItMine() {
    // Live while tailoring, the button would send the PREVIOUS dial's plan —
    // the shape on screen and the trip written would differ.
    if (isCopying || isTailoring) return
    setIsCopying(true)
    setCopyError(null)

    const key = attemptKey(pattern.tripId, startDay, null, result?.plan ?? null)
    // The trip id is minted HERE, not by the function, so the call is
    // idempotent: copy-trip inserts AT the supplied trip_id and answers a
    // duplicate on that id — this same copy having already landed — with the
    // trip that is already there, as a success. Without it, a fetch that timed
    // out after the row committed would invite a retry that writes a SECOND
    // trip.
    const tripId = inFlightIds.get(key) ?? mintUuid()
    inFlightIds.set(key, tripId)

    try {
      const res = await fetch("/api/drift/copy-trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_trip_id: pattern.tripId,
          trip_id: tripId,
          start_date: startDay,
          // Verbatim, exactly as tailor-trip returned it. copy-trip checks
          // every row against the snapshot it claims to have come from.
          ...(result?.rawPlan ? { plan: result.rawPlan } : {}),
        }),
      })
      const json: unknown = await res.json().catch(() => null)

      if (!res.ok) {
        // 4xx means the function never wrote anything, so the next attempt is a
        // fresh copy and must not reuse this id.
        if (!mayHaveLanded(res.status)) inFlightIds.delete(key)
        setCopyError(copyErrorMessage(res.status))
        return
      }

      // Per the wire contract every 200 carries a trip id — including the
      // partial state (`ok:false, partial:true, trip_id`), which is a 200
      // precisely so the id survives.
      const parsed = parseCopyResponse(json, startDay)
      if (!parsed) {
        inFlightIds.delete(key)
        setCopyError(
          "Drift couldn't read the result of the copy. If the trip isn't in your list, refresh in a moment.",
        )
        return
      }
      // The row exists. A later copy of the same pattern on the same day is a
      // new trip the user asked for, so stop reusing this id.
      inFlightIds.delete(key)
      setCopied(parsed)
    } catch {
      // The network never delivered an answer — the row may exist. The id stays
      // reserved so a retry replays this copy rather than writing a second one.
      setCopyError(copyErrorMessage(null))
    } finally {
      setIsCopying(false)
    }
  }

  if (copied) {
    return (
      <InspireReceipt
        pattern={pattern}
        copied={copied}
        tailorDropped={result?.plan.dropped ?? []}
      />
    )
  }

  const inSeason = pattern.bestMonths.includes(month.month)
  const seasonPlace = s.countries[0] ?? "here"
  const seasonEffect = !pattern.bestMonths.length
    ? null
    : inSeason
      ? `${monthLong(month.month)} is one of ${seasonPlace}'s best months`
      : `${monthLong(month.month)} is outside ${seasonPlace}'s best window — still doable, just know it`

  const theirPace = pattern.authorHandle ? `${pattern.authorHandle}'s pace` : "As taken"
  // Offered only when the trip actually carries more than one kind — asking
  // "what did you come for" about a single-tag trip has one possible answer.
  const cameForOptions = pattern.tags.filter((t) => categoryName(t) !== null)
  const protectedStop =
    [...s.destinations].sort((a, b) => b.nights - a.nights)[0]?.name ?? "The main stop"

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-60 pt-4">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onCancel}
          className="-ml-1 rounded-lg px-1 py-1 text-[15px] text-aurora-ink3 transition-colors hover:text-aurora-ink"
        >
          Cancel
        </button>
        <span className="truncate text-[15px] font-semibold text-aurora-ink">
          {s.countries[0] ?? s.title}
        </span>
        <span className="w-[52px]" aria-hidden />
      </div>

      {/* ---- Headline + the one control ---- */}
      <h1 className="mt-4 font-drift-display text-[34px] font-bold leading-[1.05] text-aurora-ink">
        How long
        <br />
        do you have?
      </h1>
      <p className="mt-2 text-[14.5px] text-aurora-ink3">
        {pattern.authorHandle ?? "They"} took {s.day_count} days. We will fit that shape to yours.
      </p>

      <div className="mt-7">
        <div className="flex items-baseline gap-2">
          <span className="font-drift-display text-[64px] font-bold leading-none text-aurora-ink tabular-nums">
            {days}
          </span>
          <span className="text-[17px] text-aurora-ink3">days</span>
        </div>
        <input
          type="range"
          min={minDays}
          max={maxDays}
          step={1}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          aria-label="How many days do you have"
          className="mt-3.5 h-6 w-full cursor-pointer appearance-none bg-transparent accent-[#37D6C4]"
        />
        <div className="flex justify-between text-[11.5px] text-aurora-ink3">
          <span>{minDays} days</span>
          <span>{maxDays} days</span>
        </div>
      </div>

      {/* ---- The trip, live ---- */}
      <section className="mt-8">
        <div className="flex items-center gap-2">
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-aurora-ink3">
            Your {placeWord}, at {days} days
          </p>
          {isTailoring && (
            <span
              aria-label="Fitting"
              className="h-3 w-3 animate-spin rounded-full border-2 border-aurora-ink3 border-t-transparent"
            />
          )}
        </div>
        <ul className="mt-3.5">
          {rows.map((row, i) => (
            <li key={`${row.id}-${i}`} className="flex items-start gap-3.5 pb-3.5">
              <span
                className={`mt-[7px] h-[9px] w-[9px] shrink-0 rounded-full ${
                  row.dropped ? "bg-white/25" : "bg-aurora-teal"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={`font-drift-display text-[17px] font-semibold ${
                    row.dropped ? "text-aurora-ink3 line-through" : "text-aurora-ink"
                  }`}
                >
                  {row.name}
                </p>
                <p
                  className={`text-[12.5px] text-aurora-ink3 ${row.dropped ? "line-through" : ""}`}
                >
                  {row.dropped ? "dropped" : nightsWord(row.nights)}
                </p>
                {!row.dropped && row.was !== null && row.was !== row.nights && (
                  <p className="mt-0.5 text-[11px] font-bold tracking-wide text-aurora-warn">
                    WAS {row.was}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- The other measurements ---- */}
      <section className="mt-4 border-t border-aurora-border pt-6">
        <h2 className="text-[14px] font-semibold text-aurora-ink">A few things that change it</h2>
        <p className="mt-1 text-[12.5px] text-aurora-ink3">
          Skip any of these and we will use{" "}
          {pattern.authorHandle ? `${pattern.authorHandle}'s` : "the original"} answers.
        </p>

        {/* WHEN — the season decides what is even possible. */}
        <Group label="When you could go">
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {months.map((m) => {
              const active = m.year === month.year && m.month === month.month
              return (
                <button
                  key={monthKey(m)}
                  onClick={() => setMonth(m)}
                  aria-pressed={active}
                  className={`min-w-[74px] shrink-0 rounded-2xl px-3 py-2.5 text-center transition-colors ${
                    active
                      ? "bg-aurora-teal text-aurora-teal-ink"
                      : "border border-aurora-border bg-aurora-glass text-aurora-ink2"
                  }`}
                >
                  <span className="block text-[14px] font-bold">{monthShort(m.month)}</span>
                  <span
                    className={`block text-[10px] ${active ? "opacity-70" : "text-aurora-ink3"}`}
                  >
                    {m.year}
                  </span>
                </button>
              )
            })}
          </div>
          <Effect text={seasonEffect} good={inSeason} />
        </Group>

        {/* HOW YOU MOVE — settle in two bases, or cover ground in five. */}
        <Group label="How you like to move">
          <div className="grid grid-cols-3 gap-2">
            <Tile
              active={pace === "settle"}
              onClick={() => setPace("settle")}
              title="Settle"
              sub="Few bases"
            />
            <Tile
              active={pace === "balanced"}
              onClick={() => setPace("balanced")}
              title="Balanced"
              sub={theirPace}
            />
            <Tile
              active={pace === "cover_ground"}
              onClick={() => setPace("cover_ground")}
              title="Cover ground"
              sub="More stops"
            />
          </div>
        </Group>

        {/* WHO — kids shorten the drives and lengthen the stays. That is a
            different itinerary, not a tag. */}
        <Group label="Who is coming">
          <div className="grid grid-cols-4 gap-2">
            <Tile active={who === "just_me"} onClick={() => setWho("just_me")} title="Just me" />
            <Tile active={who === "two"} onClick={() => setWho("two")} title="Two of us" />
            <Tile active={who === "kids"} onClick={() => setWho("kids")} title="With kids" />
            <Tile active={who === "group"} onClick={() => setWho("group")} title="A group" />
          </div>
          {who === "kids" && (
            <Effect text="Kids shorten the drives and add a night to each base" good={false} />
          )}
        </Group>

        {/* WHAT YOU CAME FOR — decides which stop is protected when days run
            short. It is the tie-breaker, not a mood. */}
        {cameForOptions.length > 1 && (
          <Group label="What you came for">
            <div className="flex flex-wrap gap-2">
              {cameForOptions.map((slug) => {
                const active = cameFor === slug
                return (
                  <button
                    key={slug}
                    onClick={() => setCameFor(active ? null : slug)}
                    aria-pressed={active}
                    className={`rounded-2xl px-3.5 py-3 text-[13.5px] font-semibold transition-colors ${
                      active
                        ? "bg-aurora-teal text-aurora-teal-ink"
                        : "border border-aurora-border bg-aurora-glass text-aurora-ink2"
                    }`}
                  >
                    {categoryName(slug) ?? slug}
                  </button>
                )
              })}
            </div>
            {cameFor && (
              <Effect
                text={`${protectedStop} keeps its nights — that is the ${(
                  categoryName(cameFor) ?? cameFor
                ).toLowerCase()} part`}
                good
              />
            )}
          </Group>
        )}
      </section>

      {/* ---- Footer ---- */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-aurora-border bg-aurora-midnight/95 px-5 pb-5 pt-3.5 backdrop-blur lg:bottom-0 lg:left-[76px]">
        <div className="mx-auto w-full max-w-2xl">
          {/* The alteration explains itself in ONE SENTENCE, in the language a
              person would actually use. Not "optimising itinerary" — a reason. */}
          {result?.reason && (
            <p className="mb-3 text-[13px] leading-relaxed text-aurora-ink2">{result.reason}</p>
          )}
          {/* When the alteration did not apply, say so BEFORE the button rather
              than let the button promise a length nobody will get. */}
          {!isTailoring && !planMatchesDial && (
            <p className="mb-2.5 text-[12.5px] text-aurora-warn">
              Tailoring didn&apos;t apply just now — this would be written at its original{" "}
              {effectiveDays} days.
            </p>
          )}
          {copyError && <p className="mb-2.5 text-[12.5px] text-aurora-warn">{copyError}</p>}
          <button
            onClick={makeItMine}
            disabled={isCopying || isTailoring}
            className={`flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-bold text-aurora-teal-ink transition-transform active:scale-[0.99] ${
              isCopying || isTailoring ? "bg-aurora-teal/45" : "bg-aurora-teal"
            }`}
          >
            {isCopying && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-aurora-teal-ink border-t-transparent" />
            )}
            {/* The button states the length it will actually write. */}
            {buttonLabel}
          </button>
          <p className="mt-2 text-center text-[12px] text-aurora-ink3">{dateLine}</p>
        </div>
      </div>
    </main>
  )
}

// ---------------------------------------------------------------------------

/** ONE attempt at the alteration, plus one retry.
 *
 *  The house rule is that an AI surface never shows the user a failure: it
 *  retries, or it uses what it already has. Here "what it already has" is the
 *  untailored pattern, so a failure returns null and the panel falls back to
 *  the local fit rather than rendering an outage. tailor-trip already answers
 *  its OWN failures with the untailored pattern and `degraded: true`, so what
 *  reaches this retry is a network drop or a gateway blip. */
async function requestTailor(
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<TailorResult | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch("/api/drift/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      })
      if (res.ok) {
        const parsed = parseTailorResponse(await res.json())
        if (parsed) return parsed
      } else if (SETTLED.has(res.status)) {
        // A settled answer — retrying sends the identical body.
        return null
      }
    } catch {
      if (signal.aborted) return null
    }
    if (attempt === 1) {
      await new Promise((r) => setTimeout(r, 400))
      if (signal.aborted) return null
    }
  }
  return null
}

/** Statuses a second identical request cannot fix. */
const SETTLED = new Set([400, 401, 403, 404, 410, 422, 501])

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <p className="mb-2.5 text-[12px] font-bold uppercase tracking-[0.13em] text-aurora-ink3">
        {label}
      </p>
      {children}
    </div>
  )
}

function Tile({
  active,
  onClick,
  title,
  sub,
}: {
  active: boolean
  onClick: () => void
  title: string
  sub?: string
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-2xl px-2 py-3 text-center transition-colors ${
        active
          ? "bg-aurora-teal text-aurora-teal-ink"
          : "border border-aurora-border bg-aurora-glass text-aurora-ink2"
      }`}
    >
      <span className="block truncate text-[13.5px] font-semibold">{title}</span>
      {sub && (
        <span className={`block truncate text-[10.5px] ${active ? "opacity-70" : "text-aurora-ink3"}`}>
          {sub}
        </span>
      )}
    </button>
  )
}

/** Every answer says what it DID, immediately, in one line — a control with no
 *  visible consequence is a control nobody trusts. */
function Effect({ text, good }: { text: string | null; good: boolean }) {
  if (!text) return null
  return (
    <p
      className={`mt-2.5 text-[12px] font-semibold ${good ? "text-aurora-teal" : "text-aurora-ink3"}`}
    >
      {text}
    </p>
  )
}
