"use client"

import dynamic from "next/dynamic"
import { useMemo } from "react"
import type { InspireSnapshot } from "@/lib/drift/inspire"
import type { TripMapPoint } from "@/components/app/trip/TripMap"

// Mapbox + its CSS is ~700kB. A static import puts every byte of it in the
// route's first load whether or not the map is ever opened, so it stays lazy
// and client-only — the repo's standing perf rule.
const TripMap = dynamic(() => import("@/components/app/trip/TripMap"), { ssr: false })

/**
 * A guide's geography — stops AND the places inside them.
 *
 * ONE IMPLEMENTATION OF "WHAT GOES ON THE MAP", shared by the signed-in guide
 * and the public `/i/<slug>` page, and mirroring `InspireMapPoint.build` on
 * iOS. Three surfaces deciding separately which rows deserve a pin is three
 * chances to disagree about what the trip contains.
 *
 * WHY THE PLACES ARE HERE. Pinning only the destinations draws a trip's
 * SKELETON and hides its CONTENT: a guide whose headline says "6 places" drew
 * three pins, and the cove, the cave restaurant and the basilica — the reasons
 * to go — existed only in prose.
 *
 * The two ranks are drawn differently by `TripMap` (numbered teal stops, small
 * indigo places) and only the stops carry the route line between them. Without
 * that separation a café and a city read as the same kind of thing, and the
 * route becomes a scribble implying the traveller drove between restaurants.
 */
export default function GuideMap({
  snapshot,
  className,
  onExpand,
}: {
  snapshot: InspireSnapshot
  className?: string
  onExpand?: () => void
}) {
  const points = useMemo(() => buildPoints(snapshot), [snapshot])
  if (points.length === 0) return null
  return <TripMap points={points} className={className} onExpand={onExpand} />
}

/** (0, 0) is the Atlantic, and it is what an unset coordinate pair parses to. A
 *  pin there is not a location, it is a bug on display. */
function usable(lat: number | null, lng: number | null): lat is number {
  return lat !== null && lng !== null && !(lat === 0 && lng === 0)
}

export function buildPoints(s: InspireSnapshot): TripMapPoint[] {
  const dests = [...s.destinations].sort((a, b) => a.day_offset - b.day_offset)
  const out: TripMapPoint[] = []

  dests.forEach((dest, i) => {
    const n = i + 1
    if (usable(dest.latitude, dest.longitude)) {
      out.push({
        id: dest.ref || `d${n}`,
        lat: dest.latitude,
        lng: dest.longitude as number,
        label: dest.name ?? dest.city ?? `Stop ${n}`,
        n,
        rank: "stop",
      })
    }
    const mine = s.items
      .filter((it) => it.destination_ref === dest.ref && it.step_type !== "note")
      .sort((a, b) => a.day_offset - b.day_offset)
    for (const it of mine) {
      if (!usable(it.latitude, it.longitude)) continue
      out.push({
        id: it.source_step_id ?? `${dest.ref}-${it.title ?? ""}-${it.day_offset}`,
        lat: it.latitude,
        lng: it.longitude as number,
        label: it.title ?? it.location_name ?? "",
        n,
        rank: "place",
      })
    }
  })

  return out
}
