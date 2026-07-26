"use client"

import { useEffect, useState } from "react"
import { loadStays, safeHttpUrl, type DiscoverResult } from "@/lib/drift/discover"

// "Complete your trip" — the first commission surface. For each destination with
// nights but no booked stay (computed server-side and passed as `gaps`), pull
// live, commissioned Stay22 listings for that city + date window and offer a
// one-tap "Book". Drift earns affiliate commission on the booking; the URL's
// affiliate tag is baked in upstream by the discover-stays edge fn. Per Stay22
// ToS: live fetch only (no caching of listings), and no OTA logos are rendered.

export interface StayGap {
  destId: string
  label: string
  country: string | null
  lat: number
  lng: number
  checkIn: string // YYYY-MM-DD
  checkOut: string // YYYY-MM-DD
  nights: number
}

export default function CompleteYourTrip({ gaps }: { gaps: StayGap[] }) {
  const [byDest, setByDest] = useState<Record<string, DiscoverResult[]>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!gaps.length) {
      setLoaded(true)
      return
    }
    let alive = true
    Promise.all(
      gaps.map((g) =>
        loadStays(
          { lat: g.lat, lng: g.lng },
          { checkIn: g.checkIn, checkOut: g.checkOut, count: 6 }
        ).then((r) => [g.destId, r] as const)
      )
    ).then((entries) => {
      if (!alive) return
      const map: Record<string, DiscoverResult[]> = {}
      for (const [id, r] of entries) if (r.length) map[id] = r.slice(0, 6)
      setByDest(map)
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [gaps])

  // Render nothing until we know there's real inventory — avoids a header that
  // flashes then vanishes when a gap returns no stays.
  const withStays = gaps.filter((g) => byDest[g.destId]?.length)
  if (!loaded || !withStays.length) return null

  return (
    <section className="mt-7">
      <h2 className="font-drift-display text-[22px] font-semibold tracking-tight">
        Complete your trip
      </h2>
      <p className="mt-0.5 text-[13px] text-drift-muted">
        You haven&apos;t booked a place to stay for these nights yet.
      </p>
      <div className="mt-3.5 space-y-5">
        {withStays.map((g) => (
          <div key={g.destId}>
            <div className="mb-2 flex items-center gap-1.5 text-[13.5px]">
              <span className="font-semibold text-drift-ink">{g.label}</span>
              <span className="text-drift-text-tertiary">
                · {g.nights} night{g.nights === 1 ? "" : "s"} · {fmtRange(g.checkIn, g.checkOut)}
              </span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {byDest[g.destId].map((s) => (
                <StayCard key={s.id} stay={s} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function StayCard({ stay }: { stay: DiscoverResult }) {
  const url = safeHttpUrl(stay.bookingUrl)
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      className="block w-[186px] shrink-0 overflow-hidden rounded-2xl border border-aurora-border bg-aurora-glass transition-transform hover:-translate-y-0.5"
    >
      {stay.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={stay.photo} alt="" loading="lazy" className="h-[112px] w-full object-cover" />
      ) : (
        <div
          className="h-[112px] w-full"
          style={{ background: "linear-gradient(135deg,#16222F,#0B1A25)" }}
        />
      )}
      <div className="p-2.5">
        <div className="truncate text-[13.5px] font-semibold leading-tight text-drift-ink">
          {stay.name}
        </div>
        {stay.rating != null && stay.rating > 0 && (
          <div className="mt-1 flex items-center gap-1 text-[12px]">
            <span style={{ color: "#E7A24B" }}>★</span>
            <span className="font-semibold text-drift-ink">{stay.rating.toFixed(1)}</span>
            {stay.reviewCount ? (
              <span className="text-drift-text-tertiary">({stay.reviewCount.toLocaleString()})</span>
            ) : null}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="truncate text-[12.5px] font-semibold text-drift-ink">
            {stay.priceLabel ?? "See rates"}
          </span>
          <span className="shrink-0 rounded-full bg-drift-coral px-2.5 py-1 text-[11.5px] font-semibold text-white">
            Book
          </span>
        </div>
      </div>
    </a>
  )
}

// "Aug 6 – 10" (same month) or "Aug 30 – Sep 2" — dates are UTC date-only.
function fmtRange(checkIn: string, checkOut: string): string {
  const d = (iso: string) => {
    const [y, m, day] = iso.split("-").map(Number)
    return new Date(Date.UTC(y, m - 1, day))
  }
  const a = d(checkIn)
  const b = d(checkOut)
  const mo = (dt: Date) => dt.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })
  const day = (dt: Date) => dt.getUTCDate()
  return mo(a) === mo(b)
    ? `${mo(a)} ${day(a)} – ${day(b)}`
    : `${mo(a)} ${day(a)} – ${mo(b)} ${day(b)}`
}
