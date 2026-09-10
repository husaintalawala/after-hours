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
import TripCoverImg from "@/components/app/TripCoverImg"
import BackLink from "@/components/app/BackLink"
import FollowButton from "@/components/app/people/FollowButton"
import StartHere from "@/components/app/home/StartHere"
import HomeHeader, { Avatar } from "@/components/app/home/HomeHeader"
import CtaRow from "@/components/app/home/CtaRow"
import { Section, Rail } from "@/components/app/home/HomeSection"
import InspireRail from "@/components/app/home/InspireRail"
import DiscoverRail from "@/components/app/home/DiscoverRail"
import AskDriftBar from "@/components/app/home/AskDriftBar"
import type { DiscoverAnchor } from "@/lib/drift/discover"
import type { TripCoverResult } from "@/lib/drift/tripCover"
import type { InspirePromo } from "@/lib/drift/inspirePromo"
import { countryFlagEmoji } from "@/lib/drift/flags"

/**
 * The logged-in home.
 *
 * ONE COMPOSITION, responsive — not a phone tree and a desktop tree.
 *
 * It used to be two: a viewport-filling globe with an iOS-style sheet floating
 * over it on phone, and a cropped horizon band with a measured column on
 * desktop. That split is what produced the three faults this replaces. The
 * `fixed inset-0` globe bled through everything because a fixed element is not
 * inside any of the boxes around it; the 44vh spacer that made room for it left
 * a dead band under the sheet on any account without enough content to fill
 * one; and an account with a single trip rendered one card and then several
 * hundred pixels of nothing, because the page genuinely had nothing else to
 * say.
 *
 * The fix is not better spacing. It is more bands: three ways to start
 * something, your own trips, and the curated shelf — so a one-trip account and
 * a forty-trip account are the same page with a different amount in the middle
 * of it. The globe is now a CONTAINED desktop band rather than the room
 * everything floats in.
 */

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
 * Someone else's profile is the SAME shell — it is the same question ("what are
 * this person's trips?"). Only the genuinely owner-bound affordances are gated:
 * sign out, settings, the CTA row, Ask Drift, the Inspire rail and the stat
 * links, which point at YOUR /app/people tabs and would silently mislead on
 * someone else's page.
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

/**
 * Whole days from today until `iso`, or null when there is no date.
 *
 * COMPUTED ON THE CLIENT ONLY, via the effect below. "How many days until" is
 * a question about the reader's calendar, and the server answers it in its own
 * timezone — so a trip 21 days out in Lisbon is 20 or 22 on a machine in
 * California, and the two renders disagree.
 */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  if (!y || !m || !d) return null
  const then = new Date(y, m - 1, d)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((then.getTime() - today.getTime()) / 86_400_000)
}

export default function HomeShell({
  data,
  viewer = { kind: "self" },
  inspire = null,
}: {
  data: HomeData
  viewer?: HomeViewer
  /**
   * The curated shelf. Supplied ONLY by the self route — "here are forty trips
   * you could copy" on someone else's page is an advert wearing their name.
   */
  inspire?: InspirePromo | null
}) {
  const [focusTripId, setFocusTripId] = useState<string | null>(null)
  const [daysOut, setDaysOut] = useState<number | null>(null)
  const isSelf = viewer.kind === "self"
  const allTrips = [...(data.featured ? [data.featured] : []), ...data.others]

  // Zero, zero and zero is a scoreboard of everything the reader has not done,
  // printed near the top of their first screen. It appears the moment any of
  // the three means something.
  const hasStats = data.countries > 0 || data.followers > 0 || data.following > 0

  const showStartHere = isSelf && allTrips.length === 0

  // A new account's globe is empty, so the curated guides are pinned on it.
  //
  // ONE ARRAY, assembled in the render that MOUNTS the globe: GlobeHero's
  // marker effect has `[]` deps and captures `pins` exactly once, so a second
  // set arriving later silently never draws.
  const pins = showStartHere && inspire ? [...data.pins, ...inspire.pins] : data.pins

  useEffect(() => {
    setDaysOut(daysUntil(data.featured?.startDate ?? null))
  }, [data.featured?.startDate])

  // The pill on the featured cover — "Upcoming · in 21 days". Null until the
  // effect lands (see daysUntil), and null when there is nothing true to say,
  // which is what keeps it from being decoration.
  const featuredPill: string | null = (() => {
    if (!data.featured) return null
    if (data.featured.isActive) return "You are travelling"
    if (daysOut === null) return null
    if (daysOut > 1) return `Upcoming · in ${daysOut} days`
    if (daysOut === 1) return "Upcoming · tomorrow"
    if (daysOut === 0) return "Upcoming · today"
    return null
  })()

  // WHERE "NEAR HERE" IS, and the answer comes from the featured trip because
  // nothing better exists. There is no home-city field on web at all — the
  // first-run flow asks where you set out from, but nothing surfaces it here —
  // so the next-best anchor is the place the reader is about to go.
  //
  // Coordinates come off that trip's globe pin, which already carries them;
  // HomeTrip itself has only city and country. Events need real coordinates and
  // return [] without them, but "for you" resolves from a city name, so a
  // label-only anchor is still worth asking with.
  const featuredPin = data.featured
    ? (data.pins.find((p) => p.tripId === data.featured!.id) ?? null)
    : null
  const discoverAnchor: DiscoverAnchor | null =
    data.featured && (data.featured.city || data.featured.country)
      ? {
          label: data.featured.city ?? data.featured.country ?? "",
          country: data.featured.country,
          lat: featuredPin?.lat ?? null,
          lng: featuredPin?.lng ?? null,
        }
      : null

  // Stats link to the signed-in user's own tabs, so on another profile they are
  // plain figures rather than links that quietly navigate to YOUR followers.
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
    <div className="relative min-h-[100dvh] bg-aurora-midnight pb-40 lg:pb-24">
      {/* Back chip, only on someone else's profile — the signed-in home is a
          tab root and has no up-path. */}
      {viewer.kind === "other" && (
        <div className="absolute left-4 top-4 z-20 lg:left-10">
          <BackLink href={viewer.backHref} label="People" />
        </div>
      )}

      {/* ---------- Desktop: the contained horizon ----------
          `lg:` ONLY, and inside a real box with `overflow-hidden`. This is the
          whole of the globe's presence on the page now.

          The phone used to render this same map as `fixed inset-0` — a
          viewport-filling planet that every band below had to be layered over.
          A fixed element is not inside any of its ancestors, so it ignored the
          page's own scroll box and bled through; the 44vh spacer that reserved
          room for it is what left a dead gap under short content. Neither
          problem has a spacing fix, so the phone simply does not draw it. */}
      <div className="relative hidden h-[300px] overflow-hidden lg:block xl:h-[340px]">
        <div className="absolute inset-x-0 top-0 h-[760px]">
          <GlobeHero pins={pins} focusTripId={focusTripId} zoom={showStartHere ? 1.35 : 2.6} />
        </div>
        {/* The terminator — the band dissolving into the page ground so the
            header below it does not start on a hard edge. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[190px] bg-gradient-to-t from-aurora-midnight via-aurora-midnight/75 to-transparent"
        />
      </div>

      {/* The header overlaps the band on desktop so the greeting sits ON the
          sky rather than under it — `lg:-mt-[124px]` — while on phone, where
          there is no band, it is simply the top of the page. */}
      <div className="relative z-10 lg:-mt-[124px]">
        <HomeHeader displayName={data.displayName} avatarUrl={data.avatarUrl} isSelf={isSelf} />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-2xl lg:mx-0 lg:max-w-[1180px]">
        {/* Owner-only. A stranger's profile gets no "create a trip". */}
        {isSelf && (
          <div className="px-5 lg:px-10">
            <CtaRow />
          </div>
        )}

        {/* Someone else's identity line — the greeting says "Good morning,
            <them>" but not "where are we going", so their handle and the follow
            button live here instead. */}
        {!isSelf && (
          <div className="mt-4 flex items-center gap-3 px-5 lg:px-10">
            {data.username && (
              <p className="font-mono text-[12px] text-aurora-ink3">@{data.username}</p>
            )}
            <div className="ml-auto">{follow}</div>
          </div>
        )}

        {hasStats && (
          <div className="mt-6 flex gap-8 border-b border-aurora-border px-5 pb-5 lg:px-10">
            <Stat value={data.countries} label="Countries" href={statHref("/app/countries")} />
            <Stat value={data.followers} label="Followers" href={statHref("/app/people?tab=followers")} />
            <Stat value={data.following} label="Following" href={statHref("/app/people?tab=following")} />
          </div>
        )}

        {/* ---------- Your trips, first ----------
            The reader's own work outranks anything curated, on every account.
            That ordering is the point: Discover and Inspire exist to fill a
            thin page, not to sit above the trips someone actually made. */}
        {data.featured && (
          <Section
            title={isSelf ? "Your trips" : `${data.displayName.split(/\s+/)[0]}'s trips`}
            meta={allTrips.length > 1 ? `${allTrips.length} trips` : undefined}
            action={allTrips.length > 1 && isSelf ? "All trips" : undefined}
            actionHref={allTrips.length > 1 && isSelf ? "/app/trips" : undefined}
          >
            <div className="px-5 lg:px-10">
              <FeaturedCard trip={data.featured} pill={featuredPill} />
            </div>
            {data.others.length > 0 && (
              <div className="mt-3 px-5 lg:px-10">
                <Rail>
                  {data.others.map((t) => (
                    <RailTripCard key={t.id} trip={t} onHover={() => setFocusTripId(t.id)} />
                  ))}
                </Rail>
              </div>
            )}
          </Section>
        )}

        {/* An account with trips but no featured pick still gets its rail. */}
        {!data.featured && data.others.length > 0 && (
          <Section title={isSelf ? "Your trips" : "Trips"} meta={`${data.others.length} trips`}>
            <div className="px-5 lg:px-10">
              <Rail>
                {data.others.map((t) => (
                  <RailTripCard key={t.id} trip={t} onHover={() => setFocusTripId(t.id)} />
                ))}
              </Rail>
            </div>
          </Section>
        )}

        {/* ---------- Discover ----------
            Owner-only and self-removing: it fetches after paint and renders
            nothing at all if the lookup comes back empty, so it can never
            leave a titled band with a hole under it. */}
        {isSelf && discoverAnchor && (
          <div className="px-5 lg:px-10">
            <DiscoverRail anchor={discoverAnchor} />
          </div>
        )}

        {/* ---------- The curated shelf ----------
            Owner-only, and now permanent rather than an empty-state
            consolation. See InspireRail. */}
        {isSelf && inspire && (
          <div className="px-5 lg:px-10">
            <InspireRail promo={inspire} />
          </div>
        )}

        {/* The two paths that work from zero, shared with the desktop rail so
            the two cannot drift apart the way they did before. */}
        {showStartHere && (
          <div className="mt-8 px-5 lg:px-10">
            <StartHere promo={inspire} />
          </div>
        )}

        {allTrips.length === 0 && !isSelf && (
          <div className="py-16 text-center">
            <p className="text-3xl opacity-30">🗺</p>
            <p className="mt-2 text-[14px] text-aurora-ink3">No trips to show yet.</p>
          </div>
        )}

        {/* Sign out has no other home on phone — the desktop AppRail carries
            settings, but the phone dock does not. */}
        {isSelf && (
          <div className="mt-12 flex justify-center px-5 lg:hidden">
            <SignOutButton />
          </div>
        )}
      </div>

      {/* Owner-only, and fixed — see AskDriftBar. */}
      {isSelf && <AskDriftBar />}
    </div>
  )
}

// `href` is optional: the stat destinations are the signed-in user's own
// /app/people tabs, so on someone else's profile the figure is shown without a
// link rather than navigating to YOUR followers under THEIR count.
function Stat({ value, label, href }: { value: number; label: string; href?: string }) {
  const body = (
    <>
      <p className="text-[19px] font-bold leading-tight text-aurora-ink">{value}</p>
      <p className="text-[12px] text-aurora-ink3">{label}</p>
    </>
  )
  return href ? (
    <Link
      href={href}
      className="rounded-lg outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-aurora-teal/50"
    >
      {body}
    </Link>
  ) : (
    <div>{body}</div>
  )
}

/**
 * The featured trip — one large cover, full column width.
 *
 * AN ASPECT RATIO, NEVER A HEIGHT. `h-[220px]` was correct in the 380px sheet
 * it was written for and a letterbox once the column grew past 1000px, which is
 * exactly what "stretched" meant on this page. A ratio holds its shape at every
 * width.
 */
function FeaturedCard({ trip, pill }: { trip: HomeTrip; pill: string | null }) {
  const flag = countryFlagEmoji(trip.country)
  return (
    <Link
      href={`/app/trips/${trip.id}`}
      className="group relative block aspect-[3/2] overflow-hidden rounded-hero border border-aurora-border sm:aspect-[16/9] lg:aspect-[21/9]"
    >
      <CardCover trip={trip} sizes="(max-width: 1024px) 100vw, 1120px" />

      {pill && (
        <span className="absolute left-4 top-4 rounded-full border border-white/20 bg-black/45 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur-md">
          {pill}
        </span>
      )}
      {flag && (
        <span className="absolute right-4 top-4 text-[20px] drop-shadow">{flag}</span>
      )}

      <div className="absolute inset-x-0 bottom-0 p-4 lg:p-6">
        <p className="font-drift-display text-[24px] font-black leading-[1.04] tracking-[-0.03em] text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.5)] sm:text-[30px] lg:text-[40px]">
          {trip.title}
        </p>
        <p className="mt-2 font-mono text-[11px] text-white/80 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
          {[trip.dateLabel, trip.country, trip.city].filter(Boolean).join("  ·  ")}
        </p>
      </div>
    </Link>
  )
}

/** A trip in the rail beside the featured one. */
function RailTripCard({ trip, onHover }: { trip: HomeTrip; onHover: () => void }) {
  const flag = countryFlagEmoji(trip.country)
  return (
    <Link
      href={`/app/trips/${trip.id}`}
      onMouseEnter={onHover}
      className="group relative block h-[168px] w-[196px] shrink-0 overflow-hidden rounded-card border border-aurora-border outline-none focus-visible:ring-2 focus-visible:ring-aurora-teal/60"
    >
      <CardCover trip={trip} sizes="196px" />
      {trip.isActive ? (
        <span className="absolute left-2.5 top-2.5 rounded-full bg-gradient-to-b from-aurora-teal to-aurora-teal-end px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-wide text-aurora-teal-ink">
          Travelling
        </span>
      ) : (
        flag && <span className="absolute right-2.5 top-2.5 text-[17px] drop-shadow">{flag}</span>
      )}
      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.15em] text-aurora-teal">
          {trip.dateLabel}
        </p>
        <p className="mt-1 line-clamp-2 font-drift-display text-[14.5px] font-bold leading-[1.15] tracking-[-0.015em] text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
          {trip.title}
        </p>
      </div>
    </Link>
  )
}

/**
 * Cover photo plus its scrim.
 *
 * The scrim is not a finish. Every card here sets type over a photograph the
 * app did not choose, and a bright one renders white-on-white without it.
 */
function CardCover({ trip, sizes }: { trip: HomeTrip; sizes: string }) {
  return (
    <>
      <TripCoverImg cover={trip.cover} sizes={sizes} />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.72))" }}
      />
    </>
  )
}

// Re-exported so the people page and any future caller get the same avatar as
// the header rather than a second copy.
export { Avatar }
