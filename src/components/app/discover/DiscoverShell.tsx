"use client"

import { useEffect, useRef, useState } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import {
  CATEGORY_META,
  loadCategory,
  type DiscoverAnchor,
  type DiscoverCategory,
  type DiscoverResult,
} from "@/lib/drift/discover"
import { resolvePlaceCandidates } from "@/lib/drift/chat"

// Discover — the map-first surface, desktop-native: results rail on the left
// (search, category chips, cards with photos/ratings/prices/Book), live map on
// the right with markers. Mobile: search + chips + list.

const CATS: DiscoverCategory[] = ["forYou", "restaurants", "thingsToDo", "stays"]

export default function DiscoverShell({
  initialAnchor,
}: {
  initialAnchor: DiscoverAnchor | null
}) {
  const [anchor, setAnchor] = useState<DiscoverAnchor | null>(initialAnchor)
  const [cat, setCat] = useState<DiscoverCategory>("forYou")
  const [results, setResults] = useState<DiscoverResult[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [searching, setSearching] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const reqSeq = useRef(0)

  useEffect(() => {
    if (!anchor) return
    const seq = ++reqSeq.current
    setLoading(true)
    setResults([])
    loadCategory(cat, anchor).then((r) => {
      if (reqSeq.current === seq) {
        setResults(r)
        setLoading(false)
      }
    })
  }, [cat, anchor])

  async function searchCity(e: React.FormEvent) {
    e.preventDefault()
    const q = search.trim()
    if (!q || searching) return
    setSearching(true)
    const cands = await resolvePlaceCandidates(q, q)
    setSearching(false)
    const c = cands[0]
    if (c?.latitude != null && c?.longitude != null) {
      setAnchor({
        label: c.name,
        country: null,
        lat: c.latitude,
        lng: c.longitude,
      })
      setSearch("")
    }
  }

  return (
    <div className="lg:fixed lg:inset-0 lg:top-0">
      <div className="mx-auto h-full w-full max-w-2xl px-5 pt-6 lg:max-w-none lg:px-0 lg:pt-0">
        <div className="h-full lg:grid lg:grid-cols-[440px_minmax(0,1fr)]">
          {/* Rail */}
          <div className="flex h-full flex-col lg:overflow-y-auto lg:border-r lg:border-drift-divider lg:bg-white lg:px-6 lg:pt-6">
            <h1 className="font-drift-display text-3xl font-medium tracking-tight">
              Discover
            </h1>

            {/* Location search */}
            <form onSubmit={searchCity} className="mt-4 flex gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={anchor ? `Near ${anchor.label} — search another city` : "Where to?"}
                className="min-w-0 flex-1 rounded-full border border-drift-divider bg-drift-alt-bg px-4 py-2.5 text-[14.5px] outline-none focus:border-drift-coral"
              />
              <button
                type="submit"
                disabled={searching || !search.trim()}
                className="shrink-0 rounded-full bg-drift-coral px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
              >
                {searching ? "…" : "Go"}
              </button>
            </form>

            {/* Category chips */}
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {CATS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                    cat === c
                      ? "bg-drift-coral text-white"
                      : "border border-drift-divider bg-white text-drift-muted"
                  }`}
                >
                  {CATEGORY_META[c].label}
                </button>
              ))}
            </div>

            {/* Results */}
            <div className="mt-4 flex-1 space-y-3 pb-28">
              {!anchor && (
                <p className="pt-8 text-center text-drift-muted">
                  Search a city to start exploring.
                </p>
              )}
              {anchor && loading && (
                <p className="pt-6 text-center text-[14px] text-drift-text-tertiary">
                  Finding {CATEGORY_META[cat].label.toLowerCase()} in {anchor.label}…
                </p>
              )}
              {anchor && !loading && results.length === 0 && (
                <p className="pt-6 text-center text-[14px] text-drift-text-tertiary">
                  Nothing found here yet.
                </p>
              )}
              {results.map((r) => (
                <ResultCard
                  key={`${r.source}-${r.id}`}
                  r={r}
                  onHover={() => setHovered(r.id)}
                />
              ))}
            </div>
          </div>

          {/* Map (desktop) */}
          <div className="hidden lg:block">
            <DiscoverMap anchor={anchor} results={results} hoveredId={hovered} />
          </div>
        </div>
      </div>
    </div>
  )
}

function ResultCard({ r, onHover }: { r: DiscoverResult; onHover: () => void }) {
  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name)}`
  return (
    <div
      onMouseEnter={onHover}
      className="flex gap-3 rounded-2xl border border-drift-divider bg-white p-2.5 transition-colors hover:border-drift-coral/40"
    >
      {r.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.photo} alt="" className="h-24 w-24 shrink-0 rounded-xl object-cover" />
      ) : (
        <div
          className="h-24 w-24 shrink-0 rounded-xl"
          style={{ background: "linear-gradient(135deg,#FEEDE8,#F7F7F8)" }}
        />
      )}
      <div className="min-w-0 flex-1 py-0.5">
        <p className="truncate text-[15px] font-semibold">{r.name}</p>
        <p className="mt-0.5 text-[12.5px] text-drift-muted">
          {r.rating != null && r.rating > 0 && (
            <>
              ★ {r.rating.toFixed(1)}
              {r.reviewCount ? ` (${compact(r.reviewCount)})` : ""}
              {" · "}
            </>
          )}
          {r.priceLabel ?? (r.subtitle ? humanize(r.subtitle) : "")}
        </p>
        <div className="mt-2 flex gap-2">
          {r.bookingUrl && (
            <a
              href={r.bookingUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-drift-coral px-3 py-1 text-[12px] font-semibold text-white"
            >
              Book
            </a>
          )}
          <a
            href={mapHref}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-drift-divider px-3 py-1 text-[12px] font-medium"
          >
            Map
          </a>
        </div>
      </div>
    </div>
  )
}

function compact(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n)
}

function humanize(raw: string): string {
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 40)
}

// ---- 2D results map ----

function DiscoverMap({
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
      style: "mapbox://styles/mapbox/streets-v12",
      center: anchor ? [anchor.lng ?? 0, anchor.lat ?? 20] : [0, 20],
      zoom: anchor ? 11 : 1.5,
      attributionControl: false,
    })
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
