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

/**
 * Whole days from today until `iso`, or null when there is no date.
 *
 * COMPUTED ON THE CLIENT ONLY, via the effect below. "How many days until" is
 * a question about the reader's calendar, and the server answers it in its own
 * timezone — so a trip 21 days out in Lisbon is 20 or 22 on a machine in
 * California, and the two renders disagree. That is a hydration mismatch on the
 * single largest glyph on the page.
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
   * The Inspire corpus, for somebody who has not made a trip yet.
   *
   * OPTIONAL, and supplied ONLY by the self route. A stranger's profile renders
   * from this same shell, and "here are forty trips you could copy" on someone
   * else's page is an advert wearing their name.
   */
  inspire?: InspirePromo | null
}) {
  const [focusTripId, setFocusTripId] = useState<string | null>(null)
  const [daysOut, setDaysOut] = useState<number | null>(null)
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

  // See daysUntil. The effect is what keeps the server out of the answer.
  useEffect(() => {
    setDaysOut(daysUntil(data.featured?.startDate ?? null))
  }, [data.featured?.startDate])

  // THE ANCHOR. One enormous numeral, and the page is built on it — which is
  // what stops an account with a single trip from reading as a broken one.
  // Two states, one device: how long until you go, or how many finished trips
  // are already waiting. When neither is true it is simply absent; a numeral
  // with nothing true to count is the kind of decoration this app keeps
  // removing.
  const anchor: { n: string; unit: string } | null = (() => {
    if (data.featured && daysOut !== null && !data.featured.isActive) {
      if (daysOut > 0) return { n: String(daysOut), unit: daysOut === 1 ? "day out" : "days out" }
      if (daysOut === 0) return { n: "0", unit: "you leave today" }
    }
    if (data.featured?.isActive) return { n: "\u2022", unit: "you are travelling" }
    if (showStartHere && inspire) return { n: String(inspire.total), unit: "trips, already finished" }
    return null
  })()

  // HOW HIGH THE CAMERA OPENS, and it is not one answer.
  //
  // GlobeHero is `dynamic(ssr:false)`, so this expression only ever decides
  // anything in a browser; the server's value is never used, because the map
  // does not render there.
  //
  // An empty account keeps the world view: the whole point of pinning forty
  // finished trips is that they are scattered over a planet. Somebody with a
  // trip gets a closer camera on desktop, where the map is a 470px horizon and
  // a world-view sphere is a small dome floating in it.
  const globeZoom =
    typeof window !== "undefined" && window.innerWidth >= 1024 && !showStartHere ? 2.6 : 1.35

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
      {/* ---------- Desktop: the horizon ---------- */}
      {/* ONE GLOBE, POSITIONED TWO WAYS. The phone keeps `fixed inset-0` — a
          viewport-filling planet with the sheet floating over it, which is the
          iOS composition. Desktop crops that same map into a band.

          The container moves; the map does not remount. A second <GlobeHero>
          for the second layout would be a second Mapbox context, and mapbox-gl
          is the most expensive thing on this page by an order of magnitude — it
          is already `dynamic(ssr:false)` for exactly that reason. `hidden`
          would not help either: a Mapbox canvas in a `display:none` box
          measures 0x0 and comes back broken.

          On phone the band is `h-0` and un-clipped, so it costs no space and a
          `fixed` child ignores it — plain `overflow-hidden` does not clip a
          fixed descendant, and it is only applied at lg anyway. */}
      <div className="relative h-0 lg:h-[470px] lg:overflow-hidden">
        {/* HOW MUCH GLOBE SHOWS THROUGH THE WINDOW, and it is two answers for
            the same reason the zoom is.

            On a globe projection the sphere's centre on screen IS the map's
            centre, so a visible LIMB and a visible CENTRE are mutually
            exclusive: cropping to an arc necessarily puts the focused pin
            below the band. That is the trade taken for somebody with a trip —
            1040px of globe behind a 470px window catches the top of a close
            sphere, which is a horizon for the type to sit on.

            An empty account is the opposite case. Its zoom is a world view, so
            its sphere is small, and the same 1040px box would leave a narrow
            sliver of arc floating in a wide band. A shorter box puts the whole
            planet — and the forty pins scattered over it — inside the frame. */}
        <div
          className={`fixed inset-0 lg:absolute lg:inset-x-0 lg:bottom-auto lg:top-0 ${
            showStartHere ? "lg:h-[640px]" : "lg:h-[1040px]"
          }`}
        >
          <GlobeHero pins={pins} focusTripId={focusTripId} zoom={globeZoom} />
        </div>

        {/* Everything from here down in this box is desktop-only chrome drawn
            ON the planet. It is `hidden lg:*` rather than living in a separate
            wrapper so it shares the band's clipping. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-[210px] bg-gradient-to-t from-aurora-midnight via-aurora-midnight/70 to-transparent lg:block"
        />

        {/* Who you are — small, top-left, on the sky. It was a 22px name at the
            head of a glass slab; the slab is what made the page feel like a
            phone blown up. */}
        <div className="absolute left-10 top-9 hidden items-center gap-3 lg:flex">
          <Avatar url={data.avatarUrl} name={data.displayName} size={38} />
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-semibold leading-tight text-white">
              {data.displayName}
            </p>
            {data.username && (
              <p className="truncate font-mono text-[11px] text-white/55">@{data.username}</p>
            )}
          </div>
        </div>

        <div className="absolute right-10 top-9 hidden items-center gap-2.5 lg:flex">
          {isSelf ? (
            <>
              <Link
                href="/app/chats"
                className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[12.5px] font-semibold text-white/90 backdrop-blur-md transition-colors hover:bg-white/[0.16]"
              >
                Ask Drift
              </Link>
              <Link
                href="/app/trips/new"
                className="rounded-full bg-gradient-to-r from-aurora-teal to-aurora-teal-end px-4 py-2 text-[12.5px] font-bold text-aurora-teal-ink transition-transform hover:scale-[1.02]"
              >
                Plan a trip
              </Link>
              <SignOutButton />
            </>
          ) : (
            follow
          )}
        </div>

        {/* THE ANCHOR — see `anchor` above. Set in the display serif at the
            size of a headline, not in a badge: the difference between a page
            that has a countdown on it and a page that is one. */}
        {anchor && (
          <div className="absolute bottom-8 right-10 hidden text-right leading-[0.78] lg:block">
            <span className="block font-drift-display text-[150px] font-black tracking-[-0.06em] text-[#FFB27A] [text-shadow:0_0_90px_rgba(255,178,122,0.28)] xl:text-[172px]">
              {anchor.n}
            </span>
            <span className="mr-1.5 mt-2.5 block font-mono text-[11px] uppercase tracking-[0.26em] text-white/70">
              {anchor.unit}
            </span>
          </div>
        )}

        {/* The statement — bottom-left, over the terminator. */}
        <div className="absolute inset-x-0 bottom-0 hidden px-10 pb-9 lg:block">
          <div className="max-w-[610px]">
            {data.featured && data.featuredHeader ? (
              <>
                <p className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.22em] text-aurora-teal">
                  {data.featuredHeader.title}
                  <span className="hidden h-px max-w-[110px] flex-1 bg-gradient-to-r from-aurora-teal/55 to-transparent sm:block" />
                </p>
                <Link
                  href={`/app/trips/${data.featured.id}`}
                  onMouseEnter={() => setFocusTripId(data.featured!.id)}
                  className="mt-3 block font-drift-display text-[52px] font-black leading-[0.94] tracking-[-0.042em] text-white transition-opacity hover:opacity-90 xl:text-[62px]"
                >
                  {data.featured.title}
                </Link>
                <p className="mt-4 font-mono text-[11.5px] text-white/75">
                  {[data.featured.dateLabel, data.featured.country, data.featured.city]
                    .filter(Boolean)
                    .join("  ·  ")}
                </p>
              </>
            ) : showStartHere ? (
              <>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-aurora-teal">
                  Start here
                </p>
                <h2 className="mt-3 font-drift-display text-[52px] font-black leading-[0.94] tracking-[-0.042em] text-white xl:text-[62px]">
                  Somebody already
                  <span className="block font-light italic text-white/70">did the hard part.</span>
                </h2>
                <p className="mt-4 font-mono text-[11.5px] text-white/75">
                  Every day in the order that worked  ·  Yours in one tap
                </p>
              </>
            ) : (
              <>
                <h2 className="font-drift-display text-[46px] font-black leading-[0.96] tracking-[-0.04em] text-white">
                  {isSelf ? "Your map, so far." : `${data.displayName}'s map.`}
                </h2>
                {hasStats && (
                  <p className="mt-4 font-mono text-[11.5px] text-white/75">
                    {data.countries} {data.countries === 1 ? "country" : "countries"}
                    {"  ·  "}
                    {data.followers} {data.followers === 1 ? "follower" : "followers"}
                    {"  ·  "}
                    {data.following} following
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ---------- Desktop: the measured column ---------- */}
      {/* A CAP, NOT A PERCENTAGE. Running cards to the edge of a 1920px display
          is what made this feel stretched — not the amount of content. The old
          rail was `xl:w-[54vw] xl:max-w-[860px]` pinned left, which spent every
          pixel to its right on an empty planet. */}
      {/* LEFT-ALIGNED, not centred. Centring a 1180px column inside a 1920px
          window pushes it ~330px right of the statement sitting directly above
          it in the band, and two left edges that nearly agree read as a
          mistake. Both now start at the same px-10 from the nav rail; the
          numeral holds the right side of the composition. */}
      <div className="hidden w-full max-w-[1180px] px-10 pb-20 lg:block">
        {/* Stats keep their row here when the statement above did not take
            them — see hasStats. Zero/zero/zero is a scoreboard of everything
            the reader has not done, so it stays gated. */}
        {hasStats && (data.featured || showStartHere) && (
          <div className="flex gap-8 border-b border-white/10 pb-5 pt-7">
            <Stat value={data.countries} label="Countries" href={statHref("/app/countries")} />
            <Stat value={data.followers} label="Followers" href={statHref("/app/people?tab=followers")} />
            <Stat value={data.following} label="Following" href={statHref("/app/people?tab=following")} />
          </div>
        )}

        {data.others.length > 0 && (
          <>
            <div className="mb-4 mt-8 flex items-baseline justify-between">
              <h3 className="font-drift-display text-[21px] font-bold tracking-[-0.015em]">
                Also planned
                <span className="ml-3 font-mono text-[11px] uppercase tracking-[0.14em] text-drift-muted">
                  {data.others.length} {data.others.length === 1 ? "trip" : "trips"}
                </span>
              </h3>
            </div>
            {/* ONE RATIO, NOT ONE HEIGHT. `h-[150px]` is correct in a 380px
                column and a 4:1 letterbox at 1000px — which is the whole of
                what "stretched" meant here. A ratio holds its shape at every
                width and only the column count changes. */}
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
              {data.others.map((t) => (
                <GridCard key={t.id} trip={t} onHover={() => setFocusTripId(t.id)} />
              ))}
            </div>
          </>
        )}

        {showStartHere && <StartHere promo={inspire} />}

        {allTrips.length === 0 && !isSelf && (
          <div className="py-16 text-center">
            <p className="text-3xl opacity-30">🗺</p>
            <p className="mt-2 text-[14px] text-drift-muted">No trips to show yet.</p>
          </div>
        )}

        {isSelf && !showStartHere && (
          <p className="mt-7 text-[13px] text-drift-muted">
            Or{" "}
            <Link href="/app/trips/new" className="text-drift-ink underline underline-offset-[3px]">
              start a trip from scratch
            </Link>
            .
          </p>
        )}
      </div>

      {/* Back chip, only when this is someone else's profile — the signed-in
          home is a tab root and has no up-path. Sits above the globe. */}
      {viewer.kind === "other" && (
        <div className="fixed left-4 top-4 z-20 lg:left-[100px]">
          <BackLink href={viewer.backHref} label="People" />
        </div>
      )}

      {/* ---------- Mobile: iOS sheet-over-globe ---------- */}
      {/* A COLUMN, not a margin — and that is the whole fix.
          `mt-[44vh] min-h-[56vh]` was right about the intent and wrong about
          the mechanism. 44vh of MARGIN collapses: none of the three ancestors
          between here and the protected layout has padding, a border or a
          formatting context to stop it, so the 357px escaped all the way out
          and offset the layout's own `min-h-screen` element by 357px. That
          element still measured a full viewport from its new origin, so the
          document ended 176px BELOW the sheet — an unfillable band of fixed
          globe under the panel, with `min-h-[56vh]` unable to reach it because
          it only ever described the FIRST screen.
          Now the globe's window is a real box and the sheet `grow`s to the
          bottom of a `100dvh` column, so its bottom edge IS the document's at
          any content length. The negative margin cancels the protected
          layout's dock padding, which would otherwise re-open the same band at
          64px; the sheet's own pb-28 clears the dock from inside. */}
      {/* pointer-events: the column now has a real box over the globe's 44vh
          where a margin used to be nothing at all. Without this the panel
          would silently swallow every drag and pinch on the planet. */}
      <div className="pointer-events-none relative z-10 -mb-[calc(4rem+env(safe-area-inset-bottom))] flex min-h-[100dvh] flex-col lg:hidden">
        <div className="h-[44vh] shrink-0" aria-hidden />
        <div className="pointer-events-auto grow rounded-t-[28px] bg-aurora-glass pb-28 shadow-[0_-8px_30px_rgba(0,0,0,0.25)]">
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

// Desktop grid card — an ASPECT RATIO, never a height.
//
// It replaces FeaturedCard (`h-[150px]`) and TripRow (a 48px thumbnail in a
// list). The height was the bug: correct in the 380px rail those were written
// for, a 4:1 letterbox once the rail grew past 1000px, which is exactly what
// "absurdly stretched" described. 4:3 holds at any column width, so widening
// the window changes how MANY cards sit in a row and nothing about their shape.
function GridCard({ trip, onHover }: { trip: HomeTrip; onHover: () => void }) {
  const flag = countryFlagEmoji(trip.country)
  return (
    <Link
      href={`/app/trips/${trip.id}`}
      onMouseEnter={onHover}
      className="group relative block aspect-[4/3] overflow-hidden rounded-[18px] border border-white/[0.08]"
    >
      <CardCover trip={trip} />
      {trip.isActive && (
        <span className="absolute left-3 top-3 rounded-full bg-drift-coral px-2.5 py-1 text-[10px] font-bold tracking-wide text-white">
          NOW TRAVELING
        </span>
      )}
      {flag && !trip.isActive && (
        <span className="absolute right-3 top-3 text-[18px] drop-shadow">{flag}</span>
      )}
      <div className="absolute inset-x-0 bottom-0 p-4">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-aurora-teal">
          {trip.dateLabel}
        </p>
        <p className="mt-1.5 font-drift-display text-[16.5px] font-semibold leading-[1.1] tracking-[-0.015em] text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
          {trip.title}
        </p>
      </div>
    </Link>
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
