"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import type { GlobeTripPin } from "@/components/app/GlobeHero"
import TripCoverImg from "@/components/app/TripCoverImg"
import BackLink from "@/components/app/BackLink"
import FollowButton from "@/components/app/people/FollowButton"
import StartHere from "@/components/app/home/StartHere"
import HomeHeader, { Avatar } from "@/components/app/home/HomeHeader"
import CtaRow from "@/components/app/home/CtaRow"
import AskBar from "@/components/app/home/AskBar"
import ChatsPanel from "@/components/app/home/ChatsPanel"
import PassportPanel from "@/components/app/home/PassportPanel"
import { Section, Rail } from "@/components/app/home/HomeSection"
import InspireRail from "@/components/app/home/InspireRail"
import DiscoverRail from "@/components/app/home/DiscoverRail"
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
 * of it. The globe is no longer the room everything floats in: it is contained
 * inside PassportPanel, the one band on this page whose subject is actually
 * where the reader has been. The full-screen planet lives on its own route.
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

/** One recent thread, for the Chats panel on the laptop home. */
export interface HomeChat {
  id: string
  title: string
  /** The trip or place the thread hangs off, when it has one. */
  anchorLabel: string | null
  lastMessageAt: string | null
}

/**
 * Where the reader IS, as opposed to where they are going.
 *
 * `profiles.home_city` has existed and been collected by the first-run flow the
 * whole time; it simply was not carried in this payload, so Discover could only
 * ever anchor on the featured trip's city. That made the rail ask "what is near
 * Tashkent" directly underneath a card that opens Tashkent — a duplicate of the
 * thing above it. Anchored here instead it asks the one question nothing else
 * on this page answers.
 */
export interface HomePlace {
  city: string | null
  country: string | null
  lat: number | null
  lng: number | null
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
  /** Self only — nobody's home city is shown on their public profile. */
  home: HomePlace | null
  /** Self only, newest first, at most three. */
  chats: HomeChat[]
}

/**
 * Whose profile this is.
 *
 * Someone else's profile is the SAME shell — it is the same question ("what are
 * this person's trips?"). Only the genuinely owner-bound affordances are gated:
 * the CTA row, the Discover and Inspire rails, and the passport panel's link to
 * the map — which is YOUR map and would silently mislead on someone else's
 * page. Account actions (settings, sign out) live behind the avatar and are
 * self-only for the same reason.
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
  const [daysOut, setDaysOut] = useState<number | null>(null)
  const isSelf = viewer.kind === "self"
  const allTrips = [...(data.featured ? [data.featured] : []), ...data.others]

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

  // WHERE "NEAR HERE" IS: where the reader LIVES, and only then their trip.
  //
  // It used to be the featured trip's city unconditionally, which put "near
  // Tashkent" directly beneath a card that opens Tashkent — the rail repeated
  // the thing above it, and was the weakest band on the page for exactly that
  // reason. profiles.home_city has been collected by the first-run flow all
  // along and is now carried in HomeData, so the rail can ask the one question
  // nothing else here answers: what is near you tonight.
  //
  // The trip city stays as the fallback, because an account that has not set a
  // home city should still get a rail rather than a hole.
  //
  // Coordinates: home_lat/lng when the profile has them, otherwise the featured
  // trip's globe pin. Events need real coordinates and return [] without them,
  // but "for you" resolves from a city name, so a label-only anchor is still
  // worth asking with.
  const featuredPin = data.featured
    ? (data.pins.find((p) => p.tripId === data.featured!.id) ?? null)
    : null
  const discoverAnchor: DiscoverAnchor | null = data.home?.city || data.home?.country
    ? {
        label: data.home.city ?? data.home.country ?? "",
        country: data.home.country,
        lat: data.home.lat,
        lng: data.home.lng,
      }
    : data.featured && (data.featured.city || data.featured.country)
      ? {
          label: data.featured.city ?? data.featured.country ?? "",
          country: data.featured.country,
          lat: featuredPin?.lat ?? null,
          lng: featuredPin?.lng ?? null,
        }
      : null


  const follow =
    viewer.kind === "other" ? (
      <FollowButton
        meId={viewer.meId}
        targetId={viewer.targetId}
        initiallyFollowing={viewer.initiallyFollowing}
      />
    ) : null

  return (
    <div className="relative min-h-[100dvh] bg-aurora-midnight pb-24 lg:pb-20">
      {/* Back chip, only on someone else's profile — the signed-in home is a
          tab root and has no up-path. */}
      {viewer.kind === "other" && (
        <div className="absolute left-4 top-4 z-20 lg:left-10">
          <BackLink href={viewer.backHref} label="People" />
        </div>
      )}

      {/* THE GLOBE IS NOT HERE ANY MORE. It was a full-viewport `fixed inset-0`
          layer, then a contained desktop band; it is now the illustration
          inside PassportPanel, which is the only place on this page whose
          subject is actually "where you have been". The full-screen planet
          lives on its own route. Nothing on the home bleeds. */}
      <div className="relative z-10 mx-auto w-full max-w-2xl lg:mx-0 lg:max-w-[1180px]">
        {/* ---------- The top band ----------
            ONE COLUMN ON A PHONE, TWO ACROSS A LAPTOP.

            Stacked, the desktop home was the phone layout in a wider window:
            a greeting, three cards, and a passport panel running down the left
            of a 1180px column with the right half of the screen empty. The
            three things at the top of this page are all short and none of them
            wants the full width, which is the definition of a row.

            So above lg the greeting and its CTA cards take the flexible
            column and the passport takes a fixed 380px beside them. The rails
            below stay full width, because a rail's whole job is to use it. */}
        <div className="px-5 lg:px-10">
          <div className="min-w-0">
            <HomeHeader
              displayName={data.displayName}
              avatarUrl={data.avatarUrl}
              isSelf={isSelf}
            />

            {/* Owner-only. A stranger's profile gets no "create a trip".
                Above lg the three CTA cards are gone: "Start a chat" is the
                AskBar, "Create a trip" is the coral + already pinned in the
                rail, and "New collection" was marked SOON. A row of tiles
                whose two live members duplicate two permanent controls is
                width spent on nothing. */}
            {isSelf && (
              <>
                <div className="lg:hidden">
                  <CtaRow />
                </div>
                <div className="mt-4 hidden lg:block">
                  <AskBar />
                </div>
              </>
            )}

            {/* Someone else's identity line — the greeting says "Good morning,
                <them>" but not "where are we going", so their handle and the
                follow button live here instead. */}
            {!isSelf && (
              <div className="mt-4 flex items-center gap-3">
                {data.username && (
                  <p className="font-mono text-[12px] text-aurora-ink3">@{data.username}</p>
                )}
                <div className="ml-auto">{follow}</div>
              </div>
            )}
          </div>
        </div>

        {/* ---------- The cockpit ----------
            THREE TILES ON A LAPTOP, STACKED BANDS ON A PHONE.

            What was here before gave one upcoming trip a 21:9 band across the
            full column — a cinema letterbox that cropped the photograph to a
            strip of sky, and roughly a third of the screen spent on the single
            thing the account had least of. One trip is not a hero; it is one
            trip. It gets a 296px column, the globe gets the width it was asking
            for (it was a 132px box beside three numbers), and the chats that
            had no presence on this page at all get the third.

            Sized by what each holds, and each an honest rectangle rather than
            a ribbon. Below lg they are three ordinary stacked cards. */}
        {data.featured && (
          <Section
            title={isSelf ? "Your trips" : `${data.displayName.split(/\s+/)[0]}'s trips`}
            meta={allTrips.length > 1 ? `${allTrips.length} trips` : undefined}
            action={allTrips.length > 1 && isSelf ? "All trips" : undefined}
            actionHref={allTrips.length > 1 && isSelf ? "/app/trips" : undefined}
            /* The laptop row carries its own three subjects, so a band title
               reading "Your trips" over a globe and a chat list would be
               describing only the left third of what is under it. */
            hideTitleOnDesktop
          >
            <div className="px-5 lg:grid lg:grid-cols-[296px_minmax(0,1fr)_400px] lg:items-stretch lg:gap-4 lg:px-10">
              <FeaturedCard trip={data.featured} pill={featuredPill} />

              <div className="mt-6 lg:mt-0">
                <PassportPanel
                  countries={data.countries}
                  followers={data.followers}
                  following={data.following}
                  pins={pins}
                  isSelf={isSelf}
                />
              </div>

              {isSelf && data.chats.length > 0 && (
                <div className="mt-6 lg:mt-0">
                  <ChatsPanel chats={data.chats} />
                </div>
              )}
            </div>

            {data.others.length > 0 && (
              <div className="mt-4 px-5 lg:px-10">
                <Rail>
                  {data.others.map((t) => (
                    <RailTripCard key={t.id} trip={t} />
                  ))}
                </Rail>
              </div>
            )}
          </Section>
        )}

        {/* No trip at all: the passport and chats still deserve the row. */}
        {!data.featured && (
          <div className="mt-6 px-5 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-stretch lg:gap-4 lg:px-10">
            <PassportPanel
              countries={data.countries}
              followers={data.followers}
              following={data.following}
              pins={pins}
              isSelf={isSelf}
            />
            {isSelf && data.chats.length > 0 && (
              <div className="mt-6 lg:mt-0">
                <ChatsPanel chats={data.chats} />
              </div>
            )}
          </div>
        )}

        {/* An account with trips but no featured pick still gets its rail. */}
        {!data.featured && data.others.length > 0 && (
          <Section title={isSelf ? "Your trips" : "Trips"} meta={`${data.others.length} trips`}>
            <div className="px-5 lg:px-10">
              <Rail>
                {data.others.map((t) => (
                  <RailTripCard key={t.id} trip={t} />
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

        {/* Sign out and Settings both live behind the avatar now — see
            AvatarMenu in HomeHeader. A bare "Sign out" floating between two
            rails belonged to nothing. */}
      </div>
    </div>
  )
}

/**
 * The next trip — one card, and on a laptop a COMPACT one.
 *
 * AN ASPECT RATIO, NEVER A HEIGHT, still holds on a phone where this spans the
 * column. What that rule could not catch is the ratio itself being wrong:
 * `lg:aspect-[21/9]` across a 1100px column is a cinema band 470px tall that
 * crops the photograph to a strip of sky, and spends a third of the screen on
 * the one thing a new account has least of.
 *
 * Above lg it is a fixed 296×338 tile in the cockpit row instead — about 8% of
 * a 1440×872 laptop. A ribbon would have been smaller still, and was tried: at
 * 1284×86 it stopped being a card and became a rule with content in it. Compact
 * and well-proportioned are not in tension, so this is both.
 *
 * The countdown moves to a corner badge because a 296px column has no room for
 * a pill spelling out "Upcoming · in 21 days" beside a flag.
 */
function FeaturedCard({ trip, pill }: { trip: HomeTrip; pill: string | null }) {
  const flag = countryFlagEmoji(trip.country)
  // "Upcoming · in 21 days" → "21 / days". The long form still renders on a
  // phone, where the card is wide and the badge would look stranded.
  const short = pill?.match(/in (\d+) days?/)
  return (
    <Link
      href={`/app/trips/${trip.id}`}
      className="group relative block aspect-[3/2] overflow-hidden rounded-hero border border-aurora-border outline-none focus-visible:ring-2 focus-visible:ring-aurora-teal/60 sm:aspect-[16/9] lg:aspect-auto lg:h-[338px]"
    >
      <CardCover trip={trip} sizes="(max-width: 1024px) 100vw, 296px" />

      {pill && (
        <span className="absolute left-4 top-4 rounded-full border border-white/20 bg-black/45 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur-md lg:left-3.5 lg:top-3.5 lg:px-2.5 lg:py-1 lg:text-[9.5px] lg:uppercase lg:tracking-[0.13em]">
          {short ? "Next trip" : pill}
        </span>
      )}

      {/* The countdown, as a numeral. Desktop only — see above. */}
      {short && (
        <span className="absolute right-3.5 top-3.5 hidden rounded-2xl border border-white/20 bg-black/45 px-3 py-2 text-center backdrop-blur-md lg:block">
          <span className="block font-drift-display text-[24px] font-black leading-none tabular-nums text-white">
            {short[1]}
          </span>
          <span className="mt-1 block font-mono text-[8px] uppercase tracking-[0.14em] text-aurora-teal">
            days
          </span>
        </span>
      )}
      {flag && (
        <span className="absolute right-4 top-4 text-[20px] drop-shadow lg:hidden">{flag}</span>
      )}

      <div className="absolute inset-x-0 bottom-0 p-4 lg:p-[18px]">
        {flag && (
          <p className="mb-1.5 hidden font-mono text-[9.5px] uppercase tracking-[0.12em] text-white/85 lg:block">
            {flag} {[trip.country, trip.dateLabel].filter(Boolean).join(" · ")}
          </p>
        )}
        <p className="font-drift-display text-[24px] font-black leading-[1.04] tracking-[-0.03em] text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.5)] sm:text-[30px] lg:line-clamp-3 lg:text-[21px] lg:leading-[1.08]">
          {trip.title}
        </p>
        <p className="mt-2 font-mono text-[11px] text-white/80 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)] lg:hidden">
          {[trip.dateLabel, trip.country, trip.city].filter(Boolean).join("  ·  ")}
        </p>
        <span className="mt-3 hidden items-center gap-1.5 rounded-full border border-white/25 bg-black/40 px-3.5 py-1.5 text-[12px] font-semibold text-white backdrop-blur-sm transition-colors group-hover:bg-aurora-teal group-hover:text-aurora-teal-ink lg:inline-flex">
          Open trip
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h13M12 5l7 7-7 7" />
          </svg>
        </span>
      </div>
    </Link>
  )
}

/** A trip in the rail beside the featured one. */
function RailTripCard({ trip }: { trip: HomeTrip }) {
  const flag = countryFlagEmoji(trip.country)
  return (
    <Link
      href={`/app/trips/${trip.id}`}
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
