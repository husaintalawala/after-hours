"use client"

import { useEffect, useRef, useState } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import type { DiscoverAnchor, DiscoverResult } from "@/lib/drift/discover"

// ---- 2D results map ----

// Great-circle distance in km — used to size the "search this area" radius from
// the visible map span (center → NE corner).
function distanceKm(a: mapboxgl.LngLat, b: mapboxgl.LngLat): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

export default function DiscoverMap({
  anchor,
  results,
  hoveredId,
  onSearchArea,
}: {
  anchor: DiscoverAnchor | null
  results: DiscoverResult[]
  hoveredId: string | null
  onSearchArea?: (c: { lat: number; lng: number; radiusKm: number }) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())
  // Set true right before a fitBounds/flyTo so the resulting 'moveend' isn't
  // mistaken for a user pan (which is what surfaces the "search this area" pill).
  const programmaticRef = useRef(false)
  const pillTimerRef = useRef<number | null>(null)
  const [showSearchHere, setShowSearchHere] = useState(false)

  // Mark the next camera animation as programmatic. A timeout backup clears the
  // flag in case the target ≈ current position and Mapbox emits no 'moveend'.
  function beginProgrammatic() {
    programmaticRef.current = true
    if (pillTimerRef.current) window.clearTimeout(pillTimerRef.current)
    window.setTimeout(() => {
      programmaticRef.current = false
    }, 1000)
  }

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token || !containerRef.current) return
    mapboxgl.accessToken = token
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: anchor ? [anchor.lng ?? 0, anchor.lat ?? 20] : [0, 20],
      zoom: anchor ? 11 : 1.5,
      attributionControl: false,
    })
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right")
    const logo = containerRef.current.querySelector(".mapboxgl-ctrl-logo") as HTMLElement | null
    if (logo) logo.style.display = "none"
    // Surface the "search this area" pill after the user finishes panning/zooming
    // (debounced), but never for our own fitBounds/flyTo camera moves.
    map.on("movestart", () => {
      if (pillTimerRef.current) window.clearTimeout(pillTimerRef.current)
    })
    map.on("moveend", () => {
      if (programmaticRef.current) {
        programmaticRef.current = false
        return
      }
      if (pillTimerRef.current) window.clearTimeout(pillTimerRef.current)
      pillTimerRef.current = window.setTimeout(() => setShowSearchHere(true), 300)
    })
    mapRef.current = map
    return () => {
      if (pillTimerRef.current) window.clearTimeout(pillTimerRef.current)
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Markers follow results.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markersRef.current.forEach((m) => m.remove())
    markersRef.current.clear()
    const bounds = new mapboxgl.LngLatBounds()
    let any = false
    for (const r of results) {
      if (r.lat == null || r.lng == null) continue
      const el = document.createElement("div")
      el.style.cssText =
        "width:14px;height:14px;border-radius:50%;background:#37D6C4;border:2.5px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35)"
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([r.lng, r.lat])
        .setPopup(new mapboxgl.Popup({ offset: 12, closeButton: false }).setText(r.name))
        .addTo(map)
      markersRef.current.set(r.id, marker)
      bounds.extend([r.lng, r.lat])
      any = true
    }
    if (any) {
      beginProgrammatic()
      map.fitBounds(bounds, { padding: 70, maxZoom: 14, duration: 800 })
    } else if (anchor?.lat != null && anchor?.lng != null) {
      beginProgrammatic()
      map.flyTo({ center: [anchor.lng, anchor.lat], zoom: 11, duration: 800 })
    }
  }, [results, anchor])

  // Hovered card → pop its marker.
  useEffect(() => {
    markersRef.current.forEach((m) => m.getPopup()?.remove())
    if (hoveredId) {
      const m = markersRef.current.get(hoveredId)
      if (m && mapRef.current) m.togglePopup()
    }
  }, [hoveredId])

  function handleSearchHere() {
    const map = mapRef.current
    if (!map || !onSearchArea) return
    const center = map.getCenter()
    const bounds = map.getBounds()
    const radiusKm = bounds ? distanceKm(center, bounds.getNorthEast()) : 25
    setShowSearchHere(false)
    onSearchArea({ lat: center.lat, lng: center.lng, radiusKm })
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {showSearchHere && onSearchArea && (
        <button
          onClick={handleSearchHere}
          className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-aurora-border bg-drift-coral px-4 py-2 text-[13px] font-semibold text-white shadow-[0_10px_30px_-10px_rgba(0,0,0,0.65)] transition-transform hover:-translate-y-0.5 hover:-translate-x-1/2"
        >
          Search this area
        </button>
      )}
    </div>
  )
}
