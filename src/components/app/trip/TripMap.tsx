"use client"

import { useEffect, useRef } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"

// Interactive day/trip map (web port of the iOS DayMap peek) — numbered teal
// pins for the day's stops in order, joined by a dashed route line, on the dark
// Aurora Mapbox style. Non-blocking: renders nothing without a token or points.

export type TripMapPoint = { id: string; lat: number; lng: number; label: string; n: number }

export default function TripMap({
  points,
  className,
}: {
  points: TripMapPoint[]
  className?: string
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

      // Dashed teal route line through the ordered stops.
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
          id: "route",
          type: "line",
          source: "route",
          paint: { "line-color": "#37D6C4", "line-width": 2.5, "line-opacity": 0.55, "line-dasharray": [1, 1.6] },
        })
      }

      const bounds = new mapboxgl.LngLatBounds()
      for (const p of points) {
        const el = document.createElement("div")
        el.textContent = String(p.n)
        el.style.cssText =
          "display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;" +
          "background:#37D6C4;color:#04231F;font-weight:700;font-size:12px;border:2px solid #fff;" +
          "box-shadow:0 1px 6px rgba(0,0,0,.4);cursor:pointer"
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
    <div
      ref={containerRef}
      className={className ?? "h-[210px] w-full overflow-hidden rounded-card border border-aurora-border"}
    />
  )
}
