"use client"

import dynamic from "next/dynamic"
import type { GlobeTripPin } from "@/components/app/GlobeHero"

// mapbox-gl is ~1.7MB — lazy and client-only, the same rule every other globe
// on the site follows. The placeholder is the night ground rather than a card
// fill, because here it is a whole column and a grey box would read as a
// failure rather than as a load.
const GlobeHero = dynamic(() => import("@/components/app/GlobeHero"), {
  ssr: false,
  loading: () => <div className="h-full w-full" style={{ background: "rgb(4,4,8)" }} />,
})

/**
 * The planet beside the archive.
 *
 * A CLIENT ISLAND, because /app/trips is a server component and GlobeHero
 * cannot be — it needs `ssr: false`. Keeping the boundary here rather than
 * turning the whole page into a client component means the trip list, its
 * grouping and its covers all still render on the server.
 *
 * LAPTOP ONLY, and the caller enforces that by not rendering this below `lg`.
 * A 1.7MB map behind a phone's single scrolling column would be a download
 * spent on something nobody can see beside the thing they came for.
 */
export default function TripsGlobePane({ pins }: { pins: GlobeTripPin[] }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-aurora-midnight">
      <GlobeHero pins={pins} focusTripId={null} zoom={1.15} />

      {/* A soft edge where the planet meets the list, so the two columns read
          as one surface rather than as a seam. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-aurora-midnight to-transparent"
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-6">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-white/55">
          {pins.length === 0
            ? "No trips pinned yet"
            : `${pins.length} ${pins.length === 1 ? "trip" : "trips"} pinned`}
        </p>
      </div>
    </div>
  )
}
