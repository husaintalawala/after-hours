"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { resolvePlace, placePhotoUrl } from "@/lib/drift/chat"
import type { GlobeTripPin } from "@/components/app/GlobeHero"

// mapbox-gl is ~1.7MB of JS — load it after the shell paints instead of
// blocking first render.
const GlobeHero = dynamic(() => import("@/components/app/GlobeHero"), {
  ssr: false,
  loading: () => <div className="h-full w-full" style={{ background: "rgb(4,4,8)" }} />,
})
import SignOutButton from "@/components/app/SignOutButton"
import OptimizedImg from "@/components/app/OptimizedImg"
import { countryFlagEmoji } from "@/lib/drift/flags"

// Logged-in home. The globe is the room: it fills the entire viewport on
// every breakpoint. Desktop (lg+) floats a glass trip rail on the left —
// hovering a trip flies the planet to it — plus an Ask Drift pill bottom-
// right. Mobile keeps the iOS sheet-over-globe layout.

export interface HomeTrip {
  id: string
  title: string
  cover: string | null
  city: string | null
  country: string | null
  startDate: string | null
  dateLabel: string
  isActive: boolean
}

export interface HomeData {
  displayName: string
  username: string | null
  avatarUrl: string | null
  countries: number
  followers: number
  following: number
  pins: GlobeTripPin[]
  featured: HomeTrip | null
  featuredHeader: { title: string; subtitle: string } | null
  others: HomeTrip[]
}

export default function HomeShell({ data }: { data: HomeData }) {
  const [focusTripId, setFocusTripId] = useState<string | null>(null)
  const allTrips = [
    ...(data.featured ? [data.featured] : []),
    ...data.others,
  ]

  return (
    <div className="relative">
      {/* The globe owns the whole viewport */}
      <div className="fixed inset-0">
        <GlobeHero pins={data.pins} focusTripId={focusTripId} />
      </div>

      {/* ---------- Desktop: floating glass trip rail ---------- */}
      <aside className="fixed bottom-8 left-6 top-[76px] z-10 hidden w-[380px] flex-col overflow-hidden rounded-[26px] border border-white/40 bg-aurora-glass/95 shadow-aurora-glow lg:flex">
        <div className="overflow-y-auto p-6 [-ms-overflow-style:none] [scrollbar-width:thin]">
          {/* Header */}
          <div className="flex items-center gap-3.5">
            <Avatar url={data.avatarUrl} name={data.displayName} size={56} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-drift-display text-[22px] font-bold leading-tight">
                {data.displayName}
              </p>
              {data.username && (
                <p className="truncate text-[12px] text-drift-muted">
                  @{data.username}
                </p>
              )}
            </div>
            <SignOutButton />
          </div>

          {/* Stats */}
          <div className="mt-5 flex gap-7 border-b border-drift-divider pb-4">
            <Stat value={data.countries} label="Countries" href="/app/countries" />
            <Stat value={data.followers} label="Followers" href="/app/people?tab=followers" />
            <Stat value={data.following} label="Following" href="/app/people?tab=following" />
          </div>

          {/* Plan CTA */}
          <Link
            href="/app/trips/new"
            className="mt-4 flex h-12 items-center justify-center rounded-full bg-drift-coral text-[15px] font-semibold text-white shadow-md shadow-drift-coral/25 transition-transform hover:scale-[1.01]"
          >
            Plan a new trip
          </Link>

          {/* Featured */}
          {data.featured && data.featuredHeader && (
            <>
              <div className="mt-6 flex items-baseline gap-2">
                <h2 className="font-drift-display text-[19px] font-bold">
                  {data.featuredHeader.title}
                </h2>
                <span className="text-[12px] font-semibold text-drift-muted">
                  {data.featuredHeader.subtitle}
                </span>
              </div>
              <FeaturedCard
                trip={data.featured}
                onHover={() => setFocusTripId(data.featured!.id)}
              />
            </>
          )}

          {/* Trip rows */}
          {data.others.length > 0 && (
            <>
              <h2 className="mt-6 font-drift-display text-[19px] font-bold">
                Other trips
              </h2>
              <ul className="mt-2 space-y-1">
                {data.others.map((t) => (
                  <TripRow
                    key={t.id}
                    trip={t}
                    onHover={() => setFocusTripId(t.id)}
                  />
                ))}
              </ul>
            </>
          )}

          {allTrips.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-3xl opacity-30">🗺</p>
              <p className="mt-2 text-[14px] text-drift-muted">
                No trips yet — plan your first one.
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* Ask Drift pill — generic entry to chat (was "Ask Drift about <next
          trip>", which read as confusing on the home globe). Sits above the
          globe's bottom-right +/- zoom controls so neither is obscured. */}
      <Link
        href="/app/chats"
        className="fixed bottom-24 right-6 z-10 hidden items-center gap-2.5 rounded-full border border-white/40 bg-aurora-glass py-3 pl-4 pr-5 shadow-aurora-glow transition-transform hover:scale-[1.02] lg:flex"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-drift-coral text-[15px] text-white">
          ✦
        </span>
        <span className="text-[14.5px] font-medium text-drift-ink">Ask Drift</span>
      </Link>

      {/* ---------- Mobile: iOS sheet-over-globe ---------- */}
      <div className="relative z-10 mt-[44vh] rounded-t-[28px] bg-aurora-glass pb-28 shadow-[0_-8px_30px_rgba(0,0,0,0.25)] lg:hidden">
        <div className="mx-auto w-full max-w-2xl px-5">
          <div className="flex justify-center pt-3">
            <div className="h-1 w-9 rounded-full bg-drift-divider" />
          </div>

          <div className="mt-4 flex items-center gap-4">
            <Avatar url={data.avatarUrl} name={data.displayName} size={64} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-drift-display text-[28px] font-bold leading-tight">
                {data.displayName}
              </p>
              {data.username && (
                <p className="text-[12px] text-drift-muted">@{data.username}</p>
              )}
            </div>
            <SignOutButton />
          </div>

          <div className="mt-4 flex gap-8 border-b border-drift-divider pb-4">
            <Stat value={data.countries} label="Countries" href="/app/countries" />
            <Stat value={data.followers} label="Followers" href="/app/people?tab=followers" />
            <Stat value={data.following} label="Following" href="/app/people?tab=following" />
          </div>

          {data.featured && data.featuredHeader && (
            <>
              <div className="mt-6 flex items-baseline gap-2">
                <h2 className="font-drift-display text-[22px] font-bold">
                  {data.featuredHeader.title}
                </h2>
                <span className="text-[13px] font-semibold text-drift-muted">
                  {data.featuredHeader.subtitle}
                </span>
              </div>
              <BigCard trip={data.featured} className="mt-3" />
            </>
          )}

          {data.others.length > 0 && (
            <>
              <h2 className="mt-8 font-drift-display text-[22px] font-bold">
                Other trips
              </h2>
              <div className="mt-3 space-y-4">
                {data.others.map((t) => (
                  <BigCard key={t.id} trip={t} />
                ))}
              </div>
            </>
          )}

          {allTrips.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-4xl opacity-30">🗺</p>
              <p className="mt-3 text-[15px] text-drift-muted">No trips yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Avatar({
  url,
  name,
  size,
}: {
  url: string | null
  name: string
  size: number
}) {
  const style = { width: size, height: size }
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      style={style}
      className="rounded-full object-cover ring-2 ring-drift-coral/70"
    />
  ) : (
    <div
      style={style}
      className="flex items-center justify-center rounded-full bg-drift-coral-50 font-drift-display text-xl font-bold text-drift-coral ring-2 ring-drift-coral/70"
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  )
}

function Stat({ value, label, href }: { value: number; label: string; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-drift-coral/50"
    >
      <p className="text-[19px] font-bold leading-tight">{value}</p>
      <p className="text-[12px] text-drift-muted">{label}</p>
    </Link>
  )
}

// Desktop featured card — compact 150px cover with overlay.
function FeaturedCard({ trip, onHover }: { trip: HomeTrip; onHover: () => void }) {
  return (
    <Link
      href={`/app/trips/${trip.id}`}
      onMouseEnter={onHover}
      className="relative mt-2.5 block h-[150px] overflow-hidden rounded-2xl"
    >
      <CardCover trip={trip} />
      {trip.isActive && (
        <span className="absolute left-3 top-3 rounded-full bg-drift-coral px-2.5 py-1 text-[10px] font-bold tracking-wide text-white">
          NOW TRAVELING
        </span>
      )}
      <CardCaption trip={trip} />
    </Link>
  )
}

// Desktop compact row: thumbnail + title + dates + flag. Hover flies the globe.
function TripRow({ trip, onHover }: { trip: HomeTrip; onHover: () => void }) {
  const flag = countryFlagEmoji(trip.country)
  const cover = useTripCover(trip)
  return (
    <li>
      <Link
        href={`/app/trips/${trip.id}`}
        onMouseEnter={onHover}
        className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-drift-alt-bg"
      >
        {trip.cover ? (
          <OptimizedImg
            src={trip.cover}
            width={96}
            height={96}
            sizes="48px"
            className="h-12 w-12 shrink-0 rounded-xl object-cover"
          />
        ) : cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            loading="lazy"
            className="h-12 w-12 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div
            className="h-12 w-12 shrink-0 rounded-xl"
            style={{ background: "linear-gradient(135deg,#16222F,#0B1A25)" }}
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold">{trip.title}</p>
          <p className="truncate text-[12px] text-drift-muted">{trip.dateLabel}</p>
        </div>
        {flag && <span className="text-[17px]">{flag}</span>}
      </Link>
    </li>
  )
}

// Mobile 220px full-bleed cover card (same recipe as iOS staticTripCard).
function BigCard({ trip, className = "" }: { trip: HomeTrip; className?: string }) {
  const flag = countryFlagEmoji(trip.country)
  return (
    <Link
      href={`/app/trips/${trip.id}`}
      className={`relative block h-[220px] overflow-hidden rounded-[14px] ${className}`}
    >
      <CardCover trip={trip} />
      {flag && (
        <span className="absolute right-2.5 top-2.5 text-[20px] drop-shadow">{flag}</span>
      )}
      {trip.isActive && (
        <span className="absolute left-3 top-3 rounded-full bg-drift-coral px-2.5 py-1 text-[10px] font-bold tracking-wide text-white">
          NOW TRAVELING
        </span>
      )}
      <CardCaption trip={trip} />
    </Link>
  )
}

// Lazy trip cover. Trips usually lack cover_url/media, so — mirroring the
// destination-hero resolver in TripTabs — we resolve the lead city's photo on
// the client after mount and fill it in over the gradient. No SSR photo lookup
// on the critical path (that was the perf regression). Returns a stored cover
// immediately when present.
function useTripCover(trip: HomeTrip): string | null {
  const [lazy, setLazy] = useState<string | null>(null)
  useEffect(() => {
    const city = trip.city
    if (trip.cover || !city) return
    let cancelled = false
    ;(async () => {
      const cand = await resolvePlace(city, city, trip.country ?? undefined)
      if (!cancelled) setLazy(placePhotoUrl(cand, 800))
    })()
    return () => {
      cancelled = true
    }
  }, [trip.cover, trip.city, trip.country])
  return trip.cover ?? lazy
}

function CardCover({ trip }: { trip: HomeTrip }) {
  const cover = useTripCover(trip)
  return (
    <>
      {trip.cover ? (
        <OptimizedImg
          src={trip.cover}
          fill
          sizes="(max-width: 1024px) 100vw, 420px"
          className="object-cover"
        />
      ) : cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(135deg,#16222F,#0B1A25)" }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to bottom, transparent 45%, rgba(0,0,0,0.65))" }}
      />
    </>
  )
}

function CardCaption({ trip }: { trip: HomeTrip }) {
  return (
    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
      <p className="font-drift-display text-[17px] font-bold leading-snug text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
        {trip.title}
      </p>
      <p className="shrink-0 text-[11px] text-white/70 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
        {trip.dateLabel}
      </p>
    </div>
  )
}
