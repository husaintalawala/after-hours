"use client"

import { useEffect, useRef } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"

// Interactive day/trip map (web port of the iOS DayMap peek) — glowing teal
// pins for the day's stops in order, joined by a glowing teal→indigo route line,
// on the legible navigation-night basemap. Non-blocking: renders nothing without
// a token or points. Kept in sync with the iOS DayPeekMap styling.

export type TripMapPoint = { id: string; lat: number; lng: number; label: string; n: number }

export default function TripMap({
  points,
  className,
  wrapperClassName,
  onExpand,
}: {
  points: TripMapPoint[]
  className?: string
  wrapperClassName?: string
  onExpand?: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token || !containerRef.current || points.length === 0) return
    mapboxgl.accessToken = token
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [points[0].lng, points[0].lat],
      zoom: 12,
      attributionControl: false,
    })
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right")

    map.on("load", () => {
      const logo = containerRef.current?.querySelector(".mapboxgl-ctrl-logo") as HTMLElement | null
      if (logo) logo.style.display = "none"

      // The day's route through the ordered stops as a glowing line — the
      // spotlight upgrade over scattered dots. A wide, blurred teal halo sits
      // under a crisp indigo core (Aurora two-tone), mirroring the iOS day map.
      if (points.length > 1) {
        map.addSource("route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: points.map((p) => [p.lng, p.lat]) },
          },
        })
        map.addLayer({
          id: "route-glow",
          type: "line",
          source: "route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#37D6C4", "line-width": 9, "line-blur": 5, "line-opacity": 0.4 },
        })
        map.addLayer({
          id: "route",
          type: "line",
          source: "route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#6B5CFF", "line-width": 3.5, "line-opacity": 0.95 },
        })
      }

      const bounds = new mapboxgl.LngLatBounds()
      for (const p of points) {
        const el = document.createElement("div")
        el.textContent = String(p.n)
        el.style.cssText =
          "display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;" +
          "background:#37D6C4;color:#04231F;font-weight:700;font-size:12px;border:2px solid #fff;" +
          "box-shadow:0 0 0 4px rgba(55,214,196,.18),0 0 12px 2px rgba(55,214,196,.55),0 1px 6px rgba(0,0,0,.45);cursor:pointer"
        new mapboxgl.Marker({ element: el })
          .setLngLat([p.lng, p.lat])
          .setPopup(new mapboxgl.Popup({ offset: 14, closeButton: false }).setText(p.label))
          .addTo(map)
        bounds.extend([p.lng, p.lat])
      }
      if (points.length > 1) map.fitBounds(bounds, { padding: 42, maxZoom: 15, duration: 0 })
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
    // Re-init when the set of coordinates changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.map((p) => `${p.id}:${p.lat},${p.lng}`).join("|")])

  return (
    <div className={wrapperClassName ?? "relative"}>
      <div
        ref={containerRef}
        className={className ?? "h-[210px] w-full overflow-hidden rounded-card border border-aurora-border"}
      />
      {onExpand && (
        <button
          onClick={onExpand}
          aria-label="Open full map"
          className="absolute right-2.5 top-2.5 z-[1] flex items-center gap-1.5 rounded-full border border-aurora-border bg-aurora-midnight/80 px-3 py-1.5 text-[12px] font-semibold text-aurora-ink backdrop-blur-md transition-colors hover:bg-aurora-midnight"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 14v6h6M20 10V4h-6M14 10l6-6M10 14l-6 6" />
          </svg>
          Expand
        </button>
      )}
    </div>
  )
}
