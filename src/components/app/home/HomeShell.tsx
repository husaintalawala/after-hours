"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import type { GlobeTripPin } from "@/components/app/GlobeHero"

// mapbox-gl is ~1.7MB of JS — load it after the shell paints instead of
// blocking first render.
const GlobeHero = dynamic(() => import("@/components/app/GlobeHero"), {
  ssr: false,
  loading: () => <div className="h-full w-full" style={{ background: "rgb(4,4,8)" }} />,
})
import SignOutButton from "@/components/app/SignOutButton"
import OptimizedImg from "@/components/app/OptimizedImg"
import TripCoverImg from "@/components/app/TripCoverImg"
import BackLink from "@/components/app/BackLink"
import FollowButton from "@/components/app/people/FollowButton"
import StartHere from "@/components/app/home/StartHere"
import type { TripCoverResult } from "@/lib/drift/tripCover"
import type { InspirePromo } from "@/lib/drift/inspirePromo"
import { countryFlagEmoji } from "@/lib/drift/flags"

// Logged-in home. The globe is the room: it fills the entire viewport on
// every breakpoint. Desktop (lg+) floats a glass trip rail on the left —
// hovering a trip flies the planet to it — plus an Ask Drift pill bottom-
// right. Mobile keeps the iOS sheet-over-globe layout.

export interface HomeTrip {
  id: string
  title: string
  /** The whole cover chain result — url, credit and placeholder together. */
  cover: TripCoverResult
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

/**
 * Whose profile this is.
 *
 * Someone else's profile used to be a separate, much thinner screen — no
 * globe, no featured trip, a flat list of links. It is the same question
 * ("what are this person's trips?") so it is now the same shell, and only the
 * genuinely owner-bound affordances are gated: sign out, settings, the plan-a-
 * trip CTA, Ask Drift, and the stat links, which point at YOUR /app/people
 * tabs and would silently mislead on someone else's page.
 */
export type HomeViewer =
  | { kind: "self" }
  | {
      kind: "other"
      meId: string
      targetId: string
      initiallyFollowing: boolean
      /** Logical parent for the back chip. */
      backHref: string
    }

export default function HomeShell({
  data,
  viewer = { kind: "self" },
  inspire = null,
}: {
  data: HomeData
  viewer?: HomeViewer
  /**
   * The Inspire corpus, for somebody who has not made a trip yet.
   *
   * OPTIONAL, and supplied ONLY by the self route. A stranger's profile renders
   * from this same shell, and "here are forty trips you could copy" on someone
   * else's page is an advert wearing their name.
   */
  inspire?: InspirePromo | null
}) {
  const [focusTripId, setFocusTripId] = useState<string | null>(null)
  const isSelf = viewer.kind === "self"
  const allTrips = [
    ...(data.featured ? [data.featured] : []),
    ...data.others,
  ]

  // Zero, zero and zero is a scoreboard of everything the reader has not done,
  // printed at the top of their first screen. It appears the moment any of the
  // three means something.
  const hasStats = data.countries > 0 || data.followers > 0 || data.following > 0

  // A new account's globe is empty, so the forty Inspire guides are pinned on
  // it — "watch your world fill in" has to be visible before there is anything
  // of your own to fill it with.
  //
  // ONE ARRAY, and it must be assembled in the render that MOUNTS the globe:
  // GlobeHero's marker effect has `[]` deps and captures `pins` exactly once, so
  // a second set arriving later — a client fetch, a nested Suspense boundary —
  // silently never draws.
  const showStartHere = isSelf && allTrips.length === 0
  const pins = showStartHere && inspire ? [...data.pins, ...inspire.pins] : data.pins

  // Stats link to the signed-in user's own tabs, so on another profile they
  // are rendered as plain figures rather than links that quietly navigate to
  // YOUR followers while showing THEIR count.
  const statHref = (href: string) => (isSelf ? href : undefined)

  const follow =
    viewer.kind === "other" ? (
      <FollowButton
        meId={viewer.meId}
        targetId={viewer.targetId}
        initiallyFollowing={viewer.initiallyFollowing}
      />
    ) : null

  return (
    <div className="relative">
      {/* The globe owns the whole viewport */}
      <div className="fixed inset-0">
        <GlobeHero pins={pins} focusTripId={focusTripId} />
      </div>

      {/* ---------- Desktop: floating glass trip rail (clears the 76px nav rail) ---------- */}
      {/* FLUID PAST lg, capped. This was a constant w-[380px], so a 1440px
          laptop spent ~960px on an empty planet and a 1920px display spent
          1440px — the panel never grew, whatever the screen. The globe is
          still the ground and still the brand; it just stops owning two
          thirds of every desktop. Capped rather than a bare percentage so an
          ultrawide does not stretch a reading column to 1200px. */}
      <aside className="fixed left-[100px] top-6 z-10 hidden max-h-[calc(100vh-56px)] w-[380px] flex-col overflow-hidden rounded-[26px] border border-white/40 bg-aurora-glass/95 shadow-aurora-glow lg:flex xl:w-[54vw] xl:max-w-[860px]">
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
            {isSelf ? <SignOutButton /> : follow}
          </div>

          {/* Stats — see `hasStats`. Both renderings of this row are gated; they
              are NOT the same markup (gap-7 here, gap-8 in the sheet), so they
              have to be changed as a pair. */}
          {hasStats && (
            <div className="mt-5 flex gap-7 border-b border-drift-divider pb-4">
              <Stat value={data.countries} label="Countries" href={statHref("/app/countries")} />
              <Stat value={data.followers} label="Followers" href={statHref("/app/people?tab=followers")} />
              <Stat value={data.following} label="Following" href={statHref("/app/people?tab=following")} />
            </div>
          )}

          {/* Plan CTA. Withheld only where StartHere is about to draw the same
              offer as its quiet second line — a full-width coral "Plan a new
              trip" directly above "or start one from scratch" is the demotion
              undone, and it is the desktop half of it. */}
          {isSelf && !showStartHere && (
            <Link
              href="/app/trips/new"
              className={`flex h-12 items-center justify-center rounded-full bg-drift-coral text-[15px] font-semibold text-white shadow-md shadow-drift-coral/25 transition-transform hover:scale-[1.01] ${
                hasStats ? "mt-4" : "mt-5"
              }`}
            >
              Plan a new trip
            </Link>
          )}

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

          {/* The desktop zero-trip branch was a 🗺 glyph and one line with no
              route anywhere — and this rail is where a laptop signup lands, so
              it is the version most first sessions actually see. It gets the
              same deck the sheet does, at rail width. */}
          {showStartHere && <StartHere promo={inspire} dense />}

          {allTrips.length === 0 && !isSelf && (
            <div className="py-10 text-center">
              <p className="text-3xl opacity-30">🗺</p>
              <p className="mt-2 text-[14px] text-drift-muted">No trips to show yet.</p>
            </div>
          )}
        </div>
      </aside>

      {/* Ask Drift pill — generic entry to chat (was "Ask Drift about <next
          trip>", which read as confusing on the home globe). Sits above the
          globe's bottom-right +/- zoom controls so neither is obscured. */}
      {isSelf && (
        <Link
          href="/app/chats"
          className="fixed bottom-24 right-6 z-10 hidden items-center gap-2.5 rounded-full border border-white/40 bg-aurora-glass py-3 pl-4 pr-5 shadow-aurora-glow transition-transform hover:scale-[1.02] lg:flex"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-drift-coral text-[15px] text-white">
            ✦
          </span>
          <span className="text-[14.5px] font-medium text-drift-ink">Ask Drift</span>
        </Link>
      )}

      {/* Back chip, only when this is someone else's profile — the signed-in
          home is a tab root and has no up-path. Sits above the globe. */}
      {viewer.kind === "other" && (
        <div className="fixed left-4 top-4 z-20 lg:left-[100px]">
          <BackLink href={viewer.backHref} label="People" />
        </div>
      )}

      {/* ---------- Mobile: iOS sheet-over-globe ---------- */}
      {/* min-h is load-bearing, not padding. The sheet starts 44vh down over a
          `fixed inset-0` globe and had no floor, so a profile with little in it
          — a brand-new account being the obvious case — ended partway down the
          screen and let the globe show through underneath, with the dock
          floating over the seam. 56vh is exactly the remainder of the viewport
          below the 44vh offset, so the sheet always reaches the bottom no matter
          how empty it is. pb-28 stays: it clears the fixed dock. */}
      <div className="relative z-10 mt-[44vh] min-h-[56vh] rounded-t-[28px] bg-aurora-glass pb-28 shadow-[0_-8px_30px_rgba(0,0,0,0.25)] lg:hidden">
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
            {/* Settings was reachable ONLY from the desktop AppRail, so on phone
                there was no route to it at all. Mirrors the gear in the iOS
                profile header. */}
            {isSelf ? (
              <>
                <Link
                  href="/app/settings"
                  aria-label="Settings"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-aurora-border bg-aurora-glass text-drift-muted transition-colors hover:text-drift-ink"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-[18px] w-[18px]">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </Link>
                <SignOutButton />
              </>
            ) : (
              follow
            )}
          </div>

          {/* The sheet's copy of the stat row — gap-8, not the aside's gap-7. */}
          {hasStats && (
            <div className="mt-4 flex gap-8 border-b border-drift-divider pb-4">
              <Stat value={data.countries} label="Countries" href={statHref("/app/countries")} />
              <Stat value={data.followers} label="Followers" href={statHref("/app/people?tab=followers")} />
              <Stat value={data.following} label="Following" href={statHref("/app/people?tab=following")} />
            </div>
          )}

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

          {allTrips.length === 0 && !isSelf && (
            <div className="py-12 text-center">
              <p className="text-4xl opacity-30">🗺</p>
              <p className="mt-3 text-[15px] text-drift-muted">No trips to show yet</p>
            </div>
          )}

          {/* Parity with iOS (Drift ProfileTripsView.emptyTripsState), and the
              two paths that work from zero. Someone else's empty profile keeps
              the plain line above — these are actions only the owner can take.
              The markup itself lives in StartHere, which the desktop rail draws
              too, so the two cannot drift apart the way they did before. */}
          {showStartHere && <StartHere promo={inspire} />}
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

// `href` is optional: the stat destinations are the signed-in user's own
// /app/people tabs, so on someone else's profile the figure is shown without
// a link rather than navigating to YOUR followers under THEIR count.
function Stat({ value, label, href }: { value: number; label: string; href?: string }) {
  const body = (
    <>
      <p className="text-[19px] font-bold leading-tight">{value}</p>
      <p className="text-[12px] text-drift-muted">{label}</p>
    </>
  )
  return href ? (
    <Link
      href={href}
      className="rounded-lg outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-drift-coral/50"
    >
      {body}
    </Link>
  ) : (
    <div>{body}</div>
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
  return (
    <li>
      <Link
        href={`/app/trips/${trip.id}`}
        onMouseEnter={onHover}
        className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-drift-alt-bg"
      >
        <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl">
          <TripCoverImg cover={trip.cover} sizes="48px" showCredit={false} />
        </span>
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

function CardCover({ trip }: { trip: HomeTrip }) {
  return (
    <>
      <TripCoverImg
        cover={trip.cover}
        sizes="(max-width: 1024px) 100vw, 420px"
      />
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
