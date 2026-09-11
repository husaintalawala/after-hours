"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Section, RailOrGrid } from "@/components/app/home/HomeSection"
import { loadCategory, type DiscoverAnchor, type DiscoverResult } from "@/lib/drift/discover"

/**
 * "Near <somewhere>" — a rail of real places, fetched AFTER the page paints.
 *
 * CLIENT-SIDE ON PURPOSE, and this is the one decision in the file that
 * matters. loadCategory goes out to Google via the same-origin proxies, and
 * this app has already been bitten once by awaiting that kind of lookup during
 * server render: the home spent its first byte waiting on place resolution and
 * the fix was stored covers plus a lazy client resolve. Fetching here on the
 * server would reintroduce exactly that, on the page with the strictest budget
 * in the product.
 *
 * So the shell renders immediately with the rest of the home, the request goes
 * out on mount, and the rail fills in. If it returns nothing the whole section
 * removes itself rather than leaving a titled empty band — a heading with no
 * content under it is the "dead gap" this redesign exists to delete.
 */
export default function DiscoverRail({ anchor }: { anchor: DiscoverAnchor }) {
  const [places, setPlaces] = useState<DiscoverResult[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    loadCategory("forYou", anchor)
      .then((r) => {
        if (live) setPlaces(r.slice(0, 10))
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    // The anchor is derived per render from the featured trip, so depend on its
    // VALUES rather than the object identity — otherwise this refetches on
    // every parent render.
    return () => {
      live = false
    }
  }, [anchor.label, anchor.lat, anchor.lng, anchor.country])

  // Nothing came back, or the lookup failed. Either way there is no band.
  if (failed || (places !== null && places.length === 0)) return null

  return (
    <Section
      title={anchor.label ? `Near ${anchor.label}` : "Discover"}
      action="Explore"
      actionHref="/app/discover"
    >
      {/* auto-fill, NOT a fixed eight. Discover returns whatever is actually
          near you — New York gives eight, a quiet town gives three — and a
          fixed eight-column grid renders three cards stretched across a third
          of the page each. auto-fill keeps the track width and simply leaves
          the unused tracks empty, so a short result reads as a short result. */}
      <RailOrGrid cols="lg:grid-cols-[repeat(auto-fill,minmax(168px,1fr))]">
        {places === null
          ? // Placeholders at the real card size, so the rail does not resize
            // under the reader's thumb when the answer lands.
            Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-[152px] w-[132px] shrink-0 animate-pulse rounded-card border border-aurora-border bg-aurora-glass lg:h-[168px] lg:w-auto"
              />
            ))
          : places.map((p) => <PlaceCard key={p.id} place={p} />)}
      </RailOrGrid>
    </Section>
  )
}

function PlaceCard({ place }: { place: DiscoverResult }) {
  return (
    <Link
      href={`/app/place/${encodeURIComponent(place.id)}`}
      className="group relative block h-[152px] w-[132px] shrink-0 overflow-hidden rounded-card border border-aurora-border outline-none focus-visible:ring-2 focus-visible:ring-aurora-teal/60 lg:h-[168px] lg:w-auto"
    >
      {place.photo ? (
        // A PLAIN <img>, never next/image. These are Google Place Photos served
        // through the maps-photo proxy, and Places ToS §3.2.3 forbids
        // re-hosting or caching those bytes — which is exactly what Vercel's
        // image optimizer would do.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={place.photo}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-aurora-glass2" />
      )}

      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.05) 42%, rgba(0,0,0,0.76))" }}
      />

      <div className="absolute inset-x-0 bottom-0 p-2.5">
        <p className="line-clamp-2 font-drift-display text-[13px] font-bold leading-[1.15] text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
          {place.name}
        </p>
        {place.rating != null && (
          <p className="mt-1 flex items-center gap-1 text-[10.5px] font-semibold text-white/85">
            {/* Amber is the rating colour and is NOT the accent — it is the one
                warm mark the Aurora palette keeps for exactly this. */}
            <span className="text-[#E0A03A]">★</span>
            {place.rating.toFixed(1)}
          </p>
        )}
      </div>
    </Link>
  )
}
