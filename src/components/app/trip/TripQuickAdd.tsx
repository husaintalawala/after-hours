"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AnalyticsEvent, capture } from "@/lib/analytics"
import { checkTripActivated } from "@/lib/drift/activation"
import { resolvePlaceCandidates, type PlaceCandidate } from "@/lib/drift/chat"
import {
  buildTripQuickAddRow,
  type QuickAddDestination,
  type TripQuickAddKind,
} from "@/lib/drift/tripQuickAdd"
import { createClient } from "@/lib/supabase/client"

const ACTIONS: Array<{
  kind: TripQuickAddKind
  icon: string
  title: string
  subtitle: string
}> = [
  { kind: "destination", icon: "＋", title: "Add a destination", subtitle: "Add a city to visit" },
  { kind: "spot", icon: "⌖", title: "Add a Spot", subtitle: "Restaurants, landmarks, activities" },
  { kind: "stay", icon: "▰", title: "Add a Stay", subtitle: "Hotels, hostels and more" },
]

export default function TripQuickAdd({
  tripId,
  tripStart,
  destinations,
}: {
  tripId: string
  tripStart: string | null
  destinations: QuickAddDestination[]
}) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [kind, setKind] = useState<TripQuickAddKind | null>(null)
  const [destinationId, setDestinationId] = useState(destinations[0]?.id ?? "")
  const [query, setQuery] = useState("")
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([])
  const [picked, setPicked] = useState<PlaceCandidate | null>(null)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sequence = useRef(0)

  useEffect(() => {
    if (!destinationId && destinations[0]) setDestinationId(destinations[0].id)
  }, [destinationId, destinations])

  const destination = destinations.find((item) => item.id === destinationId) ?? destinations[0] ?? null

  useEffect(() => {
    const search = query.trim()
    if (!kind || search.length < 2 || picked) {
      setCandidates([])
      setSearching(false)
      return
    }
    const current = ++sequence.current
    setSearching(true)
    const timer = setTimeout(async () => {
      const results = await resolvePlaceCandidates(
        search,
        kind === "destination" ? undefined : destination?.label,
      )
      if (sequence.current !== current) return
      setCandidates(results.slice(0, 6))
      setSearching(false)
    }, 350)
    return () => clearTimeout(timer)
  }, [destination?.label, kind, picked, query])

  function closeComposer() {
    sequence.current += 1
    setKind(null)
    setQuery("")
    setCandidates([])
    setPicked(null)
    setSearching(false)
    setSaving(false)
    setError(null)
  }

  function chooseKind(next: TripQuickAddKind) {
    setMenuOpen(false)
    if (next !== "destination" && destinations.length === 0) {
      setKind("destination")
      setError("Add a destination first, then add your spot or stay.")
      return
    }
    setKind(next)
    setError(null)
  }

  async function save() {
    if (!kind || !picked || saving) return
    setSaving(true)
    setError(null)
    try {
      const row = buildTripQuickAddRow({
        kind,
        tripId,
        candidate: picked,
        destination,
        tripStart,
      })
      await createClient().from("steps").insert(row).throwOnError()
      capture(AnalyticsEvent.AddToItinerary, { source: "search" })
      void checkTripActivated(tripId)
      closeComposer()
      router.refresh()
    } catch (cause) {
      setSaving(false)
      const message = cause instanceof Error
        ? cause.message
        : (cause as { message?: string })?.message
      setError(message || `Couldn't add ${picked.name}.`)
    }
  }

  const action = ACTIONS.find((item) => item.kind === kind)

  return (
    <>
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-label="Add to trip"
        aria-expanded={menuOpen}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-aurora-border bg-aurora-midnight2 text-[26px] font-light leading-none text-drift-ink shadow-lg"
      >
        {menuOpen ? "×" : "+"}
      </button>

      {menuOpen && (
        <>
          <button
            type="button"
            aria-label="Close add menu"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-40 bg-black/20"
          />
          <div className="fixed inset-x-4 bottom-[calc(7.4rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-sm overflow-hidden rounded-3xl border border-aurora-border bg-[#08131D]/[.98] p-2 shadow-2xl backdrop-blur-xl">
            {ACTIONS.map((item, index) => (
              <button
                key={item.kind}
                type="button"
                onClick={() => chooseKind(item.kind)}
                className={`flex w-full items-center gap-3 px-3 py-3.5 text-left ${index ? "border-t border-aurora-border" : ""}`}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-aurora-teal text-[22px] font-semibold text-[#08131D]">
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold text-drift-ink">{item.title}</span>
                  <span className="block truncate text-[12.5px] text-drift-text-tertiary">{item.subtitle}</span>
                </span>
                <span aria-hidden className="text-xl text-drift-text-tertiary">›</span>
              </button>
            ))}
          </div>
        </>
      )}

      {kind && action && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="trip-quick-add-title"
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={closeComposer}
        >
          <div className="aurora-card w-full max-w-md overflow-hidden rounded-b-none rounded-t-hero sm:rounded-hero" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pb-2 pt-5">
              <div>
                <h2 id="trip-quick-add-title" className="font-drift-display text-[21px] font-bold text-aurora-ink">{action.title}</h2>
                <p className="mt-0.5 text-[13px] text-aurora-ink2">{action.subtitle}</p>
              </div>
              <button type="button" onClick={closeComposer} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-aurora-midnight2 text-xl text-aurora-ink2">×</button>
            </div>

            <div className="max-h-[64vh] overflow-y-auto px-5 pb-4">
              {kind !== "destination" && destinations.length > 1 && (
                <label className="mb-3 block text-[11px] font-bold uppercase tracking-wide text-aurora-ink3">
                  Destination
                  <select
                    value={destination?.id ?? ""}
                    onChange={(event) => setDestinationId(event.target.value)}
                    className="mt-1.5 h-11 w-full rounded-xl border border-aurora-border bg-aurora-midnight2 px-3 text-[15px] normal-case text-aurora-ink outline-none focus:border-aurora-teal"
                  >
                    {destinations.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </label>
              )}

              {error && <p role="alert" className="mb-3 rounded-xl bg-red-400/10 px-3 py-2 text-[13px] text-red-200">{error}</p>}

              {!picked ? (
                <>
                  <input
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={kind === "destination" ? "Search a city…" : kind === "stay" ? "Search hotels and stays…" : "Search restaurants, landmarks, activities…"}
                    className="h-11 w-full rounded-xl border border-aurora-border bg-aurora-midnight2 px-3 text-[15px] text-aurora-ink outline-none focus:border-aurora-teal"
                  />
                  <div className="mt-2 space-y-1">
                    {searching && <p className="px-1 py-2 text-[13px] text-aurora-ink3">Searching…</p>}
                    {!searching && candidates.map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => setPicked(candidate)}
                        className="flex w-full items-center gap-3 rounded-xl bg-aurora-midnight2 p-3 text-left hover:bg-aurora-glass2"
                      >
                        <span aria-hidden>{kind === "stay" ? "▰" : "📍"}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-semibold text-aurora-ink">{candidate.name}</span>
                          {candidate.address && <span className="block truncate text-[12px] text-aurora-ink3">{candidate.address}</span>}
                        </span>
                      </button>
                    ))}
                    {!searching && query.trim().length >= 2 && candidates.length === 0 && (
                      <p className="px-1 py-2 text-[13px] text-aurora-ink3">No places found. Try another search.</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3 rounded-xl bg-aurora-midnight2 p-3">
                  <span aria-hidden>{kind === "stay" ? "▰" : "📍"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-aurora-ink">{picked.name}</span>
                    {picked.address && <span className="block truncate text-[12px] text-aurora-ink3">{picked.address}</span>}
                  </span>
                  <button type="button" onClick={() => setPicked(null)} className="text-[12px] font-semibold text-aurora-teal">Change</button>
                </div>
              )}
            </div>

            <div className="border-t border-aurora-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button type="button" onClick={save} disabled={!picked || saving} className="aurora-cta h-11 w-full disabled:opacity-40">
                {saving ? "Adding…" : picked ? `Add ${picked.name}` : action.title}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
