"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import {
  CATEGORY_META,
  loadCategory,
  type DiscoverAnchor,
  type DiscoverCategory,
  type DiscoverResult,
} from "@/lib/drift/discover"
import { resolvePlaceCandidates } from "@/lib/drift/chat"

// mapbox-gl is heavy — load the map after the rail paints.
const DiscoverMap = dynamic(() => import("./DiscoverMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-aurora-midnight2" />,
})

// Discover — the map-first surface, desktop-native: results rail on the left
// (search, category chips, cards with photos/ratings/prices/Book), live map on
// the right with markers. Mobile: search + chips + list.

const CATS: DiscoverCategory[] = ["forYou", "restaurants", "thingsToDo", "stays", "events"]

// A quick-select place in the location picker — a destination across the
// user's trips (mirrors iOS "your destinations grouped by your timeline").
export interface DiscoverPlace {
  id: string
  label: string
  country: string | null
  lat: number | null
  lng: number | null
  bucket: "now" | "upcoming" | "past"
  subtitle: string
}

export default function DiscoverShell({
  initialAnchor,
  places,
}: {
  initialAnchor: DiscoverAnchor | null
  places: DiscoverPlace[]
}) {
  const [anchor, setAnchor] = useState<DiscoverAnchor | null>(initialAnchor)
  const [cat, setCat] = useState<DiscoverCategory>("forYou")
  const [results, setResults] = useState<DiscoverResult[]>([])
  const [loading, setLoading] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  // "Search this area": the fetch center is decoupled from the rail anchor. When
  // the user pans/zooms the map and taps the pill, `override` holds the new map
  // center (reverse-geocoded to a city label so Google-text categories re-search
  // there too) + a radius. Cleared whenever the rail anchor changes.
  const [override, setOverride] = useState<
    (DiscoverAnchor & { radiusKm: number }) | null
  >(null)
  const reqSeq = useRef(0)

  // The anchor actually driving results + the map — the override center if the
  // user searched a panned area, otherwise the rail selection.
  const fetchAnchor: DiscoverAnchor | null = override
    ? { label: override.label, country: override.country, lat: override.lat, lng: override.lng }
    : anchor

  // Picking a new rail location supersedes any "search this area" override.
  function selectAnchor(a: DiscoverAnchor) {
    setOverride(null)
    setAnchor(a)
  }

  // Re-search the current category at a new map center (from the map pill).
  async function searchArea(c: { lat: number; lng: number; radiusKm: number }) {
    const { label, country } = await reverseGeocodeCity(c.lat, c.lng)
    setOverride({ label, country, lat: c.lat, lng: c.lng, radiusKm: c.radiusKm })
  }

  useEffect(() => {
    if (!fetchAnchor) return
    const seq = ++reqSeq.current
    setLoading(true)
    // Keep the current results visible while the next category/location loads —
    // clearing to [] caused a jarring empty "flash" on every switch. loadCategory
    // is timeout-bounded, so `loading` always resolves.
    loadCategory(cat, fetchAnchor, override?.radiusKm).then((r) => {
      if (reqSeq.current === seq) {
        setResults(r)
        setLoading(false)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, anchor, override])

  return (
    // Start below the 60px sticky top nav — pinning to top-0 slid the location
    // picker + category chips under the nav.
    <div className="lg:fixed lg:bottom-0 lg:left-0 lg:right-0 lg:top-[60px]">
      <div className="mx-auto h-full w-full max-w-2xl px-5 pt-6 lg:max-w-none lg:px-0 lg:pt-0">
        <div className="h-full lg:grid lg:grid-cols-[440px_minmax(0,1fr)]">
          {/* Rail */}
          <div className="flex h-full flex-col lg:overflow-y-auto lg:border-r lg:border-drift-divider lg:bg-aurora-glass lg:px-6 lg:pt-6">
            <h1 className="font-drift-display text-3xl font-medium tracking-tight">
              Discover
            </h1>

            {/* Location picker — current location + your trip places + city search */}
            <div className="mt-4">
              <LocationPicker anchor={anchor} places={places} onSelect={selectAnchor} />
            </div>

            {/* Category chips — shrink-0 keeps the row from collapsing: as a
                flex child with overflow-x-auto its automatic min-height is 0,
                so the growing flex-1 results list below would otherwise squash
                it to a sliver. flex-nowrap + overflow-x-auto = horizontal scroll. */}
            <div className="mt-3 flex shrink-0 flex-nowrap items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {CATS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                    cat === c
                      ? "bg-drift-coral text-white"
                      : "border border-drift-divider bg-aurora-glass text-drift-muted"
                  }`}
                >
                  {CATEGORY_META[c].icon && (
                    <span className="mr-1">{CATEGORY_META[c].icon}</span>
                  )}
                  {CATEGORY_META[c].label}
                </button>
              ))}
            </div>

            {/* Results */}
            <div className="mt-4 flex-1 space-y-3 pb-28">
              {!fetchAnchor && (
                <p className="pt-8 text-center text-drift-muted">
                  Search a city to start exploring.
                </p>
              )}
              {fetchAnchor && loading && results.length === 0 && (
                <p className="pt-6 text-center text-[14px] text-drift-text-tertiary">
                  Finding {CATEGORY_META[cat].label.toLowerCase()} in {fetchAnchor.label}…
                </p>
              )}
              {fetchAnchor && !loading && results.length === 0 && (
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
            <DiscoverMap
              anchor={fetchAnchor}
              results={results}
              hoveredId={hovered}
              onSearchArea={searchArea}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// Location picker — the web port of the iOS Discover location selector. A
// dropdown offering "Current location" (browser geolocation), the user's trip
// destinations grouped by timeline, and free-text city search as the fallback.
function LocationPicker({
  anchor,
  places,
  onSelect,
}: {
  anchor: DiscoverAnchor | null
  places: DiscoverPlace[]
  onSelect: (a: DiscoverAnchor) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<
    Array<{ name: string; address: string | null; lat: number; lng: number }>
  >([])
  const [geoState, setGeoState] = useState<"idle" | "locating" | "denied">("idle")
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const grouped = useMemo(() => {
    const order: DiscoverPlace["bucket"][] = ["now", "upcoming", "past"]
    const titles: Record<DiscoverPlace["bucket"], string> = {
      now: "Traveling now",
      upcoming: "Upcoming",
      past: "Past trips",
    }
    return order
      .map((b) => ({ bucket: b, title: titles[b], items: places.filter((p) => p.bucket === b) }))
      .filter((g) => g.items.length > 0)
  }, [places])

  async function runSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = search.trim()
    if (!q || searching) return
    setSearching(true)
    const cands = await resolvePlaceCandidates(q, q)
    setSearching(false)
    setResults(
      cands
        .filter((c) => c.latitude != null && c.longitude != null)
        .slice(0, 6)
        .map((c) => ({ name: c.name, address: c.address ?? null, lat: c.latitude!, lng: c.longitude! }))
    )
  }

  function pickCurrentLocation() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeoState("denied")
      return
    }
    setGeoState("locating")
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        // Resolve the coords to a real city name — the Discover search is
        // text-based (resolvePlaceCandidates uses the label), so an anchor
        // labelled "Current location" returns an unscoped/nation-wide spread
        // and the map can't zoom to a city. Reverse-geocode first.
        const { label, country } = await reverseGeocodeCity(lat, lng)
        setGeoState("idle")
        onSelect({ label, country, lat, lng })
        setOpen(false)
      },
      () => setGeoState("denied"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    )
  }

  const rowBase =
    "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-drift-coral-50"

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-full border border-drift-divider bg-drift-alt-bg px-4 py-2.5 text-left text-[14.5px] outline-none transition-colors focus-visible:border-drift-coral"
      >
        <span className="text-[15px]">📍</span>
        <span className="min-w-0 flex-1 truncate font-semibold text-drift-ink">
          {anchor?.label ?? "Choose a place"}
        </span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute inset-x-0 top-[calc(100%+8px)] z-30 max-h-[60vh] overflow-y-auto overscroll-contain rounded-2xl border border-drift-divider bg-aurora-glass p-2 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.55)]">
          {/* City search */}
          <form onSubmit={runSearch} className="flex gap-2 p-1">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search another city…"
              className="min-w-0 flex-1 rounded-full border border-drift-divider bg-drift-alt-bg px-3.5 py-2 text-[14px] outline-none focus:border-drift-coral"
            />
            <button
              type="submit"
              disabled={searching || !search.trim()}
              className="shrink-0 rounded-full bg-drift-coral px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {searching ? "…" : "Go"}
            </button>
          </form>

          {results.length > 0 && (
            <div className="mt-1">
              {results.map((r, i) => (
                <button key={i} onClick={() => { onSelect({ label: r.name, country: null, lat: r.lat, lng: r.lng }); setSearch(""); setResults([]); setOpen(false) }} className={rowBase}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-drift-alt-bg text-[15px]">🔎</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold">{r.name}</span>
                    {r.address && (
                      <span className="block truncate text-[12px] text-drift-muted">{r.address}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Current location */}
          <button onClick={pickCurrentLocation} className={`mt-1 ${rowBase}`}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-drift-coral text-[15px] text-white">
              📍
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold">
                {geoState === "locating" ? "Locating…" : "Current location"}
              </span>
              <span className="block truncate text-[12px] text-drift-muted">
                {geoState === "denied" ? "Location permission denied" : "Explore where you are now"}
              </span>
            </span>
          </button>

          {/* Your trip places, grouped by timeline */}
          {grouped.map((g) => (
            <div key={g.bucket} className="mt-1">
              <p className="px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-drift-text-tertiary">
                {g.title}
              </p>
              {g.items.map((p) => {
                const active = anchor?.lat === p.lat && anchor?.lng === p.lng
                return (
                  <button
                    key={p.id}
                    onClick={() => { onSelect({ label: p.label, country: p.country, lat: p.lat, lng: p.lng }); setOpen(false) }}
                    className={active ? `${rowBase} bg-drift-coral-50` : rowBase}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-drift-alt-bg text-[15px]">
                      📍
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">{p.label}</span>
                      {p.subtitle && (
                        <span className="block truncate text-[12px] text-drift-muted">{p.subtitle}</span>
                      )}
                    </span>
                    {active && <span className="shrink-0 text-drift-coral">✓</span>}
                  </button>
                )
              })}
            </div>
          ))}

          {grouped.length === 0 && (
            <p className="px-2.5 py-3 text-center text-[13px] text-drift-muted">
              No trip places yet — search a city above.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ResultCard({ r, onHover }: { r: DiscoverResult; onHover: () => void }) {
  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name)}`
  // Google-sourced places have a rich detail page; vendor results deep-link out.
  const detailHref =
    r.source === "google" && !r.id.startsWith("osm:") && !r.id.startsWith("geonames:")
      ? `/app/place/${encodeURIComponent(r.id)}`
      : null
  const photoEl = r.photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={r.photo}
      alt=""
      loading="lazy"
      className="h-24 w-24 shrink-0 rounded-xl object-cover"
    />
  ) : (
    <div
      className="h-24 w-24 shrink-0 rounded-xl"
      style={{ background: "linear-gradient(135deg,#16222F,#0B1A25)" }}
    />
  )
  return (
    <div
      onMouseEnter={onHover}
      className="flex gap-3 rounded-2xl border border-aurora-border bg-aurora-glass p-2.5 transition-all duration-150 hover:-translate-y-0.5 hover:border-drift-coral/40 hover:shadow-[0_14px_34px_-18px_rgba(0,0,0,0.5)]"
    >
      {detailHref ? <a href={detailHref}>{photoEl}</a> : photoEl}
      <div className="min-w-0 flex-1 py-0.5">
        {detailHref ? (
          <a href={detailHref} className="block truncate text-[15px] font-semibold hover:text-drift-coral">
            {r.name}
          </a>
        ) : (
          <p className="truncate text-[15px] font-semibold">{r.name}</p>
        )}
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
              {r.source === "ticketmaster" ? "Tickets" : "Book"}
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

// Reverse-geocode coords → nearest city name + country via Mapbox (the token is
// already loaded for the map). Falls back to a generic label so search still
// runs. `place` = city-level feature.
async function reverseGeocodeCity(
  lat: number,
  lng: number
): Promise<{ label: string; country: string | null }> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token) return { label: "Nearby", country: null }
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place&limit=1&access_token=${token}`
    )
    if (!res.ok) return { label: "Nearby", country: null }
    const json = (await res.json()) as {
      features?: { text?: string; context?: { id?: string; text?: string }[] }[]
    }
    const f = json.features?.[0]
    const label = f?.text ?? "Nearby"
    const country =
      f?.context?.find((c) => c.id?.startsWith("country"))?.text ?? null
    return { label, country }
  } catch {
    return { label: "Nearby", country: null }
  }
}

function compact(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n)
}

function humanize(raw: string): string {
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 40)
}

