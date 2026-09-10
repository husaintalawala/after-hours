"use client"

import Link from "next/link"
import dynamic from "next/dynamic"
import type { GlobeTripPin } from "@/components/app/GlobeHero"

// mapbox-gl is ~1.7MB — still lazy, still client-only. Contained in a 132px
// box now rather than filling the viewport, but it is the same cost to load.
const GlobeHero = dynamic(() => import("@/components/app/GlobeHero"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-aurora-glass2" />,
})

/**
 * Your passport — where the globe and the three figures both live now.
 *
 * The figures used to be a bare row of three numbers directly under the
 * greeting, which on a new account read "1 · 0 · 0" in white at full size: a
 * scoreboard of everything the reader has not done yet, placed third on their
 * first screen. And the globe used to be the room the whole page floated in.
 *
 * Both problems have the same answer. The globe is Drift's one irreplaceable
 * image, so it is not deleted — it is CONTAINED, made the illustration for a
 * panel whose subject is exactly what it shows. The figures come with it,
 * demoted to captions on that panel, because "how many countries" is a fact
 * about the globe and not a headline about the person.
 */
export default function PassportPanel({
  countries,
  followers,
  following,
  pins,
  /** Someone else's profile: their figures, no link to YOUR map. */
  isSelf,
}: {
  countries: number
  followers: number
  following: number
  pins: GlobeTripPin[]
  isSelf: boolean
}) {
  // The sentence is about the globe beside it, so it counts stamps and nothing
  // else. Three states, and the empty one is deliberately forward-looking:
  // "no stamps yet" is a fact, "the globe fills in as you travel" is what the
  // reader is being invited to do about it.
  const line =
    countries === 0
      ? "No stamps yet. The globe fills in as you travel."
      : countries === 1
        ? "One country stamped. The globe fills in as you travel."
        : `${countries} countries stamped. The globe fills in as you travel.`

  const body = (
    <>
      <div className="relative z-10 flex min-w-0 flex-1 flex-col justify-between py-1">
        <div className="min-w-0">
          <h2 className="font-drift-display text-[18px] font-bold tracking-[-0.02em] text-aurora-ink sm:text-[20px]">
            Your passport
          </h2>
          {/* A PERCENTAGE, not a ch measure. `max-w-[30ch]` is a fact about the
              font and none about the panel, so at 375px the last word of the
              first line ran out over the globe's faded edge — still legible,
              but type over imagery it did not need to be over. Two thirds of
              the card leaves the illustration its own third at every width. */}
          <p className="mt-1.5 max-w-[64%] text-[12.5px] leading-snug text-aurora-ink2 sm:max-w-[58%]">
            {line}
          </p>
        </div>

        {/* Small, at the foot, and glanceable — the opposite of the row this
            replaces. */}
        <dl className="mt-4 flex gap-5">
          <Figure value={countries} label="Countries" />
          <Figure value={followers} label="Followers" />
          <Figure value={following} label="Following" />
        </dl>
      </div>

      {/* The globe, contained.
          `overflow-hidden` on the panel is what holds it — the old full-bleed
          version was `fixed inset-0`, which is inside none of its ancestors and
          so could not be contained by any of them.

          THE CONTROLS ARE HIDDEN, not disabled. GlobeHero adds a
          NavigationControl unconditionally, which is right for the full-screen
          planet it was written for and wrong for a 168px illustration — the
          +/− buttons rendered over the panel's edge. The wrapper is already
          pointer-events-none so they were never clickable; they only needed to
          stop being drawn. Hidden HERE rather than by adding a prop to
          GlobeHero, so no other caller's globe changes.

          MASKED rather than clipped to a hard circle. A disc of satellite
          imagery with a crisp edge reads as a sticker pasted on the card; a
          radial fade lets it dissolve into the panel, which is what makes it
          an illustration rather than a second window. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-5 top-1/2 h-[190px] w-[190px] -translate-y-1/2 opacity-90 [&_.mapboxgl-ctrl-group]:hidden [&_.mapboxgl-ctrl]:hidden sm:-right-2 sm:h-[210px] sm:w-[210px]"
        style={{
          maskImage: "radial-gradient(circle at 62% 50%, #000 42%, rgba(0,0,0,0.55) 66%, transparent 82%)",
          WebkitMaskImage:
            "radial-gradient(circle at 62% 50%, #000 42%, rgba(0,0,0,0.55) 66%, transparent 82%)",
        }}
      >
        <GlobeHero pins={pins} focusTripId={null} zoom={1.2} />
      </div>
    </>
  )

  const shell =
    "relative flex min-h-[142px] items-stretch gap-3 overflow-hidden rounded-hero " +
    "border border-aurora-border bg-aurora-glass px-4 py-4 sm:min-h-[160px] sm:px-5"

  // The whole panel is the target, and it opens the GLOBE — /app/map, the 3D
  // planet with your trips on it as cover-photo pins.
  //
  // It used to point at /app/countries, which is a flat choropleth with two
  // stat tiles and a Visited / Not-yet legend. That is a good page answering a
  // different question ("how much of the world have I coloured in"), and it is
  // not what anybody means by Drift's globe. The stats live on as a strip under
  // the planet, one tap away.
  if (!isSelf) return <div className={shell}>{body}</div>

  return (
    <Link
      href="/app/map"
      aria-label="Your passport — open the globe"
      className={`${shell} outline-none transition-colors hover:border-aurora-border-strong focus-visible:ring-2 focus-visible:ring-aurora-teal/60`}
    >
      {body}
    </Link>
  )
}

/**
 * One figure.
 *
 * ZERO IS GREY, and that is the whole point of this component existing.
 *
 * Rendered at the same weight and the same white as a real number, a nought is
 * a statement that you have none — and three of them stacked is a wall of
 * failure on the first screen of a brand-new account. Muted, it reads as a
 * field waiting to be filled instead. The number is still there and still
 * honest; only its confidence changes.
 */
function Figure({ value, label }: { value: number; label: string }) {
  const zero = value === 0
  return (
    <div>
      <dd
        className={`text-[16px] font-bold leading-tight tabular-nums ${
          zero ? "text-aurora-ink3" : "text-aurora-ink"
        }`}
      >
        {value}
      </dd>
      <dt className={`text-[10.5px] ${zero ? "text-aurora-ink3/70" : "text-aurora-ink3"}`}>
        {label}
      </dt>
    </div>
  )
}
