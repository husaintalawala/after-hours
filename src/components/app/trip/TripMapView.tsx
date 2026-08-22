"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { createClient } from "@/lib/supabase/client"
import { resolvePlaceCandidates, placePhotoUrl, type PlaceCandidate } from "@/lib/drift/chat"
import { applyCreateStep, applyRemoveStep, type CreateStepOp } from "@/lib/drift/quickOp"
import { AnalyticsEvent, capture } from "@/lib/analytics"
import type { DestinationVM, StepDetailVM } from "./TripTabs"

// Full-screen trip Map — the day mini-map expanded.
//  Phase 1: day-filter chips, the day's ordered stops as numbered pins + a
//    glowing teal→indigo route, a left rail, tap a pin → place card.
//  Phase 2: search a place → drop pin → add it to a day (quick-op write path).
//  Phase 3: in-app directions — walk/drive draw the real road-following route
//    (Mapbox Directions) with a total + per-leg ETAs; transit hands off to
//    Google Maps (Mapbox has no transit routing). Drag the rail to reorder
//    stops — the route + ETAs recompute live.
// Aurora dark, single-theme by design (a map surface).

type MapPoint = { id: string; stepId: string | null; lat: number; lng: number; label: string; n: number; time: string | null; timeMin: number | null }
type MapDay = { dayNumber: number; date: string; label: string; points: MapPoint[] }
type Selected = { kind: "stop"; point: MapPoint } | { kind: "search"; cand: PlaceCandidate } | null
type Mode = "walking" | "transit" | "driving"
type LineStringGeom = { type: "LineString"; coordinates: number[][] }
type Dir = { geometry: LineStringGeom; totalMin: number; totalKm: number; legs: { min: number; km: number }[] }

const TEAL = "#37D6C4"
const INDIGO = "#6B5CFF"
const MODES: { id: Mode; label: string; profile: "walking" | "driving" | null }[] = [
  { id: "walking", label: "Walk", profile: "walking" },
  { id: "transit", label: "Transit", profile: null },
  { id: "driving", label: "Drive", profile: "driving" },
]

function fmtDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return date
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
}
function fmtTime(min: number | null): string | null {
  if (min == null) return null
  const h = Math.floor(min / 60), m = min % 60
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`
}
function fmtDur(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  return m ? `${h}h ${m}m` : `${h}h`
}
function fmtKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

async function fetchDirections(profile: "walking" | "driving", pts: MapPoint[], token: string): Promise<Dir | null> {
  if (pts.length < 2) return null
  const coords = pts.map((p) => `${p.lng},${p.lat}`).join(";")
  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coords}?geometries=geojson&overview=full&access_token=${token}`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const j = await res.json()
    const r = j.routes?.[0]
    if (!r?.geometry) return null
    return {
      geometry: r.geometry as LineStringGeom,
      totalMin: Math.round(r.duration / 60),
      totalKm: r.distance / 1000,
      legs: (r.legs ?? []).map((l: { duration: number; distance: number }) => ({ min: Math.round(l.duration / 60), km: l.distance / 1000 })),
    }
  } catch {
    return null
  }
}

function googleTransitUrl(pts: MapPoint[]): string {
  const o = pts[0], d = pts[pts.length - 1]
  const u = new URLSearchParams({ api: "1", travelmode: "transit", origin: `${o.lat},${o.lng}`, destination: `${d.lat},${d.lng}` })
  const mids = pts.slice(1, -1).map((p) => `${p.lat},${p.lng}`).join("|")
  if (mids) u.set("waypoints", mids)
  return `https://www.google.com/maps/dir/?${u.toString()}`
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
  const dirCache = useRef<Map<string, Dir | null>>(new Map())

  const [activeDay, setActiveDay] = useState<number | "all">(initialDay)
  const [selected, setSelected] = useState<Selected>(null)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PlaceCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>("walking")
  const [dir, setDir] = useState<Dir | null>(null)
  const [dirBusy, setDirBusy] = useState(false)
  // Optimistic reorder per day (dayNumber → ordered point ids). Cleared when the
  // server order changes (after router.refresh), mirroring DaySection.
  const [orderOverride, setOrderOverride] = useState<Record<number, string[]>>({})
  // Optimistically-removed point ids; cleared once the server order changes.
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

  // Server-derived days (coord-bearing stops per day, numbered in order).
  const serverDays: MapDay[] = useMemo(
    () =>
      dest.days.map((d) => {
        const points: MapPoint[] = []
        d.items.forEach((it) => {
          const s = it.linkedStepId ? stepDetails[it.linkedStepId] : null
          const lat = s?.lat ?? it.latitude
          const lng = s?.lng ?? it.longitude
          if (lat != null && lng != null) {
            points.push({ id: it.id, stepId: it.linkedStepId, lat, lng, label: it.title, n: points.length + 1, time: fmtTime(it.startTimeMinutes), timeMin: it.startTimeMinutes })
          }
        })
        return { dayNumber: d.dayNumber, date: d.date, label: fmtDay(d.date), points }
      }),
    [dest, stepDetails]
  )
  const serverSig = useMemo(() => serverDays.map((d) => `${d.dayNumber}:${d.points.map((p) => p.id).join(",")}`).join("|"), [serverDays])
  useEffect(() => { setOrderOverride({}); setRemovedIds(new Set()) }, [serverSig])

  // Apply optimistic remove + reorder, then renumber.
  const orderedFor = useCallback(
    (d: MapDay): MapPoint[] => {
      const ov = orderOverride[d.dayNumber]
      const kept = d.points.filter((p) => !removedIds.has(p.id))
      const src = ov ? [...kept].sort((a, b) => ov.indexOf(a.id) - ov.indexOf(b.id)) : kept
      return src.map((p, i) => ({ ...p, n: i + 1 }))
    },
    [orderOverride, removedIds]
  )

  const days = useMemo(() => serverDays.map((d) => ({ ...d, points: orderedFor(d) })), [serverDays, orderedFor])
  const visible: MapPoint[] = useMemo(() => {
    if (activeDay === "all") return days.flatMap((d) => d.points).map((p, i) => ({ ...p, n: i + 1 }))
    return days.find((d) => d.dayNumber === activeDay)?.points ?? []
  }, [days, activeDay])
  const targetDay = useMemo(() => (activeDay === "all" ? days[0] : days.find((d) => d.dayNumber === activeDay)) ?? days[0] ?? null, [days, activeDay])

  useEffect(() => {
    if (open) { setActiveDay(initialDay); setSelected(null); setQuery(""); setResults([]); setMode("walking") }
  }, [open, initialDay])
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(t)
  }, [toast])

  // ---- Directions (Phase 3): fetch for the visible order + native mode ----
  const dirKey = useMemo(() => `${mode}|${visible.map((p) => p.id).join(",")}`, [mode, visible])
  useEffect(() => {
    const profile = MODES.find((m) => m.id === mode)?.profile
    if (!open || !token || !profile || visible.length < 2) { setDir(null); return }
    if (dirCache.current.has(dirKey)) { setDir(dirCache.current.get(dirKey) ?? null); return }
    let cancelled = false
    setDirBusy(true)
    fetchDirections(profile, visible, token).then((d) => {
      if (cancelled) return
      dirCache.current.set(dirKey, d)
      setDir(d)
      setDirBusy(false)
    })
    return () => { cancelled = true }
  }, [dirKey, open, token, mode, visible])

  // ---- Map lifecycle ----
  useEffect(() => {
    if (!open || !token || !containerRef.current || mapRef.current) return
    mapboxgl.accessToken = token
    const first = visible[0] ?? (dest.lat != null && dest.lng != null ? { lng: dest.lng, lat: dest.lat } : null)
    const map = new mapboxgl.Map({
      container: containerRef.current,
      // dark-v11 is the style proven to render in this mapbox-gl version (it's
      // what DiscoverMap uses); navigation-night-v1 was coming up blank.
      style: "mapbox://styles/mapbox/dark-v11",
      center: first ? [first.lng, first.lat] : [2.1734, 41.3851],
      zoom: 12,
      attributionControl: false,
    })
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right")
    map.on("error", (e) => console.warn("[TripMapView] map error:", e.error?.message ?? e))
    map.on("load", () => {
      styleReadyRef.current = true
      // The map is created inside a fixed overlay that may not have finished
      // layout yet — resize so the GL canvas matches the full container.
      map.resize()
      const logo = containerRef.current?.querySelector(".mapboxgl-ctrl-logo") as HTMLElement | null
      if (logo) logo.style.display = "none"
      draw()
    })
    // Belt-and-suspenders: resize again once the overlay has painted.
    requestAnimationFrame(() => map.resize())
    // Keep the GL canvas matched to the container as the overlay settles/animates
    // (a fixed overlay can report a stale height at creation time).
    const ro = new ResizeObserver(() => map.resize())
    if (containerRef.current) ro.observe(containerRef.current)
    mapRef.current = map
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; styleReadyRef.current = false; markersRef.current = [] }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => { draw() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [visible, results, dir, mode, open])

  function draw() {
    const map = mapRef.current
    if (!map || !styleReadyRef.current) return

    // Route line: real road geometry when walk/drive directions loaded, else a
    // straight line through the stops (transit fallback, or before dir loads).
    const lineGeom: LineStringGeom | null =
      mode !== "transit" && dir?.geometry
        ? dir.geometry
        : visible.length > 1
          ? { type: "LineString", coordinates: visible.map((p) => [p.lng, p.lat]) }
          : null
    const fc = { type: "FeatureCollection" as const, features: lineGeom ? [{ type: "Feature" as const, properties: {}, geometry: lineGeom }] : [] }
    const src = map.getSource("route") as mapboxgl.GeoJSONSource | undefined
    if (src) src.setData(fc)
    else {
      map.addSource("route", { type: "geojson", data: fc })
      map.addLayer({ id: "route-glow", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": TEAL, "line-width": 9, "line-blur": 5, "line-opacity": 0.4 } })
      map.addLayer({ id: "route-core", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": INDIGO, "line-width": 3.5, "line-opacity": 0.95 } })
    }

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
      el.addEventListener("click", (e) => { e.stopPropagation(); setSelected({ kind: "stop", point: p }) })
      markersRef.current.push(new mapboxgl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map))
      bounds.extend([p.lng, p.lat])
    }
    for (const c of results) {
      if (c.latitude == null || c.longitude == null) continue
      const el = document.createElement("div")
      el.textContent = "+"
      el.style.cssText =
        "display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;" +
        "background:#6B5CFF;color:#fff;font-weight:700;font-size:16px;border:2px solid #fff;cursor:pointer;box-shadow:0 0 12px 2px rgba(107,92,255,.55)"
      el.addEventListener("click", (e) => { e.stopPropagation(); setSelected({ kind: "search", cand: c }) })
      markersRef.current.push(new mapboxgl.Marker({ element: el }).setLngLat([c.longitude, c.latitude]).addTo(map))
      bounds.extend([c.longitude, c.latitude])
    }
    if (!bounds.isEmpty()) {
      const cw = map.getContainer().clientWidth || 800
      const ch = map.getContainer().clientHeight || 600
      // Cap padding to a fraction of the canvas so fitBounds can always fit
      // (avoids the "cannot fit within canvas" no-op that left the map unposed).
      const pad = {
        top: Math.min(120, ch * 0.18),
        bottom: Math.min(150, ch * 0.22),
        left: Math.min(330, cw * 0.34),
        right: Math.min(60, cw * 0.1),
      }
      if (visible.length + results.length === 1) {
        map.easeTo({ center: bounds.getCenter(), zoom: 14, duration: 500 })
      } else {
        map.fitBounds(bounds, { padding: pad, maxZoom: 15, duration: 500 })
      }
    }
  }

  // ---- Search (Phase 2) ----
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); setSearching(false); return }
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
    const op: CreateStepOp = { op: "create_step", type: "spot", title: cand.name, destination_ref: dest.label, date: targetDay.date }
    try {
      await applyCreateStep(tripId, op, { name: cand.name, lat: cand.latitude, lng: cand.longitude, place_id: placeId })
      capture(AnalyticsEvent.AddToItinerary, { source: "trip_map" })
      setToast(`Added ${cand.name} to Day ${targetDay.dayNumber}`)
      setSelected(null); setQuery(""); setResults([])
      router.refresh()
    } catch {
      setToast("Couldn't add — try again.")
    } finally {
      setAdding(false)
    }
  }

  // ---- Delete a stop (inline, per row) ----
  async function deleteStop(p: MapPoint) {
    if (!p.stepId) return
    setRemovedIds((prev) => new Set(prev).add(p.id))   // optimistic
    if (selected?.kind === "stop" && selected.point.id === p.id) setSelected(null)
    try {
      await applyRemoveStep(tripId, p.stepId)
      router.refresh()
    } catch {
      setRemovedIds((prev) => { const n = new Set(prev); n.delete(p.id); return n })
      setToast("Couldn't remove — try again.")
    }
  }

  // ---- Drag reorder (Phase 3) ----
  const dragId = useRef<string | null>(null)
  function reorder(fromId: string, toId: string) {
    if (activeDay === "all" || !targetDay || fromId === toId) return
    const ids = targetDay.points.map((p) => p.id)
    const from = ids.indexOf(fromId), to = ids.indexOf(toId)
    if (from < 0 || to < 0) return
    ids.splice(to, 0, ids.splice(from, 1)[0])
    setOrderOverride((prev) => ({ ...prev, [targetDay.dayNumber]: ids })) // optimistic
    const stepIds = ids.map((id) => targetDay.points.find((p) => p.id === id)?.stepId).filter(Boolean) as string[]
    void (async () => {
      try {
        const supabase = createClient()
        await Promise.all(stepIds.map((id, idx) =>
          supabase.from("steps").update({ display_order: idx * 10 }).eq("id", id)))
      } catch { /* router.refresh restores server order */ } finally { router.refresh() }
    })()
  }

  if (!open) return null

  const timesOutOfOrder = (() => {
    const mins = (targetDay?.points ?? []).map((p) => p.timeMin).filter((m): m is number => m != null)
    return mins.some((m, i) => i > 0 && m < mins[i - 1])
  })()
  const activeMode = MODES.find((m) => m.id === mode)!
  const totalLabel = mode === "transit"
    ? "Transit via Google Maps"
    : dirBusy
      ? "Routing…"
      : dir
        ? `${fmtDur(dir.totalMin)} · ${fmtKm(dir.totalKm)}`
        : visible.length > 1 ? "—" : ""

  return (
    <div className="fixed inset-0 z-[100] bg-aurora-midnight font-drift-body text-aurora-ink">
      <div ref={containerRef} className="h-full w-full" />
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
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search a place in ${dest.label}…`} className="min-w-0 flex-1 bg-transparent text-[14px] text-aurora-ink outline-none placeholder:text-aurora-ink3" />
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
          <Chip key={d.dayNumber} on={activeDay === d.dayNumber} onClick={() => { setActiveDay(d.dayNumber); setSelected(null) }}>Day {d.dayNumber}</Chip>
        ))}
      </div>

      {/* Left rail — day stops, mode + ETAs, drag to reorder (desktop) */}
      {activeDay !== "all" && targetDay && (
        <aside className="absolute left-3 top-[110px] hidden w-[300px] overflow-auto rounded-2xl border border-aurora-border bg-aurora-midnight/70 p-3.5 backdrop-blur-xl lg:block" style={{ maxHeight: "calc(100% - 130px)" }}>
          <h3 className="mb-2.5 px-1 font-drift-display text-[17px]">Day {targetDay.dayNumber} <span className="text-[12px] font-normal text-aurora-ink3">· {targetDay.label}</span></h3>
          {timesOutOfOrder && (
            <div className="mb-2.5 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold" style={{ color: "#E7A24B", background: "rgba(231,162,75,0.15)" }}>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
              Times out of order
            </div>
          )}
          <ModeToggle mode={mode} setMode={setMode} />
          <p className="mb-2 mt-2 px-1 text-[12px] text-aurora-ink2">
            {activeMode.label}: <span className="font-semibold text-aurora-ink">{totalLabel}</span>
            {mode === "transit" && visible.length > 1 && (
              <> · <a className="font-semibold text-aurora-teal" href={googleTransitUrl(visible)} target="_blank" rel="noreferrer">open ↗</a></>
            )}
          </p>
          {targetDay.points.length === 0 ? (
            <p className="px-1 text-[13px] text-aurora-ink3">No mapped stops yet — search to add one.</p>
          ) : (
            <div>
              {targetDay.points.map((p, i) => (
                <div key={p.id}>
                  <div
                    draggable
                    onDragStart={() => { dragId.current = p.id }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { if (dragId.current) reorder(dragId.current, p.id); dragId.current = null }}
                    onClick={() => { setSelected({ kind: "stop", point: p }); mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom: 15, duration: 500 }) }}
                    className={`group flex cursor-grab items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-white/[0.05] active:cursor-grabbing ${selected?.kind === "stop" && selected.point.id === p.id ? "bg-aurora-teal/10 ring-1 ring-aurora-teal/40" : ""}`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-aurora-teal text-[12px] font-bold text-aurora-teal-ink">{p.n}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-aurora-ink">{p.label}</span>
                      {p.time && <span className="block text-[11.5px] text-aurora-ink3">{p.time}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {p.stepId && (
                        <button
                          onClick={(e) => { e.stopPropagation(); void deleteStop(p) }}
                          aria-label={`Remove ${p.label}`}
                          className="flex h-6 w-6 items-center justify-center rounded-full text-aurora-ink3 opacity-0 transition-opacity hover:bg-white/10 hover:text-red-300 group-hover:opacity-100"
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>
                        </button>
                      )}
                      <span className="text-aurora-ink3" aria-hidden>⠿</span>
                    </span>
                  </div>
                  {i < targetDay.points.length - 1 && (
                    <div className="ml-[22px] flex items-center gap-2 border-l-2 border-dashed border-white/15 py-1 pl-3.5 text-[11px] text-aurora-ink3">
                      {mode === "transit" ? "transit leg" : dir?.legs[i] ? `${fmtDur(dir.legs[i].min)} · ${fmtKm(dir.legs[i].km)}` : dirBusy ? "…" : `by ${activeMode.label.toLowerCase()}`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      )}

      {/* Mobile: compact mode toggle (when no place card is up) */}
      {activeDay !== "all" && !selected && visible.length > 1 && (
        <div className="absolute bottom-4 left-3 rounded-full border border-aurora-border bg-aurora-midnight/80 p-1 backdrop-blur-xl lg:hidden">
          <ModeToggle mode={mode} setMode={setMode} compact />
        </div>
      )}

      {/* Search results */}
      {query.trim().length >= 2 && (
        <div className="absolute right-3 top-[110px] w-[300px] max-w-[calc(100%-24px)] overflow-auto rounded-2xl border border-aurora-border bg-aurora-midnight/80 p-2 backdrop-blur-xl" style={{ maxHeight: "min(50%, 360px)" }}>
          {searching && results.length === 0 ? (
            <p className="px-2 py-3 text-[13px] text-aurora-ink3">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-2 py-3 text-[13px] text-aurora-ink3">No places found.</p>
          ) : (
            results.map((c) => (
              <button key={c.id} onClick={() => { setSelected({ kind: "search", cand: c }); if (c.latitude != null && c.longitude != null) mapRef.current?.flyTo({ center: [c.longitude, c.latitude], zoom: 15, duration: 500 }) }} className="flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition-colors hover:bg-white/[0.05]">
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
          <PlaceCard selected={selected} targetDayNumber={targetDay?.dayNumber ?? null} adding={adding} onAdd={() => selected.kind === "search" && addSearchPlace(selected.cand)} onClose={() => setSelected(null)} />
        </div>
      )}

      {toast && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-aurora-teal px-4 py-2 text-[13px] font-semibold text-aurora-teal-ink shadow-lg">{toast}</div>}
    </div>
  )
}

function ModeToggle({ mode, setMode, compact }: { mode: Mode; setMode: (m: Mode) => void; compact?: boolean }) {
  return (
    <div className={`flex gap-1 rounded-full ${compact ? "" : "bg-white/[0.06] p-1"}`}>
      {MODES.map((m) => (
        <button key={m.id} onClick={() => setMode(m.id)} className={`flex h-8 items-center justify-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold transition-colors ${mode === m.id ? "bg-aurora-indigo text-white" : "text-aurora-ink2 hover:text-aurora-ink"}`} aria-pressed={mode === m.id}>
          <ModeIcon id={m.id} />
          {m.label}
        </button>
      ))}
    </div>
  )
}

function ModeIcon({ id }: { id: Mode }) {
  const p =
    id === "walking" ? "M13 4a1 1 0 100 2 1 1 0 000-2zM9 20l2-5 3 2 1 3M11 15l-1-4 3-1 3 3"
    : id === "driving" ? "M5 13l1.5-5h11L19 13M5 13h14v4H5zM7 17v2M17 17v2"
    : "M5 4h14v12H5zM5 11h14M9 20l2-3M15 20l-2-3"
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d={p} /></svg>
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium backdrop-blur-xl transition-colors ${on ? "border-transparent bg-aurora-teal text-aurora-teal-ink" : "border-aurora-border bg-aurora-midnight/70 text-aurora-ink2"}`}>{children}</button>
  )
}

function PlaceCard({ selected, targetDayNumber, adding, onAdd, onClose }: { selected: NonNullable<Selected>; targetDayNumber: number | null; adding: boolean; onAdd: () => void; onClose: () => void }) {
  const isSearch = selected.kind === "search"
  const name = isSearch ? selected.cand.name : selected.point.label
  const lat = isSearch ? selected.cand.latitude : selected.point.lat
  const lng = isSearch ? selected.cand.longitude : selected.point.lng
  const photo = isSearch ? placePhotoUrl(selected.cand, 128) : null
  const meta = isSearch
    ? [selected.cand.rating != null ? `★ ${selected.cand.rating}` : null, selected.cand.primaryType ? humanize(selected.cand.primaryType) : null, selected.cand.address].filter(Boolean).join(" · ")
    : selected.point.time ? `Day stop · ${selected.point.time}` : "Day stop"
  const mapsHref = lat != null && lng != null
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
        {isSearch && (
          <button onClick={onAdd} disabled={adding || targetDayNumber == null} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-aurora-teal text-[13.5px] font-semibold text-aurora-teal-ink disabled:opacity-60">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            {adding ? "Adding…" : targetDayNumber != null ? `Add to Day ${targetDayNumber}` : "Add"}
          </button>
        )}
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
