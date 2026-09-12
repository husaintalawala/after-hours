"use client"

import Link from "next/link"

/**
 * The two ways to start something, immediately under the greeting.
 *
 * TWO, NOT THREE, and they are the phone's cards rather than the web's. This
 * was a rail of three flat gradient tiles with a stroked icon in the corner —
 * Create a trip, Start a chat, and a "New collection" that had no route, no
 * table and no component behind it and rendered inert under a "Soon" chip. A
 * card that cannot be tapped is not a way to start something; it is an
 * advertisement for something that does not exist, occupying a third of the
 * most valuable row on the page.
 *
 * What replaces it is the composition iOS already ships, ported rather than
 * reinvented so the two homes read as one product: the commissioned figurines
 * on their own ground, each card its own colour. The artwork is the same asset
 * the app draws, keyed out to alpha so the ground belongs to the card and not
 * to the picture — which is why these are PNGs with transparency rather than
 * the flat teal slabs they started as.
 *
 * Every number below is iOS's, deliberately. See HomeCtaCardBody.
 */

/** The ground a card is drawn on — HomeCtaGround, in hex.
 *
 *  Teal was not an arbitrary choice on the original artwork: it is coral's
 *  complement, and both figures are coral. So the replacements have to keep
 *  that separation, which indigo and plum both do. */
interface Ground {
  top: string
  bottom: string
  /** The light the figure stands in — what stops a plain gradient reading as
   *  empty space. */
  glow: string
}

const INDIGO_NIGHT: Ground = { top: "#3D3A8C", bottom: "#181440", glow: "#8278FF" }
const DEEP_PLUM: Ground = { top: "#5C2868", bottom: "#281036", glow: "#D26EDC" }

interface Cta {
  key: string
  title: string
  href: string
  art: string
  ground: Ground
}

const CTAS: Cta[] = [
  {
    key: "trip",
    title: "Create a trip",
    href: "/app/trips/new",
    art: "/cta/create-trip.png",
    ground: INDIGO_NIGHT,
  },
  {
    key: "chat",
    title: "Start a chat",
    href: "/app/chats",
    art: "/cta/start-chat.png",
    ground: DEEP_PLUM,
  },
]

export default function CtaRow({ stacked = false }: { stacked?: boolean }) {
  // STACKED is the laptop's zero-trip column. The rail version is `lg:hidden`
  // because an established account already has both actions in the nav rail and
  // the "+" button — but an account with no trips has neither a featured card to
  // put in that column nor any other visible way to make one, so the same two
  // cards fill it instead of a hole.
  if (stacked) {
    return (
      <div className="flex h-full min-h-[290px] flex-col gap-3">
        {CTAS.map((c) => (
          <CtaCard key={c.key} cta={c} stacked />
        ))}
      </div>
    )
  }

  return (
    // A RAIL on a phone, where two 172px cards plus the page's own padding
    // overflow a 360px screen; a plain row once there is width for it.
    <div className="mt-6 -mx-5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:overflow-visible lg:px-0">
      <div className="flex w-max gap-3">
        {CTAS.map((c) => (
          <CtaCard key={c.key} cta={c} />
        ))}
      </div>
    </div>
  )
}

function CtaCard({ cta, stacked = false }: { cta: Cta; stacked?: boolean }) {
  const { ground } = cta
  return (
    <Link
      href={cta.href}
      className={`relative flex items-end overflow-hidden rounded-hero outline-none transition-transform hover:scale-[1.015] focus-visible:ring-2 focus-visible:ring-aurora-ink/70 active:scale-[0.985] ${
        stacked ? "w-full flex-1" : "h-[126px] w-[172px] shrink-0"
      }`}
      style={{ background: `linear-gradient(135deg, ${ground.top}, ${ground.bottom})` }}
    >
      {/* The light the figure stands in. 118px is iOS's endRadius, and the card
          is the same 172x126 there, so the number transfers unchanged. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(118px circle at 68% 40%, ${ground.glow}6B, transparent 100%)`,
        }}
      />

      {/* THE ART IS 516x378 — aspect 1.365, which is EXACTLY the 172x126 rail
          card. That is why `object-cover` is safe there and crops nothing, and
          why the 16px lift costs only a sliver off the top: it is the only
          thing removing anything. The lift is there because the subject spans
          x 47-96% and the label x 10-63%, so at rest the words landed on the
          scooter's wheel.

          THE STACKED CARD IS A DIFFERENT SHAPE, and cover was wrong for it. Its
          column is 300px wide with `min-h-[290px]` over two flex-1 cards and a
          12px gap, so each is about 300x139 — aspect 2.158 against the art's
          1.365. Cover scales to fill the width, drawing the art 220px tall into
          a 139px box: 81px of vertical overflow, 40px of it off the top once
          centred, and the lift takes 16px more. Twenty-six percent of the
          illustration cut off the top, which is where the figures' heads are.

          So the wide card COVERS FROM THE TOP and takes its loss at the bottom
          instead. There is no framing of a 1.365 picture in a 2.158 box that
          loses nothing; the only choice is WHERE. `object-contain` was tried
          and rejected by looking at it: nothing is cut, but the figure shrinks
          to the right third and the card reads as mostly empty gradient.
          Anchored top, the figure stays full size, every head and the umbrella
          are intact, and what goes is the underside of the beanbag and the
          bottom of the scooter's wheels — which sit under the label and the
          scrim and read as the illustration continuing past the frame.

          No lift on that variant: the 16px was there to keep the figure off the
          label, and a crop that already starts at the top has none to spare. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cta.art}
        alt=""
        aria-hidden
        className={`pointer-events-none absolute inset-0 h-full w-full object-cover ${
          stacked ? "object-top" : "-translate-y-4"
        }`}
      />

      {/* Carries white type over whatever the figure's colours are doing. Soft
          stops across the whole card: a fixed-height band drew a hard seam
          straight through the illustration. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, transparent 45%, rgba(0,0,0,0.20) 72%, rgba(0,0,0,0.52) 100%)",
        }}
      />

      {/* GLOSS, NOT GLASS. A backdrop blur turns this artwork into a smear; a
          specular wash adds the wet look without touching what is under it. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 mix-blend-soft-light"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.09) 28%, transparent 52%)",
        }}
      />

      {/* ONE LINE at 14.5px — 16px across this width wrapped "Create / a trip"
          onto two rows and pushed the first letter into the corner radius. */}
      <span
        className="relative z-10 block truncate pb-[15px] pl-[18px] pr-3 font-drift-display text-[14.5px] font-bold text-white"
        style={{ textShadow: "0 1px 4px rgba(0,0,0,0.45)" }}
      >
        {cta.title}
      </span>
    </Link>
  )
}
