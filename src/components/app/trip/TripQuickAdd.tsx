"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import OptimizedImg from "@/components/app/OptimizedImg"
import { AnalyticsEvent, capture } from "@/lib/analytics"
import { checkTripActivated } from "@/lib/drift/activation"
import { resolvePlaceCandidates, type PlaceCandidate } from "@/lib/drift/chat"
import { staticPlacePickerMapUrl } from "@/lib/drift/staticMap"
import {
  buildTripQuickAddRow,
  type QuickAddDestination,
  type TripQuickAddKind,
} from "@/lib/drift/tripQuickAdd"
import { createClient } from "@/lib/supabase/client"

const MODES: Array<{ kind: TripQuickAddKind; label: string; helper: string }> = [
  { kind: "destination", label: "Destination", helper: "Cities, regions" },
  { kind: "spot", label: "Spot", helper: "Food, sights" },
  { kind: "stay", label: "Stay", helper: "Hotels, rentals" },
]

function photo(candidate: PlaceCandidate | null): string | null {
  return candidate?.heroImageURL ?? candidate?.photoUrl ?? null
}

function shortDate(value: string | null | undefined): string {
  if (!value) return "Choose day"
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`)
  return Number.isNaN(parsed.valueOf())
    ? value.slice(0, 10)
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parsed)
}

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
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<TripQuickAddKind>(destinations.length ? "spot" : "destination")
  const [destinationId, setDestinationId] = useState(destinations[0]?.id ?? "")
  const [query, setQuery] = useState("")
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([])
  const [picked, setPicked] = useState<PlaceCandidate | null>(null)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedName, setSavedName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sequence = useRef(0)

  useEffect(() => {
    if (!destinationId && destinations[0]) setDestinationId(destinations[0].id)
  }, [destinationId, destinations])

  const destination = destinations.find((item) => item.id === destinationId) ?? destinations[0] ?? null
  const mapCenter = picked?.latitude != null && picked?.longitude != null
    ? { lat: picked.latitude, lng: picked.longitude }
    : destination?.lat != null && destination?.lng != null
      ? { lat: destination.lat, lng: destination.lng }
      : null
  const mapUrl = mapCenter
    ? staticPlacePickerMapUrl(mapCenter.lat, mapCenter.lng, 900, 700, picked ? 11.2 : 9.8)
    : null

  useEffect(() => {
    const search = query.trim()
    if (!open || search.length < 2 || picked) {
      setCandidates([])
      setSearching(false)
      return
    }
    const current = ++sequence.current
    setSearching(true)
    const timer = setTimeout(async () => {
      const results = await resolvePlaceCandidates(search, kind === "destination" ? undefined : destination?.label)
      if (sequence.current !== current) return
      setCandidates(results.slice(0, 6))
      setSearching(false)
    }, 350)
    return () => clearTimeout(timer)
  }, [destination?.label, kind, open, picked, query])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = previous }
  }, [open])

  function reset(nextOpen = false) {
    sequence.current += 1
    setOpen(nextOpen)
    setKind(destinations.length ? "spot" : "destination")
    setQuery("")
    setCandidates([])
    setPicked(null)
    setSearching(false)
    setSaving(false)
    setSavedName(null)
    setError(null)
  }

  function chooseKind(next: TripQuickAddKind) {
    if (next !== "destination" && destinations.length === 0) {
      setKind("destination")
      setError("Add a destination first, then add your spot or stay.")
      return
    }
    setKind(next)
    setQuery("")
    setCandidates([])
    setPicked(null)
    setError(null)
  }

  async function save() {
    if (!picked || saving) return
    setSaving(true)
    setError(null)
    try {
      const row = buildTripQuickAddRow({ kind, tripId, candidate: picked, destination, tripStart })
      await createClient().from("steps").insert(row).throwOnError()
      capture(AnalyticsEvent.AddToItinerary, { source: "search" })
      void checkTripActivated(tripId)
      setSavedName(picked.name)
      router.refresh()
      window.setTimeout(() => reset(false), 900)
    } catch (cause) {
      setSaving(false)
      const message = cause instanceof Error ? cause.message : (cause as { message?: string })?.message
      setError(message || `Couldn't add ${picked.name}.`)
    }
  }

  const placeholder = kind === "destination"
    ? "Search cities or regions"
    : kind === "stay"
      ? `Search stays near ${destination?.label ?? "your trip"}`
      : `Search near ${destination?.label ?? "your trip"}`
  const activeMode = MODES.find((mode) => mode.kind === kind)!
  const dayLabel = destination ? `${destination.label} · ${shortDate(destination.date)}` : "Your trip"
  const visibleCandidates = useMemo(() => candidates.filter((candidate) => candidate.id !== picked?.id), [candidates, picked])

  return (
    <>
      <button type="button" onClick={() => reset(true)} aria-label="Add to trip" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-[#08131D]/75 text-[25px] font-light leading-none text-white shadow-[0_12px_32px_rgba(0,0,0,.42)] backdrop-blur-2xl transition hover:border-aurora-teal/60 hover:bg-[#102534]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aurora-teal">+</button>

      {open && (
        <div role="dialog" aria-modal="true" aria-labelledby="quick-add-title" className="fixed inset-0 z-[100] overflow-hidden bg-[#06111A] text-white">
          <div className="absolute inset-0">
            {mapUrl ? <OptimizedImg src={mapUrl} alt="Map around the selected trip destination" fill priority sizes="100vw" className="object-cover opacity-90" /> : <div className="h-full w-full bg-[radial-gradient(circle_at_32%_18%,rgba(55,214,196,.18),transparent_28%),radial-gradient(circle_at_80%_45%,rgba(47,91,122,.34),transparent_36%),#06111A]" />}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,12,20,.15)_0%,rgba(3,12,20,.1)_37%,rgba(3,12,20,.82)_72%,#06111A_100%)]" />
          </div>

          <div className="relative mx-auto flex h-full w-full max-w-3xl flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
            <header className="grid grid-cols-[44px_1fr_44px] items-center rounded-[28px] border border-white/20 bg-[#071722]/70 px-2 py-2 shadow-[0_20px_60px_rgba(0,0,0,.35)] backdrop-blur-3xl">
              <button onClick={() => reset(false)} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[25px] font-light leading-none" aria-label="Close">×</button>
              <div className="min-w-0 text-center"><h2 id="quick-add-title" className="truncate text-[18px] font-bold">Add {kind === "destination" ? "to your trip" : `a ${kind}`}</h2><p className="truncate text-[12px] text-white/65">{dayLabel}</p></div>
              <span />
            </header>

            <div className="mt-3 rounded-[26px] border border-white/20 bg-[#071722]/68 p-1.5 shadow-[0_20px_60px_rgba(0,0,0,.28)] backdrop-blur-3xl">
              <div className="grid grid-cols-3 gap-1">
                {MODES.map((mode) => <button key={mode.kind} type="button" onClick={() => chooseKind(mode.kind)} aria-pressed={kind === mode.kind} className={`min-w-0 rounded-[20px] px-2 py-2.5 text-center transition ${kind === mode.kind ? "border border-aurora-teal/70 bg-aurora-teal/25 shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_0_22px_rgba(55,214,196,.15)]" : "border border-transparent text-white/72 hover:bg-white/5"}`}><span className="block text-[14px] font-bold">{mode.label}</span><span className="mt-0.5 block truncate text-[10px] text-white/55">{mode.helper}</span></button>)}
              </div>
            </div>

            <label className="mt-3 flex h-14 items-center gap-3 rounded-[22px] border border-white/25 bg-[#071722]/64 px-4 shadow-[0_18px_44px_rgba(0,0,0,.3)] backdrop-blur-3xl focus-within:border-aurora-teal/70">
              <span className="text-[12px] font-bold uppercase tracking-[.16em] text-aurora-teal">Search</span>
              <input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setPicked(null) }} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-[16px] text-white outline-none placeholder:text-white/48" />
              {query && <button type="button" onClick={() => { setQuery(""); setPicked(null) }} className="text-[12px] font-semibold text-white/65">Clear</button>}
            </label>

            <div className="min-h-0 flex-1" />

            <section className="max-h-[54vh] overflow-y-auto overscroll-contain rounded-[30px] border border-white/20 bg-[#071722]/80 p-3 shadow-[0_-18px_70px_rgba(0,0,0,.48)] backdrop-blur-3xl sm:p-4">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/35" />
              {savedName ? (
                <div className="grid min-h-48 place-items-center px-6 text-center"><div><p className="text-[12px] font-bold uppercase tracking-[.18em] text-aurora-teal">Added to trip</p><p className="mt-2 font-drift-display text-3xl font-bold">{savedName}</p></div></div>
              ) : picked ? (
                <div>
                  {photo(picked) && <div className="relative h-36 overflow-hidden rounded-[22px]"><OptimizedImg src={photo(picked)!} alt={picked.name} fill sizes="(max-width: 768px) 100vw, 720px" className="object-cover" /></div>}
                  <div className="px-1 pb-1 pt-4 sm:px-2">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-drift-display text-[28px] font-bold leading-tight">{picked.name}</p><p className="mt-1 truncate text-[13px] text-white/65">{picked.address || picked.primaryType || activeMode.helper}</p></div><button type="button" onClick={() => setPicked(null)} className="shrink-0 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-[12px] font-semibold text-aurora-teal">Change</button></div>
                    {kind !== "destination" && destinations.length > 0 && <label className="mt-4 flex items-center gap-3 rounded-[18px] border border-white/15 bg-black/15 px-4 py-3"><span className="text-[12px] font-bold text-white/60">ADD TO</span><select value={destination?.id ?? ""} onChange={(event) => setDestinationId(event.target.value)} className="min-w-0 flex-1 bg-transparent text-right text-[14px] font-semibold text-white outline-none">{destinations.map((item) => <option key={item.id} value={item.id}>{item.label} · {shortDate(item.date)}</option>)}</select></label>}
                    {error && <p role="alert" className="mt-3 rounded-xl bg-red-400/10 px-3 py-2 text-[13px] text-red-100">{error}</p>}
                    <button type="button" onClick={save} disabled={saving} className="mt-4 h-14 w-full rounded-[19px] bg-aurora-teal text-[16px] font-bold text-[#04231F] shadow-[0_12px_34px_rgba(55,214,196,.24)] disabled:opacity-55">{saving ? "Adding…" : `Add ${picked.name}`}</button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-baseline justify-between px-1 pb-2"><p className="text-[17px] font-bold">{query.trim().length < 2 ? `Find a ${activeMode.label.toLowerCase()}` : "Places nearby"}</p>{searching && <p className="text-[12px] text-aurora-teal">Searching…</p>}</div>
                  {error && <p role="alert" className="mb-2 rounded-xl bg-red-400/10 px-3 py-2 text-[13px] text-red-100">{error}</p>}
                  {query.trim().length < 2 && <p className="px-1 pb-8 pt-3 text-[14px] leading-relaxed text-white/58">Search by name, neighborhood, or something you want to do. Nothing is added until you confirm it here.</p>}
                  {!searching && query.trim().length >= 2 && visibleCandidates.length === 0 && <p className="px-1 py-6 text-[14px] text-white/58">No places found. Try a broader search.</p>}
                  <div className="divide-y divide-white/10">
                    {visibleCandidates.map((candidate) => <button key={candidate.id} type="button" onClick={() => setPicked(candidate)} className="flex w-full items-center gap-3 py-3 text-left"><span className="relative h-16 w-20 shrink-0 overflow-hidden rounded-[16px] bg-white/8">{photo(candidate) && <OptimizedImg src={photo(candidate)!} alt="" fill sizes="80px" className="object-cover" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-bold">{candidate.name}</span><span className="mt-1 block truncate text-[12px] text-white/58">{candidate.address || candidate.primaryType || activeMode.helper}</span></span><span className="text-[12px] font-bold text-aurora-teal">Select</span></button>)}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  )
}
