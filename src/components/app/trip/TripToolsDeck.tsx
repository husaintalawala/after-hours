"use client"

import OptimizedImg from "@/components/app/OptimizedImg"
import { staticRouteUrl } from "@/lib/drift/staticMap"

// The trip's tools, as a deck of tiles instead of a column of rows — the web
// half of iOS's TripToolsDeck, to the same arrangement.
//
// WHAT WAS WRONG, on both platforms: Media, Notes, the map, Find bookings and
// Export were full-width rows stacked above the itinerary, so the trip's own
// content began below the fold. A row is the most expensive layout there is for
// the least information — it spends the full width to say one word and one
// number — and five of them cannot be taken in at a glance, because you cannot
// see five of them at once.
//
// The map leads and spans both columns because it is the only tool that says
// something WITHOUT being opened. Web had no trip-level map entry at all.
//
// THE MAP IS A STATIC IMAGE, NOT THE GL MAP. Mapbox GL is ~705kB and this page
// keeps it behind a lazy import for exactly that reason; a live tile on the
// landing screen would pull it into first load. One <img> from a host already
// on OptimizedImg's allow-list costs nothing.

export interface DeckCoord {
  lat: number
  lng: number
}

export function TripToolsDeck({
  coords,
  stopCount,
  notesCount,
  onMap,
  onNotes,
  children,
}: {
  coords: DeckCoord[]
  stopCount: number
  notesCount: number
  onMap: () => void
  onNotes: () => void
  /** Media / Find bookings / Export, each rendering its own tile — they own
   *  their state (file counts, scan sheets, PDF render) so they stay whole. */
  children?: React.ReactNode
}) {
  return (
    <div className="mt-3 space-y-2.5">
      <MapTile coords={coords} stopCount={stopCount} onClick={onMap} />
      <div className="grid grid-cols-2 gap-2.5">
        <TripToolTile
          tint="teal"
          title="Notes"
          value={notesCount > 0 ? String(notesCount) : null}
          caption={notesCount === 0 ? "Nothing yet" : notesCount === 1 ? "note" : "notes"}
          onClick={onNotes}
          icon={
            <>
              <path d="M4 4h13l3 3v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
              <path d="M7 9h9M7 13h9M7 17h5" />
            </>
          }
        />
        {children}
      </div>
    </div>
  )
}

function MapTile({
  coords,
  stopCount,
  onClick,
}: {
  coords: DeckCoord[]
  stopCount: number
  onClick: () => void
}) {
  const url = staticRouteUrl(coords)
  const label =
    stopCount === 0 ? "Map" : stopCount === 1 ? "1 stop on the map" : `${stopCount} stops on the map`
  return (
    <button
      onClick={onClick}
      className="relative block h-[128px] w-full overflow-hidden rounded-[20px] border border-aurora-border text-left"
    >
      {url ? (
        <OptimizedImg src={url} alt="" fill className="object-cover" />
      ) : (
        // No token, or nothing placed yet. A designed state, not a hole — the
        // iOS card used to vanish entirely on a one-stop trip, which read as a
        // bug rather than as an absence.
        <span
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, rgba(107,92,255,0.28), rgba(55,214,196,0.20))",
          }}
        />
      )}
      <span
        className="absolute inset-0"
        style={{ background: "linear-gradient(to bottom, transparent 45%, rgba(0,0,0,0.72))" }}
      />
      <span className="absolute bottom-3 left-3 flex items-center gap-1.5 text-[13px] font-semibold text-white">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
          <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" />
        </svg>
        {label}
      </span>
    </button>
  )
}

const TINTS = {
  teal: { fg: "text-aurora-teal", bg: "bg-aurora-teal/15", wash: "rgba(55,214,196,0.13)" },
  indigo: { fg: "text-aurora-indigo", bg: "bg-aurora-indigo/15", wash: "rgba(107,92,255,0.13)" },
  muted: { fg: "text-drift-text-tertiary", bg: "bg-white/5", wash: "rgba(255,255,255,0.05)" },
} as const

/** One square tool. The number is the reason a tile beats a row, so it is the
 *  biggest thing on it and the caption carries the unit. */
export function TripToolTile({
  tint = "teal",
  title,
  value,
  caption,
  icon,
  onClick,
  busy = false,
}: {
  tint?: keyof typeof TINTS
  title: string
  /** null when there is nothing to count, so an empty tool reads as an
   *  invitation rather than a zero. */
  value?: string | null
  caption: string
  icon: React.ReactNode
  onClick: () => void
  busy?: boolean
}) {
  const t = TINTS[tint]
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="relative flex min-h-[112px] flex-col items-start overflow-hidden rounded-[20px] border border-aurora-border bg-aurora-glass p-3.5 text-left transition-colors hover:border-aurora-teal/40 disabled:opacity-70"
    >
      {/* A breath of the tool's own colour so four tiles are not four grey boxes. */}
      <span
        className="pointer-events-none absolute inset-0"
        style={{ background: `linear-gradient(135deg, ${t.wash}, transparent 55%)` }}
      />
      <span
        className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${t.bg} ${t.fg}`}
      >
        {busy ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="h-[18px] w-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {icon}
          </svg>
        )}
      </span>
      <span className="relative mt-auto pt-2.5 text-[12.5px] font-semibold text-drift-muted">
        {title}
      </span>
      <span className="relative flex items-baseline gap-1.5">
        {value && (
          <span className="font-drift-display text-[24px] font-bold leading-tight text-drift-ink">
            {value}
          </span>
        )}
        <span className="truncate text-[11.5px] text-drift-text-tertiary">{caption}</span>
      </span>
    </button>
  )
}
