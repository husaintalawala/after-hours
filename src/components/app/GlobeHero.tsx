"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"

// Web port of the iOS profile globe (SharedGlobeManager + MapboxGlobeView):
// Standard Satellite style at dusk, globe projection, slow auto-rotation that
// pauses on interaction (3s resume), circular cover-photo trip pins, and one
// colored route polyline per trip. Ornaments hidden (attribution lives on the
// About page, mirroring the iOS pattern).

export interface GlobeTripPin {
  tripId: string
  lat: number
  lng: number
  imageURL: string | null
  /** route coordinates [lng, lat][] in step order (may be empty) */
  route: [number, number][]
}

// iOS route palette equivalent — distinct saturated hues per trip.
const ROUTE_COLORS = ["#E0563B", "#F2A33C", "#4FA3D1", "#7BC47F", "#C77DD8", "#E86E8A"]

export default function GlobeHero({
  pins,
  focusTripId,
}: {
  pins: GlobeTripPin[]
  /** When set/changed, the globe flies to that trip's pin (desktop rail hover). */
  focusTripId?: string | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const pauseRef = useRef<(() => void) | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (!focusTripId || !mapRef.current) return
    const pin = pins.find((p) => p.tripId === focusTripId)
    if (!pin) return
    pauseRef.current?.()
    mapRef.current.flyTo({
      center: [pin.lng, pin.lat],
      zoom: 3.1,
      duration: 1400,
      essential: true,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTripId])

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token || !containerRef.current) return
    mapboxgl.accessToken = token

    const first = pins[0]
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/standard-satellite",
      projection: "globe",
      center: first ? [first.lng, first.lat] : [-30, 25],
      zoom: 1.35,
      attributionControl: false,
      logoPosition: "bottom-left",
    })

    map.on("style.load", () => {
      try {
        map.setConfigProperty("basemap", "lightPreset", "dusk")
      } catch {
        /* older style versions — dusk is cosmetic */
      }
      map.setFog({
        color: "rgb(10, 14, 24)",
        "high-color": "rgb(22, 32, 60)",
        "horizon-blend": 0.06,
        "space-color": "rgb(4, 4, 8)",
        "star-intensity": 0.35,
      })

      // One colored route line per trip.
      pins.forEach((pin, i) => {
        if (pin.route.length < 2) return
        const id = `route-${pin.tripId}`
        map.addSource(id, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: pin.route },
          },
        })
        map.addLayer({
          id,
          type: "line",
          source: id,
          paint: {
            "line-color": ROUTE_COLORS[i % ROUTE_COLORS.length],
            "line-width": 2,
            "line-opacity": 0.85,
          },
        })
      })
    })

    // Circular cover-photo pins (HTML markers, like the iOS TripPinHostView).
    const markers: mapboxgl.Marker[] = pins.map((pin) => {
      const el = document.createElement("button")
      el.setAttribute("aria-label", "Open trip")
      el.style.cssText =
        "width:44px;height:44px;border-radius:50%;border:2.5px solid #fff;" +
        "box-shadow:0 3px 10px rgba(0,0,0,.45);cursor:pointer;overflow:hidden;" +
        "background:#E0563B center/cover no-repeat;padding:0"
      if (pin.imageURL) el.style.backgroundImage = `url("${pin.imageURL}")`
      el.addEventListener("click", (e) => {
        e.stopPropagation()
        router.push(`/app/trips/${pin.tripId}`)
      })
      return new mapboxgl.Marker({ element: el })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map)
    })

    // Auto-rotation — iOS: +0.3°/tick @20fps, pause on interaction, resume 3s.
    let paused = false
    let resumeTimer: ReturnType<typeof setTimeout> | null = null
    const spin = setInterval(() => {
      if (!paused) map.setBearing(map.getBearing() + 0.3)
    }, 50)
    const pause = () => {
      paused = true
      if (resumeTimer) clearTimeout(resumeTimer)
      resumeTimer = setTimeout(() => (paused = false), 3000)
    }
    map.on("mousedown", pause)
    map.on("touchstart", pause)
    map.on("wheel", pause)
    mapRef.current = map
    pauseRef.current = pause

    // Hide the logo ornament (attribution is on the About page).
    const logo = containerRef.current.querySelector(
      ".mapboxgl-ctrl-logo"
    ) as HTMLElement | null
    if (logo) logo.style.display = "none"

    return () => {
      clearInterval(spin)
      if (resumeTimer) clearTimeout(resumeTimer)
      markers.forEach((m) => m.remove())
      map.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ background: "rgb(4,4,8)" }}
    />
  )
}
