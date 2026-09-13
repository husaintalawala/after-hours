import Link from "next/link"
import TripCoverImg from "@/components/app/TripCoverImg"
import CoverCredit from "@/components/app/CoverCredit"
import { Section, RailOrGrid, SeeAllCard } from "@/components/app/home/HomeSection"
import type { InspirePromo, InspirePromoCard } from "@/lib/drift/inspirePromo"

// The curated shelf, as a rail on the home.
//
// It used to appear ONLY for an account with no trips of its own (StartHere) —
// which meant the single best answer to "what does a good trip look like" was
// hidden from everyone the moment they made one. Forty finished, photographed
// guides are worth a band on the home permanently, not a consolation prize for
// an empty one.

export default function InspireRail({ promo }: { promo: InspirePromo }) {
  // hero + rest are a DECK's shape — one big card and some small ones. A rail
  // has no hero, so they flatten back into a single ordered list here rather
  // than the builder growing a second projection for the same rows.
  const cards = [promo.hero, ...promo.rest].filter(Boolean)
  if (cards.length === 0) return null

  return (
    <Section
      title="Trips worth stealing"
      meta={`${promo.total} guides`}
      action="See all"
      actionHref="/app/inspire"
    >
      <RailOrGrid>
        {cards.slice(0, 8).map((c) => (
          <InspireCard key={c.tripId} card={c} />
        ))}
        {/* Ninety guides, eight cards. The end of the swipe is where the reader
            has just finished the eight and is still going. */}
        <SeeAllCard
          href="/app/inspire"
          label={`All ${promo.total} guides`}
          className="h-[218px] w-[164px] rounded-hero lg:h-[320px] lg:w-[256px]"
        />
      </RailOrGrid>
    </Section>
  )
}

function InspireCard({ card }: { card: InspirePromoCard }) {
  return (
    <Link
      href={card.href}
      aria-label={card.aria}
      className="group relative block h-[218px] w-[164px] shrink-0 overflow-hidden rounded-hero border border-aurora-border outline-none focus-visible:ring-2 focus-visible:ring-aurora-teal/60 lg:h-[320px] lg:w-[256px]"
    >
      {/* showCredit={false} and the chip re-hung at the TOP, because
          CoverCredit's own "corner" placement is `absolute bottom-1.5
          right-1.5` — inside the block that spans the full width of this card's
          bottom, so the two were drawn on top of each other. The attribution
          cannot be the thing that moves off (Wikimedia's CC BY-SA and Unsplash's
          terms both bind it to the display), so the copy keeps the bottom and
          the credit takes the top corner. Still true with the pill gone: the
          kicker and title occupy that corner on their own. */}
      <TripCoverImg cover={card.cover} sizes="(max-width: 1024px) 164px, 256px" showCredit={false} />
      {card.cover.credit && (
        <div className="absolute right-2 top-2 z-10 [&>*]:mt-0">
          <CoverCredit
            text={card.cover.credit.text}
            href={card.cover.credit.href}
            placement="inline"
          />
        </div>
      )}

      {/* THE SCRIM. Every card on this page sits type over a photograph, and a
          photograph is whatever the photographer shot — a white-walled Santorini
          hero renders white-on-white without this. It is a hard requirement, not
          a finish. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.05) 38%, rgba(0,0,0,0.78))" }}
      />

      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.15em] text-aurora-teal">
          {card.kicker}
        </p>
        <p className="mt-1 line-clamp-2 font-drift-display text-[14.5px] font-bold leading-[1.15] tracking-[-0.015em] text-white">
          {card.title}
        </p>
        {/* NO "Make it mine" PILL. It was stamped on every card in the rail,
            which is where it stopped being an invitation and became wallpaper —
            the same four words repeated across a scrolling row, under headline
            copy already doing the selling. It was never the thing you tapped
            either: the whole card is the link and the guide carries the real
            action, so it only looked like a button. */}
      </div>
    </Link>
  )
}
