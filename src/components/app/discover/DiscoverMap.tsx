"use client"

import { useEffect, useRef } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import type { DiscoverAnchor, DiscoverResult } from "@/lib/drift/discover"

// ---- 2D results map ----

export default function DiscoverMap({
  anchor,
  results,
  hoveredId,
}: {
  anchor: DiscoverAnchor | null
  results: DiscoverResult[]
  hoveredId: string | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())

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
    mapRef.current = map
    return () => {
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
        "width:14px;height:14px;border-radius:50%;background:#E0563B;border:2.5px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35)"
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([r.lng, r.lat])
        .setPopup(new mapboxgl.Popup({ offset: 12, closeButton: false }).setText(r.name))
        .addTo(map)
      markersRef.current.set(r.id, marker)
      bounds.extend([r.lng, r.lat])
      any = true
    }
    if (any) map.fitBounds(bounds, { padding: 70, maxZoom: 14, duration: 800 })
    else if (anchor?.lat != null && anchor?.lng != null)
      map.flyTo({ center: [anchor.lng, anchor.lat], zoom: 11 })
  }, [results, anchor])

  // Hovered card → pop its marker.
  useEffect(() => {
    markersRef.current.forEach((m) => m.getPopup()?.remove())
    if (hoveredId) {
      const m = markersRef.current.get(hoveredId)
      if (m && mapRef.current) m.togglePopup()
    }
  }, [hoveredId])

  return <div ref={containerRef} className="h-full w-full" />
}
