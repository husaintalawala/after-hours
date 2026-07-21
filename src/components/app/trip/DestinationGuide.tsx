"use client"

import { useEffect, useRef, useState } from "react"
import { resolvePlaceCandidates, placePhotoUrl, type PlaceCandidate } from "@/lib/drift/chat"

// The destination Overview guide (web slice of DestinationOverviewGuide):
// "Top things to do" polaroid rail (shared POI cache) + "Tours & tickets"
// (Viator, bookable). Fetched lazily when the guide opens.

interface Tour {
  id: string
  name: string
  photoUrl?: string | null
  priceLabel?: string | null
  rating?: number | null
  bookingUrl?: string | null
}

export default function DestinationGuide({
  label,
  country,
  lat,
  lng,
}: {
  label: string
  country: string | null
  lat: number | null
  lng: number | null
}) {
  const [things, setThings] = useState<PlaceCandidate[] | null>(null)
  const [tours, setTours] = useState<Tour[] | null>(null)
  const loaded = useRef<string | null>(null)

  useEffect(() => {
    if (loaded.current === label) return
    loaded.current = label
    setThings(null)
    setTours(null)
    resolvePlaceCandidates("top attractions", label, country ?? undefined).then((cs) =>
      setThings(cs.filter((c) => placePhotoUrl(c)).slice(0, 8))
    )
    fetch("/api/drift/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "activities",
        destinationName: label,
        lat: lat ?? undefined,
        lng: lng ?? undefined,
        count: 8,
      }),
    })
      .then((r) => (r.ok ? r.json() : { candidates: [] }))
      .then((j) => setTours((j.candidates ?? []).slice(0, 8)))
      .catch(() => setTours([]))
  }, [label, country, lat, lng])

  return (
    <div className="space-y-7">
      {/* Top things to do — polaroid rail */}
      <section>
        <h3 className="font-drift-display text-[22px] font-semibold">Top things to do</h3>
        {things === null ? (
          <GuideSkeleton />
        ) : things.length === 0 ? (
          <p className="mt-2 text-[14px] text-drift-text-tertiary">
            Nothing here yet — ask Drift what&rsquo;s worth seeing.
          </p>
        ) : (
          <div className="mt-3 flex gap-3.5 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {things.map((c) => (
              <div
                key={c.id}
                className="relative h-[210px] w-[150px] shrink-0 overflow-hidden rounded-2xl shadow-[0_10px_26px_-14px_rgba(31,31,36,0.4)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={placePhotoUrl(c, 480)!}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <span className="absolute left-2 top-2 max-w-[85%] rounded-lg bg-[#E09A3C] px-2 py-1 text-[10.5px] font-bold uppercase leading-tight tracking-wide text-white shadow">
                  {c.name}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Tours & tickets — Viator, bookable */}
      <section>
        <h3 className="font-drift-display text-[22px] font-semibold">Tours &amp; tickets</h3>
        {tours === null ? (
          <GuideSkeleton />
        ) : tours.length === 0 ? (
          <p className="mt-2 text-[14px] text-drift-text-tertiary">
            No bookable tours found for {label}.
          </p>
        ) : (
          <div className="mt-3 flex gap-3.5 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tours.map((t) => (
              <div
                key={t.id}
                className="w-[210px] shrink-0 overflow-hidden rounded-2xl border border-[#EBE7E1] bg-white"
              >
                <div className="h-[120px] bg-drift-alt-bg">
                  {t.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.photoUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="p-3">
                  <p className="line-clamp-2 text-[13.5px] font-semibold leading-snug">
                    {t.name}
                  </p>
                  <p className="mt-1 text-[12px] text-drift-muted">
                    {[
                      t.rating != null && t.rating > 0 ? `★ ${t.rating.toFixed(1)}` : null,
                      t.priceLabel,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {t.bookingUrl && (
                    <a
                      href={t.bookingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block rounded-full bg-drift-coral px-3 py-1.5 text-[12px] font-semibold text-white"
                    >
                      Book
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function GuideSkeleton() {
  return (
    <div className="mt-3 flex gap-3.5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[180px] w-[150px] animate-pulse rounded-2xl bg-[#F3F0EA]" />
      ))}
    </div>
  )
}
