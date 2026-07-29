"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { resolvePlaceCandidates, placePhotoUrl, type PlaceCandidate } from "@/lib/drift/chat"
import { applyCreateStep, type CreateStepOp } from "@/lib/drift/quickOp"
import { AnalyticsEvent, capture } from "@/lib/analytics"
import type { DestinationVM, StepDetailVM } from "./TripTabs"

// Full-screen trip Map — the day mini-map expanded. Phase 1: day-filter chips,
// the day's ordered stops as numbered pins + glowing teal→indigo route, tap a
// pin for a place card. Phase 2: search a place, drop it, add it to a day
// (same quick-op write path Discover uses). Directions/ETAs are Phase 3.
// Aurora dark, single-theme by design (a map surface).

type MapPoint = { id: string; lat: number; lng: number; label: string; n: number; time: string | null }
type MapDay = { dayNumber: number; date: string; label: string; points: MapPoint[] }
type Selected =
  | { kind: "stop"; point: MapPoint }
  | { kind: "search"; cand: PlaceCandidate }
  | null

const TEAL = "#37D6C4"
const INDIGO = "#6B5CFF"

function fmtDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return date
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
}
function fmtTime(min: number | null): string | null {
  if (min == null) return null
  const h = Math.floor(min / 60)
  const m = min % 60
  const ampm = h < 12 ? "am" : "pm"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`
}

export default function TripMapView({
  open,
  onClose,
  tripId,
  dest,
  stepDetails,
  initialDay,
}: {
  open: boolean
  onClose: () => void
  tripId: string
  dest: DestinationVM
  stepDetails: Record<string, StepDetailVM>
  initialDay: number
}) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const styleReadyRef = useRef(false)

  const [activeDay, setActiveDay] = useState<number | "all">(initialDay)
  const [selected, setSelected] = useState<Selected>(null)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PlaceCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Days (coord-bearing stops per day, numbered in itinerary order).
  const days: MapDay[] = useMemo(
    () =>
      dest.days.map((d) => {
        const points: MapPoint[] = []
        d.items.forEach((it) => {
          const s = it.linkedStepId ? stepDetails[it.linkedStepId] : null
          const lat = s?.lat ?? it.latitude
          const lng = s?.lng ?? it.longitude
          if (lat != null && lng != null) {
            points.push({ id: it.id, lat, lng, label: it.title, n: points.length + 1, time: fmtTime(it.startTimeMinutes) })
          }
        })
        return { dayNumber: d.dayNumber, date: d.date, label: fmtDay(d.date), points }
      }),
    [dest, stepDetails]
  )

  // The pins/route currently shown: one day, or the whole destination in order.
  const visible: MapPoint[] = useMemo(() => {
    if (activeDay === "all") {
      return days.flatMap((d) => d.points).map((p, i) => ({ ...p, n: i + 1 }))
    }
    return days.find((d) => d.dayNumber === activeDay)?.points ?? []
  }, [days, activeDay])

  const targetDay = useMemo(
    () => (activeDay === "all" ? days[0] : days.find((d) => d.dayNumber === activeDay)) ?? days[0] ?? null,
    [days, activeDay]
  )

  // Reset to the tapped day each time the sheet opens.
  useEffect(() => {
    if (open) {
      setActiveDay(initialDay)
      setSelected(null)
      setQuery("")
      setResults([])
    }
  }, [open, initialDay])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(t)
  }, [toast])

  // Create the map once the sheet is open (and the container exists).
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!open || !token || !containerRef.current || mapRef.current) return
    mapboxgl.accessToken = token
    const first = visible[0] ?? (dest.lat != null && dest.lng != null ? { lng: dest.lng, lat: dest.lat } : null)
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/navigation-night-v1",
      center: first ? [first.lng, first.lat] : [2.1734, 41.3851],
      zoom: 12,
      attributionControl: false,
    })
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right")
    map.on("load", () => {
      styleReadyRef.current = true
      const logo = containerRef.current?.querySelector(".mapboxgl-ctrl-logo") as HTMLElement | null
      if (logo) logo.style.display = "none"
      draw()
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      styleReadyRef.current = false
      markersRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Redraw route + markers whenever the visible set or the search results change.
  useEffect(() => {
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, results, open])

  function draw() {
    const map = mapRef.current
    if (!map || !styleReadyRef.current) return

    // Route line (glow halo + indigo core) through the visible stops in order.
    const fc = {
      type: "FeatureCollection" as const,
      features:
        visible.length > 1
          ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: visible.map((p) => [p.lng, p.lat]) } }]
          : [],
    }
    const src = map.getSource("route") as mapboxgl.GeoJSONSource | undefined
    if (src) {
      src.setData(fc)
    } else {
      map.addSource("route", { type: "geojson", data: fc })
      map.addLayer({ id: "route-glow", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": TEAL, "line-width": 9, "line-blur": 5, "line-opacity": 0.4 } })
      map.addLayer({ id: "route-core", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": INDIGO, "line-width": 3.5, "line-opacity": 0.95 } })
    }

    // Markers — clear then re-add: numbered teal stop pins + indigo search pins.
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []
    const bounds = new mapboxgl.LngLatBounds()

    for (const p of visible) {
      const el = document.createElement("div")
      el.textContent = String(p.n)
      el.style.cssText =
        "display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;" +
        "background:#37D6C4;color:#04231F;font-weight:700;font-size:13px;border:2px solid #fff;cursor:pointer;" +
        "box-shadow:0 0 0 4px rgba(55,214,196,.18),0 0 12px 2px rgba(55,214,196,.5)"
      el.addEventListener("click", (e) => {
        e.stopPropagation()
        setSelected({ kind: "stop", point: p })
      })
      markersRef.current.push(new mapboxgl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map))
      bounds.extend([p.lng, p.lat])
    }

    for (const c of results) {
      if (c.latitude == null || c.longitude == null) continue
      const el = document.createElement("div")
      el.textContent = "+"
      el.style.cssText =
        "display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;" +
        "background:#6B5CFF;color:#fff;font-weight:700;font-size:16px;border:2px solid #fff;cursor:pointer;" +
        "box-shadow:0 0 12px 2px rgba(107,92,255,.55)"
      el.addEventListener("click", (e) => {
        e.stopPropagation()
        setSelected({ kind: "search", cand: c })
      })
      markersRef.current.push(new mapboxgl.Marker({ element: el }).setLngLat([c.longitude, c.latitude]).addTo(map))
      bounds.extend([c.longitude, c.latitude])
    }

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: { top: 130, right: 60, bottom: 190, left: 340 }, maxZoom: 15, duration: 500 })
    }
  }

  // Debounced place search (Phase 2), anchored to this destination.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const t = window.setTimeout(async () => {
      const cands = await resolvePlaceCandidates(q, dest.label, dest.country ?? undefined)
      setResults(cands.filter((c) => c.latitude != null && c.longitude != null).slice(0, 8))
      setSearching(false)
    }, 350)
    return () => window.clearTimeout(t)
  }, [query, dest.label, dest.country])

  async function addSearchPlace(cand: PlaceCandidate) {
    if (adding || !targetDay) return
    setAdding(true)
    const placeId = cand.source === "google" && !cand.id.startsWith("osm:") && !cand.id.startsWith("geonames:") ? cand.id : null
    const op: CreateStepOp = {
      op: "create_step",
      type: "spot",
      title: cand.name,
      destination_ref: dest.label,
      date: targetDay.date,
    }
    try {
      await applyCreateStep(tripId, op, { name: cand.name, lat: cand.latitude, lng: cand.longitude, place_id: placeId })
      capture(AnalyticsEvent.AddToItinerary, { source: "trip_map" })
      setToast(`Added ${cand.name} to Day ${targetDay.dayNumber}`)
      setSelected(null)
      setQuery("")
      setResults([])
      router.refresh()
    } catch {
      setToast("Couldn't add — try again.")
    } finally {
      setAdding(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[95] bg-aurora-midnight font-drift-body text-aurora-ink">
      <div ref={containerRef} className="absolute inset-0" />
      {/* legibility scrim under the top/left chrome */}
      <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg,rgba(5,11,16,.55),rgba(5,11,16,0) 20%),linear-gradient(90deg,rgba(5,11,16,.5),rgba(5,11,16,0) 32%)" }} />

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 flex items-center gap-2.5 border-b border-aurora-border bg-aurora-midnight/70 p-3 backdrop-blur-xl sm:gap-3">
        <button onClick={onClose} aria-label="Close map" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-aurora-border bg-white/[0.07] text-aurora-ink">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="mr-1 hidden min-w-0 sm:block">
          <p className="truncate font-drift-display text-[18px] leading-none">{dest.label}</p>
          <p className="mt-1 text-[11.5px] text-aurora-ink2">{dest.dateRange}</p>
        </div>
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-aurora-border bg-white/[0.07] px-3.5" style={{ height: 38, maxWidth: 420 }}>
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-aurora-ink3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search a place in ${dest.label}…`}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-aurora-ink outline-none placeholder:text-aurora-ink3"
          />
          {query && (
            <button onClick={() => { setQuery(""); setResults([]) }} aria-label="Clear" className="shrink-0 text-aurora-ink3">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          )}
        </label>
      </div>

      {/* Day chips */}
      <div className="absolute left-3 top-[64px] flex max-w-[calc(100%-24px)] gap-2 overflow-x-auto pb-1">
        <Chip on={activeDay === "all"} onClick={() => { setActiveDay("all"); setSelected(null) }}>All days</Chip>
        {days.map((d) => (
          <Chip key={d.dayNumber} on={activeDay === d.dayNumber} onClick={() => { setActiveDay(d.dayNumber); setSelected(null) }}>
            Day {d.dayNumber}
          </Chip>
        ))}
      </div>

      {/* Left rail — the day's stops (desktop) */}
      {activeDay !== "all" && targetDay && (
        <aside className="absolute left-3 top-[110px] hidden w-[300px] overflow-auto rounded-2xl border border-aurora-border bg-aurora-midnight/70 p-3.5 backdrop-blur-xl lg:block" style={{ maxHeight: "calc(100% - 130px)" }}>
          <h3 className="mb-3 px-1 font-drift-display text-[17px]">
            Day {targetDay.dayNumber} <span className="text-[12px] font-normal text-aurora-ink3">· {targetDay.label}</span>
          </h3>
          {targetDay.points.length === 0 ? (
            <p className="px-1 text-[13px] text-aurora-ink3">No mapped stops yet — search to add one.</p>
          ) : (
            <div className="space-y-0.5">
              {targetDay.points.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setSelected({ kind: "stop", point: p }); mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom: 15, duration: 500 }) }}
                  className={`flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-white/[0.05] ${selected?.kind === "stop" && selected.point.id === p.id ? "bg-aurora-teal/10 ring-1 ring-aurora-teal/40" : ""}`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-aurora-teal text-[12px] font-bold text-aurora-teal-ink">{p.n}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-aurora-ink">{p.label}</span>
                    {p.time && <span className="block text-[11.5px] text-aurora-ink3">{p.time}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>
      )}

      {/* Search results list (Phase 2) */}
      {query.trim().length >= 2 && (
        <div className="absolute right-3 top-[110px] w-[300px] max-w-[calc(100%-24px)] overflow-auto rounded-2xl border border-aurora-border bg-aurora-midnight/80 p-2 backdrop-blur-xl" style={{ maxHeight: "min(50%, 360px)" }}>
          {searching && results.length === 0 ? (
            <p className="px-2 py-3 text-[13px] text-aurora-ink3">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-2 py-3 text-[13px] text-aurora-ink3">No places found.</p>
          ) : (
            results.map((c) => (
              <button
                key={c.id}
                onClick={() => { setSelected({ kind: "search", cand: c }); if (c.latitude != null && c.longitude != null) mapRef.current?.flyTo({ center: [c.longitude, c.latitude], zoom: 15, duration: 500 }) }}
                className="flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition-colors hover:bg-white/[0.05]"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-aurora-indigo text-[14px] font-bold text-white">+</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-aurora-ink">{c.name}</span>
                  {c.address && <span className="block truncate text-[11.5px] text-aurora-ink3">{c.address}</span>}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Place card */}
      {selected && (
        <div className="absolute bottom-4 left-1/2 w-[min(420px,calc(100%-24px))] -translate-x-1/2 rounded-2xl border border-aurora-border bg-aurora-midnight/85 p-3.5 backdrop-blur-xl lg:left-auto lg:right-4 lg:translate-x-0">
          <PlaceCard
            selected={selected}
            targetDayNumber={targetDay?.dayNumber ?? null}
            adding={adding}
            onAdd={() => selected.kind === "search" && addSearchPlace(selected.cand)}
            onClose={() => setSelected(null)}
          />
        </div>
      )}

      {toast && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-aurora-teal px-4 py-2 text-[13px] font-semibold text-aurora-teal-ink shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium backdrop-blur-xl transition-colors ${
        on ? "border-transparent bg-aurora-teal text-aurora-teal-ink" : "border-aurora-border bg-aurora-midnight/70 text-aurora-ink2"
      }`}
    >
      {children}
    </button>
  )
}

function PlaceCard({
  selected,
  targetDayNumber,
  adding,
  onAdd,
  onClose,
}: {
  selected: NonNullable<Selected>
  targetDayNumber: number | null
  adding: boolean
  onAdd: () => void
  onClose: () => void
}) {
  const isSearch = selected.kind === "search"
  const name = isSearch ? selected.cand.name : selected.point.label
  const lat = isSearch ? selected.cand.latitude : selected.point.lat
  const lng = isSearch ? selected.cand.longitude : selected.point.lng
  const photo = isSearch ? placePhotoUrl(selected.cand, 128) : null
  const meta = isSearch
    ? [
        selected.cand.rating != null ? `★ ${selected.cand.rating}` : null,
        selected.cand.primaryType ? humanize(selected.cand.primaryType) : null,
        selected.cand.address,
      ]
        .filter(Boolean)
        .join(" · ")
    : selected.point.time
      ? `Day stop · ${selected.point.time}`
      : "Day stop"
  const mapsHref =
    lat != null && lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}%20${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`

  return (
    <div>
      <div className="flex gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl" style={{ background: "linear-gradient(135deg,#37D6C4,#6B5CFF)" }}>
          {photo && <img src={photo} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15.5px] font-semibold text-aurora-ink">{name}</p>
          {meta && <p className="mt-0.5 line-clamp-2 text-[12px] text-aurora-ink2">{meta}</p>}
        </div>
        <button onClick={onClose} aria-label="Dismiss" className="-mr-1 -mt-1 h-7 w-7 shrink-0 text-aurora-ink3">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        {isSearch ? (
          <button onClick={onAdd} disabled={adding || targetDayNumber == null} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-aurora-teal text-[13.5px] font-semibold text-aurora-teal-ink disabled:opacity-60">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            {adding ? "Adding…" : targetDayNumber != null ? `Add to Day ${targetDayNumber}` : "Add"}
          </button>
        ) : null}
        <a href={mapsHref} target="_blank" rel="noreferrer" className={`flex h-10 items-center justify-center gap-1.5 rounded-xl border border-aurora-border bg-white/[0.06] px-4 text-[13.5px] font-medium text-aurora-ink ${isSearch ? "" : "flex-1"}`}>
          Open in Maps
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M8 7h9v9" /></svg>
        </a>
      </div>
    </div>
  )
}

function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}
