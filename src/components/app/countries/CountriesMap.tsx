"use client"

import { useEffect, useRef } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"

// Choropleth of visited countries (iOS "Countries visited" map). A clean,
// non-interactive world on a dark Aurora background, visited countries filled
// teal via the Mapbox country-boundaries tileset (its `iso_3166_1` is ISO alpha-2).

export default function CountriesMap({ codes }: { codes: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token || !containerRef.current) return
    mapboxgl.accessToken = token
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": "#0B1A25" } }],
      },
      center: [12, 28],
      zoom: 0.55,
      projection: { name: "mercator" },
      interactive: false,
      attributionControl: false,
    })

    map.on("load", () => {
      map.addSource("countries", {
        type: "vector",
        url: "mapbox://mapbox.country-boundaries-v1",
      })
      // All land — raised glass surface (unvisited).
      map.addLayer({
        id: "countries-base",
        type: "fill",
        source: "countries",
        "source-layer": "country_boundaries",
        paint: { "fill-color": "#1B2A38" },
      })
      // Visited — Aurora teal.
      map.addLayer({
        id: "countries-visited",
        type: "fill",
        source: "countries",
        "source-layer": "country_boundaries",
        paint: { "fill-color": "#37D6C4" },
        filter: ["in", ["get", "iso_3166_1"], ["literal", codes]],
      })
      // Thin separators — match the ocean so borders carve.
      map.addLayer({
        id: "countries-line",
        type: "line",
        source: "countries",
        "source-layer": "country_boundaries",
        paint: { "line-color": "#0B1A25", "line-width": 0.5 },
      })
    })

    return () => map.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={containerRef}
      className="h-[220px] w-full overflow-hidden rounded-2xl"
      aria-label="Map of countries visited"
    />
  )
}
