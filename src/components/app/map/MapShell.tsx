"use client"

import Link from "next/link"
import dynamic from "next/dynamic"
import type { GlobeTripPin } from "@/components/app/GlobeHero"

// mapbox-gl is ~1.7MB — lazy and client-only, same as everywhere else it
// appears. Here it is the whole point of the page, so the placeholder is the
// night ground rather than a card fill.
const GlobeHero = dynamic(() => import("@/components/app/GlobeHero"), {
  ssr: false,
  loading: () => <div className="h-full w-full" style={{ background: "rgb(4,4,8)" }} />,
})

/**
 * The globe, full screen — the 3D planet with your trips on it as cover-photo
 * pins.
 *
 * WHY THIS ROUTE EXISTS. "Open the globe" used to land on /app/countries, which
 * is a flat choropleth with two stat tiles and a Visited / Not-yet legend. That
 * page is a good page and it is not this one: it answers "how much of the world
 * have I coloured in", while the thing people mean by Drift's globe is the
 * planet with their own photographs stuck to it.
 *
 * The component was never missing. GlobeHero has drawn circular cover-photo
 * markers on a `projection: "globe"` map the whole time — it was the home's
 * full-bleed background until the redesign contained it. The only thing wrong
 * was where the passport pointed.
 *
 * The stats are not deleted, they are demoted: a strip under the planet, one
 * tap away, which is the right rank for a number about a map you are already
 * looking at.
 */
export default function MapShell({
  pins,
  countries,
}: {
  pins: GlobeTripPin[]
  countries: number
}) {
  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-aurora-midnight">
      {/* THE PLANET. `absolute inset-0` inside a fixed-height, overflow-hidden
          box — not `fixed`, which is what made the old home's globe bleed
          through every band on the page. Here it genuinely is the whole
          screen, so it fills its container rather than escaping one. */}
      <div className="absolute inset-0">
        <GlobeHero pins={pins} focusTripId={null} zoom={1.35} />
      </div>

      {/* Top gradient so the title reads over whatever hemisphere is facing. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-aurora-midnight/85 to-transparent"
      />

      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-5 lg:px-10">
        <div>
          <h1 className="font-drift-display text-[22px] font-bold tracking-[-0.02em] text-white lg:text-[26px]">
            Your world
          </h1>
          <p className="mt-0.5 font-mono text-[11px] text-white/70">
            {pins.length === 0
              ? "No trips pinned yet"
              : `${pins.length} ${pins.length === 1 ? "trip" : "trips"} pinned`}
          </p>
        </div>
      </div>

      {/* The stats, demoted. Bottom strip, above the dock — one tap to the
          choropleth for anyone who wants the percentage. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-aurora-midnight/90 to-transparent"
        />
        <div className="px-5 lg:px-10">
          <Link
            href="/app/countries"
            className="pointer-events-auto flex items-center justify-between gap-4 rounded-card border border-aurora-border bg-aurora-glass/90 px-4 py-3 backdrop-blur-xl transition-colors hover:border-aurora-border-strong lg:max-w-[420px]"
          >
            <div>
              <p className="text-[13px] font-semibold text-aurora-ink">
                {countries} {countries === 1 ? "country" : "countries"} visited
              </p>
              <p className="mt-0.5 text-[11.5px] text-aurora-ink3">
                See the map coloured in
              </p>
            </div>
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0 text-aurora-ink3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  )
}
