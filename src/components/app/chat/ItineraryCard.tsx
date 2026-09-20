"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { placePhotoUrl, resolvePlace, type PlaceCandidate } from "@/lib/drift/chat"
import type { ChatItinerary, ItineraryPlace } from "@/lib/drift/generalChat"
import { createTripFromItinerary, type ResolvedPlace } from "@/lib/drift/createTripFromItinerary"
import { AnalyticsEvent, capture } from "@/lib/analytics"
import { activityScope } from "@/lib/activity"
import { shortDate } from "@/lib/drift/itineraryPlacement"
import { MUST_SEE_PREFILL, TUNES, WALK_THROUGH, dayHeading, swapPrompt, type PlanningMode } from "@/lib/drift/chatPlanning"
import PlaceSheet from "@/components/app/discover/PlaceSheet"
import type { DiscoverResult } from "@/lib/drift/discover"

/** The row identity `isAdded` is asked about — unique within one plan. */
export function itineraryRowKey(dayIndex: number, name: string): string {
  return `${dayIndex}:${name}`
}

/**
 * What the LATEST plan offers beyond Add: tune it, swap a day, add a day, or —
 * in a quick chat — be walked through it instead. The chat owns every action;
 * the card only reports the tap. An older plan gets none of these: it is a
 * record, not a second control panel.
 */
export interface PlanTools {
  mode: PlanningMode
  /** Sends a re-draft prompt as the next message. */
  onTune: (prompt: string) => void
  /** Quick → guided: ask the plan's questions after all. */
  onWalkThrough: () => void
  /** Puts MUST_SEE_PREFILL in the composer for the person to finish. */
  onAddMustSee: () => void
  /** Adds one day's places to the trip, given whatever photos/coords resolved.
   *  Absent outside a trip chat, where the plan's own button starts a trip. */
  onAddDay?: (dayIndex: number, resolved: Record<string, PlaceCandidate>) => Promise<void>
}

/** A row's Add control, in the order a tap resolves: taking back outranks an
 *  add in flight, which outranks having landed. */
type AddPhase = "add" | "adding" | "added" | "removing"

/**
 * A plan the assistant laid out, drawn as days rather than printed as JSON.
 *
 * ONE LOOK FOR EVERY CHAT. The general chat's machine block and ask-drift-chat's
 * `itinerary` field both land here: days as sections, places as rows with their
 * own photograph, a Map link and an Add button. Where Add writes is the
 * caller's: it reports through the chat's banner (with Undo) and tells this
 * card which rows are added, so an Undo from the banner flips a row back.
 *
 * NOTHING ASKS FIRST. A trip chat passes `addAllTo`/`onAddAll`, which replace
 * "Create this trip" with one "Add all to <trip>" — a trip chat must never mint
 * a second trip. A general chat keeps "Create this trip".
 */
export default function ItineraryCard({
  itin,
  onAdd,
  onUndo,
  canUndo,
  isAdded,
  onAddAll,
  addAllTo,
  onOpenTrip,
  planTools,
  resolvePhotos = true,
}: {
  itin: ChatItinerary
  /** Per-place Add. Absent = no Add buttons. */
  onAdd?: (place: ItineraryPlace, dayIndex: number, candidate: PlaceCandidate | null) => Promise<void>
  /** Take an added place back off the trip. Absent leaves "Added" inert: there
   *  is nothing to undo it with. */
  onUndo?: (place: ItineraryPlace, dayIndex: number) => Promise<void>
  /** Rows this Undo can actually reach. Defaults to all of them; the general
   *  chat uses it for a place that STARTED a trip rather than joining one,
   *  which is not a step to remove. */
  canUndo?: (rowKey: string) => boolean
  /** Whether the row `itineraryRowKey(day, name)` is already added. */
  isAdded?: (rowKey: string) => boolean
  /** Add every place not yet added, given whatever photos/coords resolved. */
  onAddAll?: (resolved: Record<string, PlaceCandidate>) => Promise<void>
  /** Trip name — shows "Add all to <name>" in place of "Create this trip". */
  addAllTo?: string
  /** Open the trip this plan adds to — where the button goes once every place
   *  is on it and there is nothing left to add. */
  onOpenTrip?: () => void
  /** Tune / swap / add-day / walk-through. Only the latest plan gets them. */
  planTools?: PlanTools
  /** Look up photos/pins on mount. Off for older plans reloaded from history,
   *  so reopening a long thread does not re-bill a lookup per place it ever
   *  suggested — only the latest two plans resolve. Read once, at mount. */
  resolvePhotos?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolved, setResolved] = useState<Record<string, PlaceCandidate>>({})
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({})
  const [rowUndoing, setRowUndoing] = useState<Record<string, boolean>>({})
  const [allBusy, setAllBusy] = useState(false)
  const [dayBusy, setDayBusy] = useState<number | null>(null)
  /** The row whose place details are open, by day and name so the sheet picks
   *  up the photo and pin the moment the lookup lands under it. */
  const [openRow, setOpenRow] = useState<{ dayIndex: number; name: string } | null>(null)

  const places = itin.days.flatMap((d) => d.places)
  const hydratedRef = useRef(false)

  /**
   * Photo + coordinates per place, AFTER paint and never blocking it.
   *
   * resolve-place is a live Google lookup behind a shared cache and answers in
   * anywhere from 500ms to several seconds. Awaiting it before drawing is the
   * mistake this codebase has already made once — an SSR render that waited on
   * one lookup per item is what made Discover feel broken — so the plan renders
   * immediately as text and the pictures arrive into it.
   *
   * Capped, because an itinerary can carry fifteen places and each one is a
   * billable call; the first twelve cover every plan the model actually
   * produces under its own 3–5 day, 3–4 place instruction.
   */
  useEffect(() => {
    if (hydratedRef.current || !resolvePhotos) return
    hydratedRef.current = true
    // NO `alive` FLAG, deliberately, and this cost an hour to see. The ref
    // above already guarantees one run — but React's dev double-mount runs
    // mount → cleanup → mount, so a cleanup that set `alive = false` discarded
    // every result of the first (and only) run, while the second was turned
    // away by the ref. Eleven lookups returned 200 and not one reached the
    // screen. A setState on an unmounted component is a harmless no-op in
    // React 18; a dropped result is not.
    void Promise.all(
      itin.days
        .flatMap((d) => d.places.map((p) => ({ p, where: d.destinationRef || itin.destination })))
        .slice(0, 12)
        .map(async ({ p, where }) => {
          const cand = await resolvePlace(p.query || p.name, where, itin.country ?? undefined)
          if (!cand) return
          setResolved((r) => (r[p.name] ? r : { ...r, [p.name]: cand }))
        })
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Where a row's Add button stands. Taking back outranks an add in flight,
   *  which outranks having landed — a row is never offered an action it is
   *  already in the middle of. */
  function phaseOf(dayIndex: number, name: string): AddPhase {
    const key = itineraryRowKey(dayIndex, name)
    if (rowUndoing[key]) return "removing"
    if (rowBusy[key]) return "adding"
    return isAdded?.(key) ? "added" : "add"
  }

  async function addOne(dayIndex: number, p: ItineraryPlace) {
    const key = itineraryRowKey(dayIndex, p.name)
    if (!onAdd || rowBusy[key] || isAdded?.(key)) return
    setRowBusy((r) => ({ ...r, [key]: true }))
    try {
      await onAdd(p, dayIndex, resolved[p.name] ?? null)
    } finally {
      setRowBusy((r) => ({ ...r, [key]: false }))
    }
  }

  /**
   * TAKE IT BACK FROM THE CARD. The banner is gone in six seconds; the card is
   * where anyone looks for it afterwards, so "Added" is a live control down the
   * same path the banner's Undo takes — one place to remove a step means the
   * trip, the banner and the card cannot disagree.
   */
  async function undoOne(dayIndex: number, p: ItineraryPlace) {
    const key = itineraryRowKey(dayIndex, p.name)
    if (!onUndo || !(canUndo?.(key) ?? true) || rowUndoing[key] || rowBusy[key] || !isAdded?.(key)) return
    setRowUndoing((r) => ({ ...r, [key]: true }))
    try {
      await onUndo(p, dayIndex)
    } finally {
      setRowUndoing((r) => ({ ...r, [key]: false }))
    }
  }

  /** One tap on a row's pill: add it, or take it back. */
  function toggleOne(dayIndex: number, p: ItineraryPlace) {
    const phase = phaseOf(dayIndex, p.name)
    if (phase === "add") return void addOne(dayIndex, p)
    if (phase === "added") return void undoOne(dayIndex, p)
  }

  async function addAll() {
    if (!onAddAll || allBusy) return
    setAllBusy(true)
    try {
      await onAddAll(resolved)
    } finally {
      setAllBusy(false)
    }
  }

  /** "Add day": this day's places only, as one run with one Undo. */
  async function addDay(dayIndex: number) {
    if (!planTools?.onAddDay || dayBusy !== null) return
    setDayBusy(dayIndex)
    try {
      await planTools.onAddDay(dayIndex, resolved)
    } finally {
      setDayBusy(null)
    }
  }

  const rows = itin.days.flatMap((d, i) => d.places.map((p) => ({ p, i })))
  const addedCount = isAdded ? rows.filter(({ p, i }) => isAdded(itineraryRowKey(i, p.name))).length : 0
  const allAdded = !!isAdded && rows.length > 0 && addedCount === rows.length

  // The open row's place, rebuilt every render rather than captured on the tap,
  // so the sheet picks up the photo, the pin and the Added state under it.
  const openPlace = openRow ? itin.days[openRow.dayIndex]?.places.find((p) => p.name === openRow.name) : null
  const open = openRow && openPlace
    ? {
        dayIndex: openRow.dayIndex,
        place: openPlace,
        poi: planPoi(openPlace, resolved[openPlace.name]),
        phase: phaseOf(openRow.dayIndex, openPlace.name),
      }
    : null

  async function create() {
    if (busy) return
    // Turning a chat plan into a trip was invisible in both systems. Same
    // started/succeeded-or-failed pair as every other creation path, sharing an
    // action_id so the two ends can be joined.
    const activity = activityScope(), actionId = crypto.randomUUID()
    activity("trip_creation_started","trips","started",{entrypoint:"chat"},actionId)
    setBusy(true)
    setError(null)
    // Whatever has resolved BY NOW rides along — the pins and place ids are a
    // bonus on the written trip, never a reason to make the reader wait for
    // twelve lookups before the button works.
    const coords: Record<string, ResolvedPlace> = {}
    for (const [name, c] of Object.entries(resolved)) {
      coords[name] = { lat: c.latitude ?? null, lng: c.longitude ?? null, placeId: c.id || null }
    }
    const res = await createTripFromItinerary(itin, coords)
    if ("error" in res) {
      activity("create_trip","trips","failed",{entrypoint:"chat",error_code:res.code},actionId)
      setError(res.error)
      setBusy(false)
      return
    }
    capture(AnalyticsEvent.CreateTrip, { source: "chat" })
    activity("create_trip","trips","succeeded",{entrypoint:"chat"},actionId)
    // Straight into the trip that was just made — the plan is now a place, and
    // leaving the reader in the chat to go find it is asking them to take the
    // step the button was supposed to take.
    router.push(`/app/trips/${res.tripId}`)
  }

  return (
    <section className="mt-3 overflow-hidden rounded-[18px] border border-aurora-border bg-aurora-glass">
      <header className="border-b border-aurora-border px-4 py-3.5">
        <h3 className="font-drift-display text-[16px] font-bold leading-tight tracking-[-0.01em] text-aurora-ink">
          {itin.title}
        </h3>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-aurora-ink3">
          {itin.destination ? `${itin.destination} · ` : ""}
          {itin.days.length} {itin.days.length === 1 ? "day" : "days"} &middot; {places.length}{" "}
          {places.length === 1 ? "place" : "places"}
        </p>
      </header>

      <ol className="divide-y divide-aurora-border">
        {itin.days.map((day, i) => {
          const heading = dayHeading(day.title ?? "", i + 1)
          const dayAdded = !!isAdded && day.places.length > 0 && day.places.every((p) => isAdded(itineraryRowKey(i, p.name)))
          return (
            <li key={`${day.title}-${i}`} className="px-4 py-3.5">
              <div className="flex items-center gap-2">
                {/* "Day 2 · Historic Taipei" as a title would print the day
                    twice — the chip on the left already says it. */}
                <p className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-aurora-teal">
                  Day {i + 1}
                  {day.date ? ` · ${shortDate(day.date)}` : ""}
                  {heading ? ` · ${heading}` : ""}
                </p>
                {planTools && (
                  <span className="flex shrink-0 items-center gap-1.5">
                    {planTools.onAddDay && (
                      <button
                        type="button"
                        onClick={() => void addDay(i)}
                        disabled={dayAdded || dayBusy !== null || allBusy}
                        aria-label={dayAdded ? `Day ${i + 1} added` : `Add day ${i + 1} to the trip`}
                        className="rounded-full border border-drift-coral/60 px-2.5 py-1 text-[11px] font-semibold text-drift-coral disabled:opacity-50"
                      >
                        {dayAdded ? "✓ Added" : dayBusy === i ? "Adding…" : "+ Add day"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => planTools.onTune(swapPrompt(i + 1, heading))}
                      aria-label={`Swap the stops on day ${i + 1}`}
                      className="rounded-full border border-drift-coral/60 px-2.5 py-1 text-[11px] font-semibold text-drift-coral"
                    >
                      Swap
                    </button>
                  </span>
                )}
              </div>
              <ul className="mt-2.5 space-y-2.5">
                {day.places.map((p) => {
                  const cand = resolved[p.name]
                  const photo = cand ? placePhotoUrl(cand) : null
                  const phase = phaseOf(i, p.name)
                  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    p.query || [p.name, day.destinationRef || itin.destination].filter(Boolean).join(" ")
                  )}`
                  return (
                    <li key={p.name}>
                      {/* The photo, the name and the blurb open the place —
                          same details screen Discover uses, with this plan's
                          own Add inside it. */}
                      <button
                        type="button"
                        onClick={() => setOpenRow({ dayIndex: i, name: p.name })}
                        aria-label={`About ${p.name}`}
                        className="flex w-full items-start gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-aurora-teal/40"
                      >
                        {/* The thumbnail is its own element whether or not a photo
                            landed, so a row does not reflow when one arrives. */}
                        <span className="h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-aurora-border bg-aurora-glass2">
                          {photo && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={photo}
                              alt=""
                              aria-hidden
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] font-semibold leading-snug text-aurora-ink">
                            {p.time ? <span className="mr-1.5 font-mono text-[11px] text-aurora-ink3">{p.time}</span> : null}
                            {p.name}
                          </span>
                          {p.why && (
                            <span className="mt-0.5 block text-[12px] leading-snug text-aurora-ink3">
                              {p.why}
                            </span>
                          )}
                          {typeof cand?.rating === "number" && (
                            <span className="mt-1 block font-mono text-[10px] text-aurora-teal">
                              ★ {cand.rating.toFixed(1)}
                            </span>
                          )}
                        </span>
                      </button>
                      <div className="mt-2 flex flex-wrap items-center gap-2 pl-14">
                        {onAdd && (
                          <AddPill
                            phase={phase}
                            place={p.name}
                            canUndo={!!onUndo && (canUndo?.(itineraryRowKey(i, p.name)) ?? true)}
                            disabled={allBusy || dayBusy !== null}
                            onClick={() => toggleOne(i, p)}
                          />
                        )}
                        <a
                          href={mapHref}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`${p.name} on the map`}
                          className="rounded-full border border-aurora-border px-3 py-1 text-[12px] font-medium text-aurora-ink2"
                        >
                          Map
                        </a>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </li>
          )
        })}
      </ol>

      <div className="border-t border-aurora-border px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-3">
          {addAllTo && onAddAll ? (
            // Once every place is on the trip it stops offering to add them and
            // opens the trip instead — each row's own "Added" is where one
            // comes back off.
            allAdded && onOpenTrip ? (
              <button
                type="button"
                onClick={onOpenTrip}
                className="inline-flex items-center gap-2 rounded-full border border-drift-coral/50 bg-drift-coral/15 px-4 py-2 font-drift-display text-[13.5px] font-bold text-drift-coral outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-drift-coral/50"
              >
                ✓ All added to {addAllTo}
                <span aria-hidden="true">&rarr;</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void addAll()}
                disabled={allBusy || allAdded}
                className="inline-flex items-center gap-2 rounded-full bg-aurora-teal px-4 py-2 font-drift-display text-[13.5px] font-bold text-aurora-teal-ink outline-none transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-aurora-teal/50"
              >
                {allAdded
                  ? "✓ All added"
                  : allBusy
                    ? "Adding…"
                    : addedCount > 0
                      ? `Add the rest to ${addAllTo}`
                      : `Add all to ${addAllTo}`}
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => void create()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full bg-aurora-teal px-4 py-2 font-drift-display text-[13.5px] font-bold text-aurora-teal-ink outline-none transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-aurora-teal/50"
            >
              {busy ? "Creating…" : `Create ${itin.destination} trip`}
              {!busy && <span aria-hidden="true">&rarr;</span>}
            </button>
          )}
          {error && <span className="text-[12.5px] text-aurora-ink3">{error}</span>}
        </div>

        {/* "Tune it": one tap re-drafts the plan slower, fuller, cheaper… A
            quick chat leads with the switch to being asked instead. */}
        {planTools && (
          <div className="-mx-1 mt-3 flex items-center gap-2 overflow-x-auto px-1 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="shrink-0 text-[12.5px] font-semibold text-aurora-ink3">Tune it</span>
            {planTools.mode === "quick" && (
              <TuneChip accent label={WALK_THROUGH} onClick={planTools.onWalkThrough} />
            )}
            {TUNES.map((t) => (
              <TuneChip key={t.label} label={t.label} onClick={() => planTools.onTune(t.prompt)} />
            ))}
            <TuneChip label="+ Add a must-see" onClick={planTools.onAddMustSee} />
          </div>
        )}
      </div>

      {open && (
        <PlaceSheet
          poi={open.poi}
          distanceLabel={null}
          showSave={false}
          addState={open.phase}
          onAdd={() => toggleOne(open.dayIndex, open.place)}
          onClose={() => setOpenRow(null)}
        />
      )}
    </section>
  )
}

/** Add · Adding… · Added · Removing… — one control, four states, and "Added"
 *  is a live one: tapping it takes the place back off the trip. */
function AddPill({
  phase,
  place,
  canUndo,
  disabled,
  onClick,
}: {
  phase: AddPhase
  place: string
  canUndo: boolean
  disabled: boolean
  onClick: () => void
}) {
  const landed = phase === "added" || phase === "removing"
  const label =
    phase === "adding" ? "Adding…" : phase === "removing" ? "Removing…" : phase === "added" ? "✓ Added" : "Add"
  const busy = phase === "adding" || phase === "removing"
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy || (phase === "added" && !canUndo)}
      aria-label={phase === "added" ? `Undo ${place}` : phase === "add" ? `Add ${place}` : `${place} ${label}`}
      title={phase === "added" && canUndo ? `Undo ${place}` : undefined}
      className={
        landed
          ? "rounded-full border border-drift-coral/50 bg-drift-coral/15 px-3 py-1 text-[12px] font-semibold text-drift-coral disabled:opacity-50"
          : "rounded-full bg-aurora-teal px-3 py-1 text-[12px] font-bold text-aurora-teal-ink disabled:opacity-50"
      }
    >
      {label}
    </button>
  )
}

function TuneChip({ label, accent, onClick }: { label: string; accent?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${
        accent
          ? "border border-drift-coral/60 bg-drift-coral/12 text-drift-coral"
          : "border border-aurora-border bg-aurora-glass2 text-aurora-ink2"
      }`}
    >
      {label}
    </button>
  )
}

/**
 * The plan's own place, in the shape the Discover sheet reads.
 *
 * Built from whatever has landed: with a resolved candidate it is the real
 * Google place, so the sheet hydrates photos, hours and reviews; without one it
 * is still the card's name and blurb, shown at once rather than after a lookup.
 * The `plan:` id is what tells the sheet there is nothing to hydrate yet.
 */
function planPoi(place: ItineraryPlace, cand: PlaceCandidate | null | undefined): DiscoverResult {
  const google = !!cand && (!cand.source || cand.source === "google")
  return {
    id: google && cand?.id ? cand.id : `plan:${place.name}`,
    name: cand?.name || place.name,
    photo: cand ? placePhotoUrl(cand, 900) : null,
    rating: cand?.rating ?? null,
    reviewCount: cand?.reviewCount ?? null,
    priceLabel: null,
    subtitle: cand?.primaryType ?? null,
    address: cand?.address ?? null,
    // The card's own line about why this place is here — the plan's reason for
    // it is the thing worth reading first, before any Google prose.
    description: place.why || cand?.editorialSummary || null,
    lat: cand?.latitude ?? null,
    lng: cand?.longitude ?? null,
    bookingUrl: null,
    source: "google",
  }
}
