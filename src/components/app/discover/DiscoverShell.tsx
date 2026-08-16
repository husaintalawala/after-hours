"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import {
  CATEGORY_META,
  fetchPlaceBlurbs,
  loadCategory,
  safeHttpUrl,
  type DiscoverAnchor,
  type DiscoverCategory,
  type DiscoverResult,
} from "@/lib/drift/discover"
import { resolvePlaceCandidates } from "@/lib/drift/chat"
import { applyCreateStep, type CreateStepOp } from "@/lib/drift/quickOp"
import { AnalyticsEvent, capture } from "@/lib/analytics"
import PlaceSheet from "./PlaceSheet"

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
  // Trip context for the Discover "+" add-to-itinerary flow.
  tripId: string
  destinationRef: string
  days: { date: string; label: string }[]
}

// Discover category → itinerary step type (mirrors iOS category.stepType).
function stepTypeForCategory(cat: DiscoverCategory): CreateStepOp["type"] {
  switch (cat) {
    case "restaurants":
      return "food"
    case "thingsToDo":
    case "events":
      return "activity"
    case "stays":
      return "stay"
    default:
      return "spot"
  }
}

export default function DiscoverShell({
  initialAnchor,
  places,
}: {
  initialAnchor: DiscoverAnchor | null
  places: DiscoverPlace[]
}) {
  // Deep-link params (e.g. from the Guide's "Where to stay" → all stays for this
  // trip's city): ?cat=stays&label=&country=&lat=&lng= overrides the featured-trip
  // anchor + default category so the tab opens straight on the intended view.
  const params = useSearchParams()
  const paramCat = params.get("cat")
  const initialCat: DiscoverCategory =
    paramCat && (CATS as string[]).includes(paramCat)
      ? (paramCat as DiscoverCategory)
      : "forYou"
  const paramAnchor: DiscoverAnchor | null = params.get("label")
    ? {
        label: params.get("label")!,
        country: params.get("country"),
        lat: params.get("lat") != null ? Number(params.get("lat")) : null,
        lng: params.get("lng") != null ? Number(params.get("lng")) : null,
      }
    : null

  const [anchor, setAnchor] = useState<DiscoverAnchor | null>(paramAnchor ?? initialAnchor)
  const [cat, setCat] = useState<DiscoverCategory>(initialCat)
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
  // Client-side blurb memo (id → AI one-liner) so switching categories / panning
  // back doesn't re-request blurbs we already have this session. The server
  // caches permanently too; this just avoids the round-trip.
  const blurbCache = useRef<Map<string, string>>(new Map())
  // Add-to-itinerary flow: the POI the "+" was tapped on, and a transient toast.
  const [addTarget, setAddTarget] = useState<DiscoverResult | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  // Place-details sheet: the POI whose card body / map pin was tapped.
  const [sheetPoi, setSheetPoi] = useState<DiscoverResult | null>(null)
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2800)
    return () => window.clearTimeout(t)
  }, [toast])

  // The anchor actually driving results — the override center if the
  // user searched a panned area, otherwise the rail selection. Memoized so its
  // identity is stable: in override mode it would otherwise be a fresh object
  // literal every render, and passing that to <DiscoverMap anchor> re-runs the
  // fit/cluster effect (re-animating the camera + rebuilding markers) on every
  // unrelated re-render, e.g. hovering a card.
  const fetchAnchor: DiscoverAnchor | null = useMemo(
    () =>
      override
        ? { label: override.label, country: override.country, lat: override.lat, lng: override.lng }
        : anchor,
    [override, anchor]
  )

  // The trip destination the current anchor corresponds to (when the user is
  // browsing one of their own trip places) — the default add-to-itinerary target.
  const currentPlace = useMemo<DiscoverPlace | null>(() => {
    const a = fetchAnchor
    if (a?.lat == null || a?.lng == null) return null
    return (
      places.find(
        (p) =>
          !!p.tripId &&
          p.lat != null &&
          p.lng != null &&
          Math.abs(p.lat - a.lat!) < 0.03 &&
          Math.abs(p.lng - a.lng!) < 0.03
      ) ?? null
    )
  }, [fetchAnchor, places])

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

  // Lazily fill AI one-line blurbs for any result that lacks a description
  // (Google POIs, stays, events — Viator activities already ship their own).
  // Runs after each result load and merges the blurbs into results — and thus
  // the map popups — when they arrive. The seq guard drops results that a newer
  // load has already superseded. Best-effort.
  async function enrichBlurbs(list: DiscoverResult[], seq: number) {
    const need = list.filter((r) => !r.description && r.name)
    if (!need.length) return
    const uncached = need.filter((r) => !blurbCache.current.has(r.id))
    if (uncached.length) {
      const fetched = await fetchPlaceBlurbs(
        uncached.map((r) => ({
          id: r.id,
          name: r.name,
          city: fetchAnchor?.label ?? undefined,
          category: blurbCategory(r),
          context: blurbContext(r),
        }))
      )
      for (const [id, b] of Object.entries(fetched)) blurbCache.current.set(id, b)
    }
    if (reqSeq.current !== seq) return // superseded by a newer load — don't merge stale
    setResults((prev) => {
      let changed = false
      const next = prev.map((r) => {
        if (r.description) return r
        const b = blurbCache.current.get(r.id)
        if (b) {
          changed = true
          return { ...r, description: b }
        }
        return r
      })
      return changed ? next : prev
    })
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
        enrichBlurbs(r, seq)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, anchor, override])

  // Category chip row — shared by the desktop panel and the mobile top chrome.
  const chipsRow = (
    <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {CATS.map((c) => (
        <button
          key={c}
          onClick={() => setCat(c)}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold shadow-sm transition-colors ${
            cat === c
              ? "bg-drift-coral text-white"
              : "border border-drift-divider bg-aurora-glass text-drift-muted"
          }`}
        >
          {CATEGORY_META[c].icon && <span className="mr-1">{CATEGORY_META[c].icon}</span>}
          {CATEGORY_META[c].label}
        </button>
      ))}
    </div>
  )

  return (
    // Full-bleed on both breakpoints. Desktop: split grid (results panel + map,
    // right of the 76px nav rail). Mobile: iOS map-forward. The add-to-itinerary
    // sheet + toast are siblings of this fixed container (below) so they escape
    // its stacking context and layer above the bottom nav.
    <>
      <div className="fixed inset-0 bottom-0 top-0 lg:left-[76px] lg:right-0 lg:grid lg:grid-cols-[minmax(0,600px)_minmax(0,1fr)]">
      {/* ===== Desktop results panel (grid col 1) ===== */}
      <div className="relative z-10 hidden h-full min-h-0 flex-col overflow-y-auto border-r border-drift-divider bg-aurora-glass px-6 pt-6 lg:flex">
        <h1 className="font-drift-display text-3xl font-medium tracking-tight">Discover</h1>
        <div className="mt-4">
          <LocationPicker anchor={anchor} places={places} onSelect={selectAnchor} />
        </div>
        <div className="mt-3 shrink-0">{chipsRow}</div>
        <div className="mt-4 flex-1 pb-8">
          {!fetchAnchor && (
            <p className="pt-8 text-center text-drift-muted">Search a city to start exploring.</p>
          )}
          {fetchAnchor && loading && results.length === 0 && (
            <p className="pt-6 text-center text-[14px] text-drift-text-tertiary">
              Finding {CATEGORY_META[cat].label.toLowerCase()} in {fetchAnchor.label}…
            </p>
          )}
          {fetchAnchor && !loading && results.length === 0 && (
            <p className="pt-6 text-center text-[14px] text-drift-text-tertiary">Nothing found here yet.</p>
          )}
          <div className="grid grid-cols-2 gap-4">
            {fetchAnchor &&
              loading &&
              results.length === 0 &&
              Array.from({ length: 4 }).map((_, i) => <ResultCardSkeleton key={i} />)}
            {results.map((r) => (
              <ResultCard
                key={`${r.source}-${r.id}`}
                r={r}
                onHover={() => setHovered(r.id)}
                onAdd={() => setAddTarget(r)}
                onOpen={() => setSheetPoi(r)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ===== Map — single instance (grid col 2 on desktop, full-bleed on mobile) ===== */}
      <div className="discover-map-pane absolute inset-0 lg:relative lg:inset-auto lg:h-full">
        {fetchAnchor ? (
          <DiscoverMap
            anchor={fetchAnchor}
            results={results}
            hoveredId={hovered}
            onSearchArea={searchArea}
            onSelectResult={(r) => setSheetPoi(r)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-aurora-midnight2 px-8 text-center text-drift-muted">
            Search a city to start exploring.
          </div>
        )}
      </div>

      {/* ===== Mobile floating chrome (over the map) ===== */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-44 bg-gradient-to-b from-black/70 via-black/25 to-transparent lg:hidden" />
      <div className="absolute inset-x-0 top-0 z-30 px-4 pt-4 lg:hidden">
        <LocationPicker anchor={anchor} places={places} onSelect={selectAnchor} />
        <div className="mt-3">{chipsRow}</div>
      </div>
      {/* Swipeable compact card carousel (iOS parity), flush above the attached nav. */}
      <div className="absolute inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] z-20 lg:hidden">
        {fetchAnchor && loading && results.length === 0 && (
          <p className="mx-4 rounded-full border border-drift-divider bg-aurora-glass px-4 py-2 text-center text-[13px] text-drift-text-tertiary shadow-lg">
            Finding {CATEGORY_META[cat].label.toLowerCase()} in {fetchAnchor.label}…
          </p>
        )}
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {fetchAnchor &&
            loading &&
            results.length === 0 &&
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="w-[300px] shrink-0 snap-center">
                <CarouselCardSkeleton />
              </div>
            ))}
          {results.map((r) => (
            <div key={`${r.source}-${r.id}`} className="w-[300px] shrink-0 snap-center">
              <CarouselCard
                r={r}
                anchor={fetchAnchor}
                onAdd={() => setAddTarget(r)}
                onOpen={() => setSheetPoi(r)}
              />
            </div>
          ))}
        </div>
      </div>
      </div>

      {/* Add-to-itinerary flow (the "+" on a card) + success toast. Rendered as
          siblings of the fixed map container so they escape its stacking context
          and layer above the bottom nav. */}
      {addTarget && (
        <AddToTripSheet
          poi={addTarget}
          places={places}
          current={currentPlace}
          category={cat}
          onClose={() => setAddTarget(null)}
          onDone={(msg) => {
            setAddTarget(null)
            setToast(msg)
          }}
        />
      )}
      {sheetPoi && (
        <PlaceSheet
          poi={sheetPoi}
          distanceLabel={distanceMi(fetchAnchor, sheetPoi)}
          onClose={() => setSheetPoi(null)}
          onAdd={() => {
            setAddTarget(sheetPoi)
            setSheetPoi(null)
          }}
        />
      )}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[80] flex justify-center px-4 lg:bottom-6 lg:left-[76px]">
          <div className="rounded-full bg-aurora-glass2 px-4 py-2.5 text-[13.5px] font-semibold text-aurora-ink shadow-[0_14px_34px_-12px_rgba(0,0,0,0.7)] ring-1 ring-white/10">
            {toast}
          </div>
        </div>
      )}
    </>
  )
}

// Compact horizontal Discover card for the mobile map carousel — mirrors the
// iOS card: square image left; name, ★rating (full count), category · distance,
// and address on the right, with heart + add circular actions. No description,
// no "Details" button (the whole card / add button open the detail or booking).
function CarouselCard({
  r,
  anchor,
  onAdd,
  onOpen,
}: {
  r: DiscoverResult
  anchor: DiscoverAnchor | null
  onAdd: () => void
  onOpen: () => void
}) {
  const [saved, setSaved] = useState(false)
  const category = r.subtitle ? humanize(r.subtitle) : null
  const dist = distanceMi(anchor, r)
  const metaLine = [category, dist].filter(Boolean).join(" · ")
  const address = r.address && r.address !== r.subtitle ? r.address : null

  return (
    <div className="flex gap-3 rounded-2xl border border-aurora-border bg-aurora-glass p-2.5 shadow-[0_14px_34px_-18px_rgba(0,0,0,0.6)]">
      <button onClick={onOpen} className="block shrink-0" aria-label={`View ${r.name}`}>
        {r.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.photo} alt="" loading="lazy" className="h-[86px] w-[86px] rounded-xl object-cover" />
        ) : (
          <div className="h-[86px] w-[86px] rounded-xl" style={{ background: "linear-gradient(135deg,#16222F,#0B1A25)" }} />
        )}
      </button>
      <div className="flex min-w-0 flex-1 gap-2">
        <button onClick={onOpen} className="min-w-0 flex-1 py-0.5 text-left">
          <span className="block truncate text-[14.5px] font-semibold leading-tight text-drift-ink">
            {r.name}
          </span>
          {r.rating != null && r.rating > 0 && (
            <div className="mt-1 flex items-center gap-1 text-[12.5px]">
              <span style={{ color: "#E7A24B" }}>★</span>
              <span className="font-semibold text-drift-ink">{r.rating.toFixed(1)}</span>
              {r.reviewCount ? (
                <span className="text-drift-text-tertiary">({r.reviewCount.toLocaleString()})</span>
              ) : null}
            </div>
          )}
          {metaLine && <p className="mt-0.5 truncate text-[12px] text-drift-muted">{metaLine}</p>}
          {address && <p className="mt-0.5 truncate text-[11.5px] text-drift-text-tertiary">{address}</p>}
        </button>
        {/* Actions: save (heart) + add. */}
        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            onClick={() => setSaved((v) => !v)}
            aria-label={saved ? "Saved" : "Save"}
            aria-pressed={saved}
            className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
              saved ? "border-drift-coral bg-drift-coral/15 text-drift-coral" : "border-drift-divider text-drift-muted"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
              <path d="M12 21s-7-4.6-9.3-9A5 5 0 0 1 12 6a5 5 0 0 1 9.3 6c-2.3 4.4-9.3 9-9.3 9z" />
            </svg>
          </button>
          <button
            onClick={onAdd}
            aria-label="Add to a trip"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-drift-coral text-white"
          >
            <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] fill-current">
              <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// Loading placeholders in the exact grids the results land in, so the swap
// from skeleton → cards doesn't reflow. Desktop 2-col card / mobile carousel.
function ResultCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-aurora-border bg-aurora-glass">
      <div className="h-[132px] w-full animate-pulse bg-aurora-glass2 motion-reduce:animate-none" />
      <div className="space-y-2 p-3">
        <div className="h-4 w-4/5 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
      </div>
    </div>
  )
}

function CarouselCardSkeleton() {
  return (
    <div className="flex gap-3 rounded-2xl border border-aurora-border bg-aurora-glass p-2.5 shadow-[0_14px_34px_-18px_rgba(0,0,0,0.6)]">
      <div className="h-[86px] w-[86px] shrink-0 animate-pulse rounded-xl bg-aurora-glass2 motion-reduce:animate-none" />
      <div className="min-w-0 flex-1 space-y-2 py-1">
        <div className="h-4 w-3/4 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
      </div>
    </div>
  )
}

// Great-circle distance anchor → result, in miles, for the compact card. null
// when either point lacks coords or the distance rounds to ~0.
function distanceMi(a: DiscoverAnchor | null, r: DiscoverResult): string | null {
  if (a?.lat == null || a?.lng == null || r.lat == null || r.lng == null) return null
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 3958.8 // miles
  const dLat = toRad(r.lat - a.lat)
  const dLng = toRad(r.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(r.lat)) * Math.sin(dLng / 2) ** 2
  const mi = R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
  if (mi < 0.1) return null
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`
}

// Add-to-itinerary sheet — the web equivalent of the iOS Discover "+" flow
// (performAdd → applyCreateStep). Pick a trip destination (defaults to the one
// the user is browsing) then a day, and the POI is inserted as an itinerary step.
function AddToTripSheet({
  poi,
  places,
  current,
  category,
  onClose,
  onDone,
}: {
  poi: DiscoverResult
  places: DiscoverPlace[]
  current: DiscoverPlace | null
  category: DiscoverCategory
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const destinations = useMemo(() => places.filter((p) => p.tripId), [places])
  const [dest, setDest] = useState<DiscoverPlace | null>(current)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function doAdd(target: DiscoverPlace, date: string | null) {
    if (adding) return
    setAdding(true)
    setError(null)
    const placeId =
      poi.source === "google" && !poi.id.startsWith("osm:") && !poi.id.startsWith("geonames:")
        ? poi.id
        : null
    try {
      await applyCreateStep(
        target.tripId,
        {
          op: "create_step",
          type: stepTypeForCategory(category),
          title: poi.name,
          destination_ref: target.destinationRef || target.label,
          date: date,
        },
        { name: poi.name, lat: poi.lat, lng: poi.lng, place_id: placeId }
      )
      capture(AnalyticsEvent.AddToItinerary, { source: "discover", category })
      onDone(`Added ${poi.name} to ${target.label}`)
    } catch {
      setError("Couldn't add — try again.")
      setAdding(false)
    }
  }

  const dayRow =
    "flex w-full items-center justify-between rounded-xl border border-drift-divider px-3.5 py-3 text-left text-[14px] font-semibold text-drift-ink transition-colors hover:border-drift-coral/50 active:bg-drift-coral/10 disabled:opacity-60"

  // NOTE: DiscoverShell renders this OUTSIDE its own position:fixed map container
  // (as a sibling, in the root stacking context) — otherwise the fixed container
  // forms a stacking context that sits below the bottom nav (z-50) and the nav
  // paints over the sheet. Here z-[90] beats the nav and the scrim covers it.
  return (
    <div className="fixed inset-0 z-[90] flex flex-col justify-end lg:items-center lg:justify-center">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="relative flex max-h-[90vh] min-h-[56vh] flex-col overflow-hidden rounded-t-[26px] border-t border-aurora-border bg-aurora-glass shadow-aurora-glow lg:max-h-[80vh] lg:min-h-0 lg:w-[440px] lg:rounded-3xl lg:border">
        <div className="flex justify-center pt-2.5 lg:hidden">
          <span className="h-1 w-9 rounded-full bg-white/20" />
        </div>
        <div className="flex items-center gap-3 border-b border-aurora-border px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="truncate font-drift-display text-[16px] font-semibold">Add to itinerary</p>
            <p className="truncate text-[12.5px] text-drift-text-tertiary">{poi.name}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-drift-divider text-drift-muted"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {destinations.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-[14px] text-drift-muted">Create a trip first to add places to it.</p>
              <a
                href="/app/trips/new"
                className="mt-3 inline-block rounded-full bg-drift-coral px-4 py-2 text-[13px] font-semibold text-white"
              >
                Plan a new trip
              </a>
            </div>
          ) : !dest ? (
            <>
              <p className="mb-2 text-[12.5px] font-semibold text-drift-muted">Choose a trip destination</p>
              <div className="space-y-1.5">
                {destinations.map((p) => (
                  <button
                    key={`${p.tripId}-${p.id}`}
                    onClick={() => setDest(p)}
                    className="flex w-full items-center gap-3 rounded-xl border border-drift-divider px-3 py-3 text-left transition-colors hover:border-drift-coral/50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-aurora-glass2 text-[15px]">
                      📍
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">{p.label}</span>
                      {p.subtitle && (
                        <span className="block truncate text-[12px] text-drift-muted">{p.subtitle}</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {destinations.length > 1 && (
                <button
                  onClick={() => setDest(null)}
                  className="mb-3 flex items-center gap-1.5 text-[12.5px] font-medium text-drift-muted"
                >
                  <span className="text-drift-coral">‹</span> {dest.label}
                  <span className="text-drift-text-tertiary"> · change</span>
                </button>
              )}
              <p className="mb-2.5 text-[13px] font-semibold">Which day?</p>
              <div className="space-y-1.5">
                {dest.days.map((d) => (
                  <button key={d.date} onClick={() => doAdd(dest, d.date)} disabled={adding} className={dayRow}>
                    <span>{d.label}</span>
                    <span className="text-[19px] leading-none text-drift-coral">+</span>
                  </button>
                ))}
                <button onClick={() => doAdd(dest, null)} disabled={adding} className={dayRow}>
                  <span className="text-drift-muted">Unscheduled</span>
                  <span className="text-[19px] leading-none text-drift-coral">+</span>
                </button>
              </div>
              {error && <p className="mt-3 text-[13px] font-medium text-drift-coral">{error}</p>}
              {adding && <p className="mt-3 text-[13px] text-drift-text-tertiary">Adding…</p>}
            </>
          )}
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

// Rich vertical media card (Mindtrip-parity): hero photo → name → amber-star
// rating → chips (price/category) → description → dual CTAs. Adapts per source
// since coverage differs (events have no rating; stays/events carry an address
// or "Venue · Date" subtitle better shown as text than a chip).
function ResultCard({
  r,
  onHover,
  onAdd,
  onOpen,
}: {
  r: DiscoverResult
  onHover: () => void
  onAdd: () => void
  onOpen: () => void
}) {
  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name)}`
  // Google-sourced places have a rich in-app detail page; vendor results deep-link out.
  const detailHref =
    r.source === "google" && !r.id.startsWith("osm:") && !r.id.startsWith("geonames:")
      ? `/app/place/${encodeURIComponent(r.id)}`
      : null
  const hasRating = r.rating != null && r.rating > 0
  const sub = r.subtitle?.trim() ?? ""
  // subtitle is a type slug ("tourist_attraction") / duration ("2 hours") for
  // google+viator → humanize it (a clean chip when short, else a muted line —
  // NOT raw snake_case); a street address or "Venue · Date" for stays/events →
  // show raw as a text line.
  const isSlug = r.source === "google" || r.source === "viator"
  const asChip = sub.length > 0 && sub.length <= 22 && isSlug
  const metaText = sub.length > 0 && !asChip ? (isSlug ? humanize(sub) : sub) : ""
  const book = safeHttpUrl(r.bookingUrl)

  const hero = r.photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={r.photo} alt="" loading="lazy" className="h-[132px] w-full object-cover" />
  ) : (
    <div className="h-[132px] w-full" style={{ background: "linear-gradient(135deg,#16222F,#0B1A25)" }} />
  )

  const ctaBase = "flex-1 rounded-full px-3 py-1.5 text-center text-[12.5px]"
  return (
    <div
      onMouseEnter={onHover}
      className="overflow-hidden rounded-2xl border border-aurora-border bg-aurora-glass transition-all duration-150 hover:-translate-y-0.5 hover:border-drift-coral/40 hover:shadow-[0_14px_34px_-18px_rgba(0,0,0,0.5)]"
    >
      <div className="relative">
        <button onClick={onOpen} className="block w-full" aria-label={`View ${r.name}`}>
          {hero}
        </button>
        {/* Add-to-itinerary — same flow as mobile; opens the trip/day picker. */}
        <button
          onClick={onAdd}
          aria-label="Add to a trip"
          className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-drift-coral text-white shadow-[0_4px_12px_-2px_rgba(0,0,0,0.5)] transition-transform hover:scale-105"
        >
          <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] fill-current">
            <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z" />
          </svg>
        </button>
      </div>
      <div className="p-3">
        <button
          onClick={onOpen}
          className="block text-left text-[15px] font-semibold leading-snug line-clamp-2 hover:text-drift-coral"
        >
          {r.name}
        </button>

        {hasRating && (
          <div className="mt-1.5 flex items-center gap-1 text-[12.5px]">
            <span style={{ color: "#E7A24B" }}>★</span>
            <span className="font-semibold text-drift-ink">{r.rating!.toFixed(1)}</span>
            {r.reviewCount ? (
              <span className="text-drift-text-tertiary">({compact(r.reviewCount)})</span>
            ) : null}
          </div>
        )}

        {metaText && <p className="mt-1 truncate text-[12px] text-drift-muted">{metaText}</p>}

        {(r.priceLabel || asChip) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {r.priceLabel && (
              <span className="rounded-full border border-aurora-border bg-aurora-glass2 px-2 py-0.5 text-[10.5px] font-semibold text-drift-ink">
                {r.priceLabel}
              </span>
            )}
            {asChip && (
              <span className="rounded-full border border-aurora-border bg-aurora-glass2 px-2 py-0.5 text-[10.5px] font-semibold text-drift-muted">
                {humanize(sub)}
              </span>
            )}
          </div>
        )}

        {r.description && (
          <p className="mt-2 text-[11.5px] leading-relaxed text-drift-text-tertiary line-clamp-2">
            {r.description}
          </p>
        )}

        <div className="mt-3 flex gap-2">
          {book && (
            <a
              href={book}
              target="_blank"
              rel="noreferrer"
              className={`${ctaBase} bg-drift-coral font-semibold text-white`}
            >
              {r.source === "ticketmaster" ? "Tickets" : "Book"}
            </a>
          )}
          {detailHref ? (
            <button
              onClick={onOpen}
              className={`${ctaBase} border border-drift-divider font-medium text-drift-ink`}
            >
              Details
            </button>
          ) : (
            <a
              href={mapHref}
              target="_blank"
              rel="noreferrer"
              className={`${ctaBase} border border-drift-divider font-medium text-drift-ink`}
            >
              Map
            </a>
          )}
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

// Per-source hints for the AI blurb generator. Google's subtitle is a type slug
// (a good category); events/stays/activities get a fixed category label.
function blurbCategory(r: DiscoverResult): string | undefined {
  switch (r.source) {
    case "ticketmaster":
      return "live event"
    case "stay22":
      return "hotel or place to stay"
    case "viator":
      return "tour or activity"
    default:
      return r.subtitle ? humanize(r.subtitle) : undefined
  }
}

// Extra grounding for the blurb: the source's own meta line (an event's
// venue·date, a stay's address, an activity's duration). Google's subtitle is
// already used as the category, so nothing extra there.
function blurbContext(r: DiscoverResult): string | undefined {
  return r.source === "google" ? undefined : (r.subtitle ?? undefined)
}

