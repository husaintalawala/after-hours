"use client"

import { useEffect, useRef, useState } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"

/**
 * The map half of Track's linked two-pane.
 *
 * Deliberately NOT TripMapView: that one is a full-screen modal owning its own
 * day state, search and directions. This is a passive pane — it renders the
 * route for whatever the journey list has selected and reports pin clicks back
 * up. One selection lives in the parent so the two halves can never disagree.
 *
 * ALWAYS import this with next/dynamic({ ssr: false }). mapbox-gl is ~700kB and
 * a static import pulls it into the trip page's first load for every tab.
 */

export interface TrackPoint {
  id: string
  lat: number
  lng: number
  /** 1-based position within the visible day(s) — drawn inside the pin. */
  index: number
}

export default function TrackMap({
  points,
  selectedId,
  onSelect,
  onDropPhoto,
}: {
  points: TrackPoint[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** Drag a photo onto the map to place a moment where you dropped it. */
  onDropPhoto?: (file: File, lat: number, lng: number) => void
}) {
  const [dragging, setDragging] = useState(false)
  const holder = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markers = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const ready = useRef(false)

  // ---- create once -------------------------------------------------------
  useEffect(() => {
    if (map.current || !holder.current) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) return
    mapboxgl.accessToken = token

    const m = new mapboxgl.Map({
      container: holder.current,
      // Fixed dark, like every other map in the app (DiscoverMap, TripMapView,
      // TripMap). The web app has no light theme — nothing ever stamps
      // data-theme — so reading a theme here only made the basemap follow the
      // OS preference and turn white inside a dark page.
      style: "mapbox://styles/mapbox/dark-v11",
      center: points.length ? [points[0].lng, points[0].lat] : [0, 20],
      zoom: points.length ? 11 : 1.4,
      attributionControl: false,
    })
    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right")
    m.on("load", () => {
      ready.current = true
      draw()
      fit()
    })
    map.current = m
    return () => {
      m.remove()
      map.current = null
      ready.current = false
    }
    // Style swap is handled in its own effect; points/selection redraw below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- redraw when the visible moments change ---------------------------
  useEffect(() => {
    if (!ready.current) return
    draw()
    fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(points.map((p) => p.id))])

  // ---- selection: recolour pins, ease to the chosen one -----------------
  useEffect(() => {
    for (const [id, mk] of markers.current) {
      const el = mk.getElement()
      el.dataset.selected = String(id === selectedId)
    }
    const p = points.find((x) => x.id === selectedId)
    if (p && map.current && ready.current) {
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      map.current.easeTo({ center: [p.lng, p.lat], duration: reduced ? 0 : 420 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, points.length])

  function draw() {
    const m = map.current
    if (!m) return

    for (const mk of markers.current.values()) mk.remove()
    markers.current.clear()

    if (m.getLayer("track-line")) m.removeLayer("track-line")
    if (m.getLayer("track-casing")) m.removeLayer("track-casing")
    if (m.getSource("track")) m.removeSource("track")

    if (points.length > 1) {
      m.addSource("track", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: points.map((p) => [p.lng, p.lat]),
          },
        },
      })
      // Casing under the line so the route separates from the basemap — the
      // same two-pass treatment the iOS map uses.
      m.addLayer({
        id: "track-casing",
        type: "line",
        source: "track",
        paint: {
          "line-color": "#0A1522",
          "line-width": 8,
          "line-opacity": 0.9,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      })
      m.addLayer({
        id: "track-line",
        type: "line",
        source: "track",
        paint: { "line-color": "#6D5FE8", "line-width": 4 },
        layout: { "line-cap": "round", "line-join": "round" },
      })
    }

    for (const p of points) {
      const el = document.createElement("button")
      el.type = "button"
      el.className = "track-pin"
      el.textContent = String(p.index)
      el.setAttribute("aria-label", `Moment ${p.index}`)
      el.dataset.selected = String(p.id === selectedId)
      el.addEventListener("click", (e) => {
        e.stopPropagation()
        onSelect(p.id)
      })
      markers.current.set(
        p.id,
        new mapboxgl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m)
      )
    }
  }

  function fit() {
    const m = map.current
    if (!m || points.length === 0) return
    if (points.length === 1) {
      m.easeTo({ center: [points[0].lng, points[0].lat], zoom: 13, duration: 0 })
      return
    }
    const b = new mapboxgl.LngLatBounds()
    for (const p of points) b.extend([p.lng, p.lat])
    m.fitBounds(b, { padding: 64, maxZoom: 14, duration: 0 })
  }

  // Translate a drop's screen position into a map coordinate, so the moment
  // lands exactly where the photo was released rather than at the centre.
  function dropAt(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const m = map.current
    const file = Array.from(e.dataTransfer.files).find((f) =>
      f.type.startsWith("image/")
    )
    if (!m || !file || !onDropPhoto || !holder.current) return
    const r = holder.current.getBoundingClientRect()
    const ll = m.unproject([e.clientX - r.left, e.clientY - r.top])
    onDropPhoto(file, ll.lat, ll.lng)
  }

  return (
    <>
      <div
        ref={holder}
        className="h-full w-full"
        onDragOver={(e) => {
          if (!onDropPhoto) return
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={dropAt}
      />
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-2xl border-2 border-dashed border-drift-coral bg-drift-coral/10">
          <p className="rounded-lg bg-aurora-midnight/85 px-3 py-1.5 text-[13px] font-semibold text-white">
            Drop to place a moment here
          </p>
        </div>
      )}
      <style jsx global>{`
        .track-pin {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          border: 2px solid #fff;
          /* aurora.teal / aurora.teal-ink — the list medallion mirrors this
             number, so the two must be the same teal. */
          background: #37d6c4;
          color: #04231f;
          font: 700 12px/1 ui-sans-serif, system-ui, sans-serif;
          font-variant-numeric: tabular-nums;
          display: grid;
          place-items: center;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
          transition: transform 0.16s ease, box-shadow 0.16s ease;
        }
        .track-pin[data-selected="true"] {
          transform: scale(1.28);
          box-shadow: 0 0 0 6px rgba(23, 193, 175, 0.28), 0 3px 10px rgba(0, 0, 0, 0.4);
        }
        .track-pin:focus-visible {
          outline: 2px solid #17c1af;
          outline-offset: 3px;
        }
        @media (prefers-reduced-motion: reduce) {
          .track-pin {
            transition: none;
          }
        }
      `}</style>
    </>
  )
}
