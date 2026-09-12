"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { placePhotoUrl, resolvePlace, type PlaceCandidate } from "@/lib/drift/chat"
import type { ChatItinerary } from "@/lib/drift/generalChat"
import { createTripFromItinerary, type ResolvedPlace } from "@/lib/drift/createTripFromItinerary"

/**
 * A plan the assistant laid out, drawn as days rather than printed as JSON.
 *
 * The model is told to append its itinerary as one machine block, and the whole
 * point of asking for a block instead of prose is that the app can render it:
 * days as sections, places as rows with their own photograph, and one button
 * that turns the lot into a real trip. Without this the block is stripped and
 * thrown away, which is a worse answer than never asking for it — the reader
 * gets a paragraph where they were promised a plan.
 *
 * ONLY THE TAP SAVES IT. The system prompt tells the model it cannot save a
 * trip itself and must never claim it has; this button is the other half of
 * that promise, so "Create this trip" is the first moment anything is written.
 */
export default function ItineraryCard({ itin }: { itin: ChatItinerary }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolved, setResolved] = useState<Record<string, PlaceCandidate>>({})

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
    if (hydratedRef.current) return
    hydratedRef.current = true
    // NO `alive` FLAG, deliberately, and this cost an hour to see. The ref
    // above already guarantees one run — but React's dev double-mount runs
    // mount → cleanup → mount, so a cleanup that set `alive = false` discarded
    // every result of the first (and only) run, while the second was turned
    // away by the ref. Eleven lookups returned 200 and not one reached the
    // screen. A setState on an unmounted component is a harmless no-op in
    // React 18; a dropped result is not.
    void Promise.all(
      places.slice(0, 12).map(async (p) => {
        const cand = await resolvePlace(p.name, itin.destination, itin.country ?? undefined)
        if (!cand) return
        setResolved((r) => (r[p.name] ? r : { ...r, [p.name]: cand }))
      })
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
          {itin.days.length} {itin.days.length === 1 ? "day" : "days"} &middot; {places.length}{" "}
          {places.length === 1 ? "place" : "places"}
          {itin.country ? ` · ${itin.country}` : ""}
        </p>
      </header>

      <ol className="divide-y divide-aurora-border">
        {itin.days.map((day, i) => (
          <li key={`${day.title}-${i}`} className="px-4 py-3.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-aurora-teal">
              Day {i + 1}
              {day.title ? ` · ${day.title}` : ""}
            </p>
            <ul className="mt-2.5 space-y-2.5">
              {day.places.map((p) => {
                const cand = resolved[p.name]
                const photo = cand ? placePhotoUrl(cand) : null
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
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-3 border-t border-aurora-border px-4 py-3.5">
        <button
          type="button"
          onClick={() => void create()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-aurora-teal px-4 py-2 font-drift-display text-[13.5px] font-bold text-aurora-teal-ink outline-none transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-aurora-teal/50"
        >
          {busy ? "Creating…" : `Create ${itin.destination} trip`}
          {!busy && <span aria-hidden="true">&rarr;</span>}
        </button>
        {error && <span className="text-[12.5px] text-aurora-ink3">{error}</span>}
      </div>
    </section>
  )
}
