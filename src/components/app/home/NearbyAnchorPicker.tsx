"use client"

import { useEffect, useRef, useState } from "react"
import { resolvePlaceCandidates } from "@/lib/drift/chat"
import {
  recentAnchors,
  rememberAnchor,
  reverseGeocodeHere,
  type DiscoverAnchor,
} from "@/lib/drift/discover"

/**
 * "Near Upper East Side ▾" — the heading is the control.
 *
 * WHY THIS EXISTS SEPARATELY from the Discover page's own LocationPicker: that
 * one is a thousand lines into DiscoverShell and groups its suggestions by TRIP
 * (Traveling now / Upcoming / Past trips), which is the right list when you have
 * gone to Discover to plan something. The home rail answers a smaller question —
 * "somewhere else, right now" — and the two share the thing that matters, which
 * is the recents store, not the markup.
 *
 * THE PROMPT LIVES HERE, and only here. The rail itself never raises a
 * permission sheet: it reads `permissions.query` and uses the device only when
 * the answer is already "granted". A sheet thrown at somebody who just opened
 * their home screen is how a site teaches people to press Never Allow, and that
 * is permanent. "Use my location" is a deliberate tap, which is the one moment
 * a browser prompt is fair.
 */
export default function NearbyAnchorPicker({
  anchor,
  userId,
  onSelect,
}: {
  anchor: DiscoverAnchor
  /** Scopes the recents. See recentAnchors — device-wide keys have leaked
   *  between accounts in this app twice already. */
  userId: string | null
  onSelect: (a: DiscoverAnchor) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [busy, setBusy] = useState<"none" | "locating" | "searching">("none")
  const [denied, setDenied] = useState(false)
  const [results, setResults] = useState<DiscoverAnchor[]>([])
  const [recents, setRecents] = useState<DiscoverAnchor[]>([])
  const ref = useRef<HTMLDivElement>(null)

  // Read on OPEN rather than on mount: localStorage is not reactive, and the
  // Discover page writes to the same store, so a list read once at mount goes
  // stale the moment the reader comes back from there.
  useEffect(() => {
    if (open) setRecents(recentAnchors(userId).filter((r) => r.label !== anchor.label))
  }, [open, userId, anchor.label])

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

  function choose(a: DiscoverAnchor) {
    rememberAnchor(userId, a)
    onSelect(a)
    setOpen(false)
    setSearch("")
    setResults([])
  }

  function useMyLocation() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setDenied(true)
      return
    }
    setBusy("locating")
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        const { label, country } = await reverseGeocodeHere(lat, lng)
        setBusy("none")
        // "Nearby" is reverseGeocodeHere's own way of saying it failed, and
        // "Near Nearby" is not a heading.
        if (!label || label === "Nearby") {
          setDenied(true)
          return
        }
        choose({ label, country, lat, lng })
      },
      () => {
        setBusy("none")
        setDenied(true)
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    )
  }

  async function runSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = search.trim()
    if (!q || busy !== "none") return
    setBusy("searching")
    const cands = await resolvePlaceCandidates(q, q)
    setBusy("none")
    setResults(
      cands
        .filter((c) => c.latitude != null && c.longitude != null)
        .slice(0, 5)
        .map((c) => ({
          label: c.name,
          country: null,
          lat: c.latitude!,
          lng: c.longitude!,
        }))
    )
  }

  const row =
    "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13.5px] transition-colors hover:bg-white/[0.06]"

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-1 rounded-lg text-aurora-ink outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-aurora-teal/50"
      >
        <span>{anchor.label ? `Near ${anchor.label}` : "Discover"}</span>
        <svg viewBox="0 0 24 24" className="h-4 w-4 opacity-60" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a place"
          className="absolute left-0 top-[calc(100%+8px)] z-30 w-[286px] rounded-2xl border border-aurora-border bg-aurora-glass p-2 shadow-aurora-glow backdrop-blur-xl"
        >
          <form onSubmit={runSearch}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search a place"
              aria-label="Search a place"
              className="mb-1 w-full rounded-xl border border-aurora-border bg-white/[0.05] px-3 py-2 text-[13.5px] text-aurora-ink outline-none placeholder:text-aurora-ink3 focus:border-aurora-teal"
            />
          </form>

          <button type="button" onClick={useMyLocation} className={`${row} text-aurora-teal`}>
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
            </svg>
            {busy === "locating" ? "Locating…" : "Use my location"}
          </button>

          {/* Said once, plainly, and only after a tap that asked for it. The
              browser will not re-prompt after a refusal, so pretending the
              button still works would be a lie the reader can press forever. */}
          {denied && (
            <p className="px-2.5 pb-1 text-[11.5px] leading-snug text-aurora-ink3">
              Your browser is not sharing a location. Search for a place instead.
            </p>
          )}

          {results.length > 0 && (
            <>
              <p className="px-2.5 pb-0.5 pt-2 text-[10.5px] font-bold uppercase tracking-[0.11em] text-aurora-ink3">
                Results
              </p>
              {results.map((r) => (
                <button key={`${r.label}-${r.lat}`} type="button" onClick={() => choose(r)} className={`${row} text-aurora-ink`}>
                  <span className="truncate">{r.label}</span>
                </button>
              ))}
            </>
          )}

          {recents.length > 0 && results.length === 0 && (
            <>
              <p className="px-2.5 pb-0.5 pt-2 text-[10.5px] font-bold uppercase tracking-[0.11em] text-aurora-ink3">
                Recent
              </p>
              {recents.map((r) => (
                <button key={r.label} type="button" onClick={() => choose(r)} className={`${row} text-aurora-ink`}>
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 opacity-50" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                  <span className="truncate">{r.label}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
