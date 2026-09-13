"use client"

import Link from "next/link"
import type { GlobeTripPin } from "@/components/app/GlobeHero"
import CoverCredit from "@/components/app/CoverCredit"
import TripCoverImg from "@/components/app/TripCoverImg"
import BackLink from "@/components/app/BackLink"
import FollowButton from "@/components/app/people/FollowButton"
import StartHere from "@/components/app/home/StartHere"
import HomeHeader, { Avatar } from "@/components/app/home/HomeHeader"
import CtaRow from "@/components/app/home/CtaRow"
import AskBar from "@/components/app/home/AskBar"
import ChatsPanel from "@/components/app/home/ChatsPanel"
import PassportPanel from "@/components/app/home/PassportPanel"
import { Section, Rail, SeeAllCard } from "@/components/app/home/HomeSection"
import InspireRail from "@/components/app/home/InspireRail"
import "./home.css"
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
  /** Self only — the questions the Ask-Drift panel offers, already written for
   *  this reader. See homePrompts.ts. */
  prompts: string[]
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
  const isSelf = viewer.kind === "self"
  const allTrips = [...(data.featured ? [data.featured] : []), ...data.others]

  const showStartHere = isSelf && allTrips.length === 0

  // THE PASSPORT SHOWS YOUR OWN TRAVEL, or it shows nothing.
  //
  // A new account's globe used to be seeded with the CURATED pins, back when the
  // globe was the full-bleed background of the whole page and an empty planet
  // read as a broken one. The redesign moved it inside PassportPanel, whose
  // subject is explicitly where the READER has been — so the borrowed pins now
  // sit directly above a counter saying 0 Countries. The picture claims a life
  // the numbers deny, and neither pin is theirs.
  //
  // An empty globe under "Your passport" is not a hole; it is the truth, and it
  // is the before to the first trip's after.
  const pins = data.pins

  // WHERE "NEAR HERE" IS: where the reader is TODAY, then where they live.
  //
  // THE TRIP IN PROGRESS COMES FIRST, and that reverses what this comment used
  // to argue. The objection was real — anchoring on the featured trip put "near
  // Tashkent" directly beneath a card that opens Tashkent, so the rail repeated
  // the thing above it — and the answer was to lead with the stored home city.
  // That held right up until somebody travelled, at which point a heading
  // reading "Near New York" to a reader standing in Tokyo is not a duplicate,
  // it is false.
  //
  // The duplication objection now has an answer rather than a workaround: the
  // gate is `isActive`, not "has a trip". When the card above says "You are
  // travelling", the rail underneath is answering what is around me TONIGHT,
  // which is a different question from where am I going.
  //
  // `isActive` is date-derived — today inside [start, end], see homeData's
  // `isNow` — deliberately not the stale trips.is_active flag. So this is free:
  // no permission, no prompt, no new query, and it renders correctly on the
  // server on first paint. It is the same tier-2 rule the phone uses, and the
  // one that matters most in practice, because it works for a reader who has
  // never granted location.
  //
  // A stored home city still wins over a trip that has not started, and the
  // featured trip remains the floor, so an account with no home city set still
  // gets a rail rather than a hole.
  //
  // Coordinates: home_lat/lng when the profile has them, otherwise the featured
  // trip's globe pin. Events need real coordinates and return [] without them,
  // but "for you" resolves from a city name, so a label-only anchor is still
  // worth asking with.
  const featuredPin = data.featured
    ? (data.pins.find((p) => p.tripId === data.featured!.id) ?? null)
    : null
  const travellingNow =
    data.featured?.isActive && (data.featured.city || data.featured.country)
      ? data.featured
      : null
  const discoverAnchor: DiscoverAnchor | null = travellingNow
    ? {
        label: travellingNow.city ?? travellingNow.country ?? "",
        country: travellingNow.country,
        lat: featuredPin?.lat ?? null,
        lng: featuredPin?.lng ?? null,
      }
    : data.home?.city || data.home?.country
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
      {/* THE CAP WAS 1180px, AND A LAPTOP IS NOT.
          A measure exists to stop running text getting too wide to read, and
          this page has no running text — it is cards, a globe and a shelf, all
          of which want width. On a 2000px display 1180 left roughly seven
          hundred pixels of ground doing nothing down the right-hand side while
          the guide shelf showed six of ninety.

          1760 is still a cap rather than `none`: past it the cockpit's middle
          column turns into a letterbox again, which is the fault this layout
          was built to fix. */}
      <div className="relative z-10 mx-auto w-full max-w-2xl lg:max-w-[1600px]">
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

        <div className="home-dashboard mt-6 px-5 lg:px-10">
          {isSelf && <div className="hidden lg:block"><CtaRow stacked /></div>}
          <PassportPanel countries={data.countries} followers={data.followers} following={data.following} pins={pins} isSelf={isSelf} />
          {isSelf && <div className="home-dashboard-personal">
            <div className="hidden lg:block"><ChatsPanel prompts={data.prompts} /></div>
          </div>}
        </div>

        {(isSelf || allTrips.length > 0) && <Section className="home-trips" title={isSelf ? "Your trips" : "Trips"} meta={`${allTrips.length} trips`} action={isSelf ? "All trips" : undefined} actionHref={isSelf ? "/app/trips" : undefined}>
          <Rail>
            {allTrips.map(trip => <RailTripCard key={trip.id} trip={trip} sizes="(min-width:1024px) 244px, 196px" />)}
            {isSelf && <SeeAllCard href={allTrips.length ? "/app/trips" : "/app/trips/new"} label={allTrips.length ? "All your trips" : "Create your first trip"} className="h-[168px] w-[196px] rounded-card" />}
          </Rail>
        </Section>}

        {/* ---------- Discover ----------
            Owner-only and self-removing: it fetches after paint and renders
            nothing at all if the lookup comes back empty, so it can never
            leave a titled band with a hole under it. */}
        {isSelf && discoverAnchor && (
          <DiscoverRail anchor={discoverAnchor} />
        )}

        {/* ---------- The curated shelf ----------
            Owner-only, and now permanent rather than an empty-state
            consolation. See InspireRail. */}
        {isSelf && inspire && (
          <InspireRail promo={inspire} />
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
/** A trip in the rail beside the featured one.
 *
 *  EXPORTED for /app/trips, the archive behind this page's "All trips" link —
 *  which, until that page existed, was a link to a 404. The archive lays the
 *  same card out in a grid rather than a rail; copying it there would have left
 *  two cards to keep in step, and this one already owns the cover chain, the
 *  Travelling pill and the flag. */
export function RailTripCard({
  trip,
  /** What width this card will actually be rendered at.
   *
   *  A PROP because the archive lays these out in a grid, where the track is
   *  one full column on a phone — 335px inside `max-w-2xl px-5`, since two
   *  180px tracks plus the gap do not fit. Left at the rail's flat "196px" the
   *  browser picked a 196-class candidate and upscaled it most of the way to
   *  double, so every cover on the archive was visibly soft on mobile and
   *  crisp on the laptop. */
  sizes = "196px",
}: {
  trip: HomeTrip
  sizes?: string
}) {
  const flag = countryFlagEmoji(trip.country)
  return (
    <Link
      href={`/app/trips/${trip.id}`}
      className="group relative block h-[168px] w-[196px] shrink-0 overflow-hidden rounded-card border border-aurora-border outline-none focus-visible:ring-2 focus-visible:ring-aurora-teal/60"
    >
      <CardCover trip={trip} sizes={sizes} />
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
      <TripCoverImg cover={trip.cover} sizes={sizes} showCredit={false} />
      {trip.cover.credit && <div className="absolute right-2 top-2 z-10 [&>*]:mt-0"><CoverCredit text={trip.cover.credit.text} href={trip.cover.credit.href} placement="inline" /></div>}
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
