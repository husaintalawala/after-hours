"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { placePhotoUrl, resolvePlace, type PlaceCandidate } from "@/lib/drift/chat"
import type { ChatItinerary, ItineraryPlace } from "@/lib/drift/generalChat"
import { createTripFromItinerary, type ResolvedPlace } from "@/lib/drift/createTripFromItinerary"
import { shortDate } from "@/lib/drift/itineraryPlacement"

/** The row identity `isAdded` is asked about — unique within one plan. */
export function itineraryRowKey(dayIndex: number, name: string): string {
  return `${dayIndex}:${name}`
}

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
  isAdded,
  onAddAll,
  addAllTo,
  resolvePhotos = true,
}: {
  itin: ChatItinerary
  /** Per-place Add. Absent = no Add buttons. */
  onAdd?: (place: ItineraryPlace, dayIndex: number, candidate: PlaceCandidate | null) => Promise<void>
  /** Whether the row `itineraryRowKey(day, name)` is already added. */
  isAdded?: (rowKey: string) => boolean
  /** Add every place not yet added, given whatever photos/coords resolved. */
  onAddAll?: (resolved: Record<string, PlaceCandidate>) => Promise<void>
  /** Trip name — shows "Add all to <name>" in place of "Create this trip". */
  addAllTo?: string
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
  const [allBusy, setAllBusy] = useState(false)

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

  async function addAll() {
    if (!onAddAll || allBusy) return
    setAllBusy(true)
    try {
      await onAddAll(resolved)
    } finally {
      setAllBusy(false)
    }
  }

  const allAdded =
    !!isAdded && itin.days.every((d, i) => d.places.every((p) => isAdded(itineraryRowKey(i, p.name))))

  async function create() {
    if (busy) return
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
      setError(res.error)
      setBusy(false)
      return
    }
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
        {itin.days.map((day, i) => (
          <li key={`${day.title}-${i}`} className="px-4 py-3.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-aurora-teal">
              Day {i + 1}
              {day.date ? ` · ${shortDate(day.date)}` : ""}
              {day.title ? ` · ${day.title}` : ""}
            </p>
            <ul className="mt-2.5 space-y-2.5">
              {day.places.map((p) => {
                const cand = resolved[p.name]
                const photo = cand ? placePhotoUrl(cand) : null
                const key = itineraryRowKey(i, p.name)
                const added = !!isAdded?.(key)
                const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  p.query || [p.name, day.destinationRef || itin.destination].filter(Boolean).join(" ")
                )}`
                return (
                  <li key={p.name} className="flex items-start gap-3">
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
                      <span className="mt-2 flex flex-wrap items-center gap-2">
                        {onAdd &&
                          (added ? (
                            <span
                              aria-label={`${p.name} added`}
                              className="rounded-full border border-aurora-teal/40 px-3 py-1 text-[12px] font-semibold text-aurora-teal"
                            >
                              ✓ Added
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void addOne(i, p)}
                              disabled={!!rowBusy[key] || allBusy}
                              aria-label={`Add ${p.name}`}
                              className="rounded-full bg-aurora-teal px-3 py-1 text-[12px] font-bold text-aurora-teal-ink disabled:opacity-50"
                            >
                              {rowBusy[key] ? "Adding…" : "Add"}
                            </button>
                          ))}
                        <a
                          href={mapHref}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`${p.name} on the map`}
                          className="rounded-full border border-aurora-border px-3 py-1 text-[12px] font-medium text-aurora-ink2"
                        >
                          Map
                        </a>
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-3 border-t border-aurora-border px-4 py-3.5">
        {addAllTo && onAddAll ? (
          <button
            type="button"
            onClick={() => void addAll()}
            disabled={allBusy || allAdded}
            className="inline-flex items-center gap-2 rounded-full bg-aurora-teal px-4 py-2 font-drift-display text-[13.5px] font-bold text-aurora-teal-ink outline-none transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-aurora-teal/50"
          >
            {allAdded ? "✓ All added" : allBusy ? "Adding…" : `Add all to ${addAllTo}`}
          </button>
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
    </section>
  )
}
