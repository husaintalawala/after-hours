"use client"

import { useEffect, useRef, useState } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { safeHttpUrl, type DiscoverAnchor, type DiscoverResult } from "@/lib/drift/discover"

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

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string
  )
}

function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function fmtCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n)
}

// Rich POI popup — photo hero, name, ★ rating + count, category/price chips, and
// a Tickets/Book/Details CTA. Uses only fields already on DiscoverResult.
function popupHTML(r: DiscoverResult): string {
  const detail =
    r.source === "google" && !r.id.startsWith("osm:") && !r.id.startsWith("geonames:")
      ? `/app/place/${encodeURIComponent(r.id)}`
      : null
  const hero = r.photo
    ? `<div style="height:104px;overflow:hidden"><img src="${escapeHtml(r.photo)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block"></div>`
    : `<div style="height:56px;background:linear-gradient(135deg,#16222f,#0b151d)"></div>`
  const rating =
    r.rating != null && r.rating > 0
      ? `<div style="display:flex;align-items:center;gap:4px;margin-top:5px;font-size:12.5px"><span style="color:#e7a24b">★</span><b style="color:#f4f8f9">${r.rating.toFixed(1)}</b>${
          r.reviewCount ? `<span style="color:#7d8c98">(${fmtCount(r.reviewCount)})</span>` : ""
        }</div>`
      : ""
  const chips = [r.subtitle ? humanize(r.subtitle) : "", r.priceLabel]
    .filter(Boolean)
    .map(
      (c) =>
        `<span style="font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:20px;background:#1b2a38;color:#c6d0d9;border:1px solid rgba(255,255,255,.14)">${escapeHtml(
          c as string
        )}</span>`
    )
    .join("")
  const ctas: string[] = []
  const book = safeHttpUrl(r.bookingUrl)
  if (book)
    ctas.push(
      `<a href="${escapeHtml(book)}" target="_blank" rel="noreferrer" style="flex:1;text-align:center;font-size:12px;font-weight:700;padding:7px 0;border-radius:20px;background:#37d6c4;color:#04231f;text-decoration:none">${
        r.source === "ticketmaster" ? "Tickets" : "Book"
      }</a>`
    )
  if (detail)
    ctas.push(
      `<a href="${detail}" style="flex:1;text-align:center;font-size:12px;font-weight:700;padding:7px 0;border-radius:20px;border:1px solid rgba(255,255,255,.14);color:#f4f8f9;text-decoration:none">Details</a>`
    )
  return (
    `<div style="width:220px">` +
    hero +
    `<div style="padding:10px 12px 12px">` +
    `<div style="font-weight:700;font-size:14px;line-height:1.25;color:#f4f8f9">${escapeHtml(r.name)}</div>` +
    rating +
    (chips ? `<div style="display:flex;gap:6px;margin-top:7px;flex-wrap:wrap">${chips}</div>` : "") +
    (r.description
      ? `<div style="margin-top:8px;font-size:11.5px;line-height:1.5;color:#7d8c98;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(
          r.description
        )}</div>`
      : "") +
    (ctas.length ? `<div style="display:flex;gap:7px;margin-top:10px">${ctas.join("")}</div>` : "") +
    `</div></div>`
  )
}

// A single POI photo-pin marker (dot fallback) + its rich popup.
function singleMarker(r: DiscoverResult): mapboxgl.Marker {
  const el = document.createElement("div")
  if (r.photo) {
    el.style.cssText =
      "width:36px;height:36px;border-radius:50%;overflow:hidden;border:2.5px solid #37d6c4;box-shadow:0 3px 10px rgba(0,0,0,.5);cursor:pointer;background:#16222f"
    const img = document.createElement("img")
    img.src = r.photo
    img.alt = ""
    img.loading = "lazy"
    img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block"
    el.appendChild(img)
  } else {
    el.style.cssText =
      "width:16px;height:16px;border-radius:50%;background:#37d6c4;border:2.5px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4);cursor:pointer"
  }
  return new mapboxgl.Marker({ element: el })
    .setLngLat([r.lng as number, r.lat as number])
    .setPopup(
      new mapboxgl.Popup({
        offset: 18,
        closeButton: false,
        maxWidth: "244px",
        className: "discover-pop",
      }).setHTML(popupHTML(r))
    )
}

// A cluster of overlapping results. All-events clusters (same venue) open a
// lineup popup; mixed/POI clusters zoom in to expand on click.
function clusterMarker(items: DiscoverResult[], map: mapboxgl.Map): mapboxgl.Marker {
  const lng = items.reduce((s, r) => s + (r.lng as number), 0) / items.length
  const lat = items.reduce((s, r) => s + (r.lat as number), 0) / items.length
  const allEvents = items.every((r) => r.source === "ticketmaster")
  const el = document.createElement("div")
  el.style.cssText =
    "min-width:40px;height:40px;padding:0 9px;border-radius:20px;background:#37d6c4;color:#04231f;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12.5px;border:2.5px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.5);cursor:pointer;white-space:nowrap"
  el.textContent = allEvents ? `${items.length} events` : `+${items.length}`
  const m = new mapboxgl.Marker({ element: el }).setLngLat([lng, lat])
  if (allEvents) {
    m.setPopup(
      new mapboxgl.Popup({
        offset: 18,
        closeButton: false,
        maxWidth: "288px",
        className: "discover-pop",
      }).setHTML(eventsListHTML(items))
    )
  } else {
    el.addEventListener("click", () => {
      const b = new mapboxgl.LngLatBounds()
      items.forEach((r) => b.extend([r.lng as number, r.lat as number]))
      map.fitBounds(b, { padding: 90, maxZoom: 16, duration: 600 })
    })
  }
  return m
}

function eventsListHTML(items: DiscoverResult[]): string {
  const rows = items
    .slice(0, 8)
    .map((r) => {
      const thumb = r.photo
        ? `<img src="${escapeHtml(r.photo)}" alt="" style="width:40px;height:40px;border-radius:9px;object-fit:cover;flex:0 0 auto">`
        : `<div style="width:40px;height:40px;border-radius:9px;flex:0 0 auto;background:linear-gradient(135deg,#16222f,#0b151d)"></div>`
      return (
        `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-top:1px solid rgba(255,255,255,.07)">` +
        thumb +
        `<div style="min-width:0;flex:1"><div style="font-size:12.5px;font-weight:600;color:#f4f8f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(
          r.name
        )}</div>` +
        (r.subtitle ? `<div style="font-size:10.5px;color:#7d8c98;margin-top:1px">${escapeHtml(r.subtitle)}</div>` : "") +
        `</div></div>`
      )
    })
    .join("")
  return (
    `<div style="width:264px;max-height:300px;overflow-y:auto">` +
    `<div style="padding:10px 12px;font-weight:700;font-size:13px;color:#f4f8f9">${items.length} events here</div>` +
    rows +
    `</div>`
  )
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
  // Fingerprint of the last coords/anchor we camera-fit to, so a results change
  // that only fills in descriptions (lazy AI blurbs) re-renders the markers/
  // popups WITHOUT re-animating the camera.
  const lastFitRef = useRef<string>("")
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

  // Markers follow results, with lightweight pixel-space clustering that
  // re-computes on pan/zoom. Right-sized for Discover's ~20 results — no
  // supercluster dependency; overlapping pins collapse into a "+N" (or
  // "N events" at a shared venue) that expands on click.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const pts = results.filter((r) => r.lat != null && r.lng != null)

    const render = () => {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current.clear()
      // Greedy cluster by projected-pixel proximity (running centroid).
      const TH = 44
      type Cl = { items: DiscoverResult[]; sx: number; sy: number }
      const clusters: Cl[] = []
      for (const r of pts) {
        const p = map.project([r.lng as number, r.lat as number])
        let placed = false
        for (const c of clusters) {
          const cx = c.sx / c.items.length
          const cy = c.sy / c.items.length
          if (Math.hypot(cx - p.x, cy - p.y) < TH) {
            c.items.push(r)
            c.sx += p.x
            c.sy += p.y
            placed = true
            break
          }
        }
        if (!placed) clusters.push({ items: [r], sx: p.x, sy: p.y })
      }
      clusters.forEach((c, i) => {
        if (c.items.length === 1) {
          const r = c.items[0]
          markersRef.current.set(r.id, singleMarker(r).addTo(map))
        } else {
          markersRef.current.set(`cluster-${i}`, clusterMarker(c.items, map).addTo(map))
        }
      })
    }

    render()

    // Fit the camera only when the actual set of places (or the anchor) changes
    // — a results change that merely fills in descriptions (lazy AI blurbs) has
    // the same fingerprint, so it re-renders markers/popups without yanking the
    // camera back from wherever the user panned.
    const fp =
      pts.map((r) => `${r.id}:${r.lat}:${r.lng}`).join("|") + `@${anchor?.lat},${anchor?.lng}`
    if (fp !== lastFitRef.current) {
      lastFitRef.current = fp
      const bounds = new mapboxgl.LngLatBounds()
      let any = false
      for (const r of pts) {
        bounds.extend([r.lng as number, r.lat as number])
        any = true
      }
      if (any) {
        beginProgrammatic()
        map.fitBounds(bounds, { padding: 70, maxZoom: 14, duration: 800 })
      } else if (anchor?.lat != null && anchor?.lng != null) {
        beginProgrammatic()
        map.flyTo({ center: [anchor.lng, anchor.lat], zoom: 11, duration: 800 })
      }
    }

    map.on("moveend", render)
    return () => {
      map.off("moveend", render)
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
