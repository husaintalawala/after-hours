import Link from "next/link"
import TripCoverImg from "@/components/app/TripCoverImg"
import CoverCredit from "@/components/app/CoverCredit"
import { Section, Rail } from "@/components/app/home/HomeSection"
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
      <Rail>
        {cards.map((c) => (
          <InspireCard key={c.tripId} card={c} />
        ))}
      </Rail>
    </Section>
  )
}

function InspireCard({ card }: { card: InspirePromoCard }) {
  return (
    <Link
      href={card.href}
      aria-label={card.aria}
      className="group relative block h-[218px] w-[164px] shrink-0 overflow-hidden rounded-hero border border-aurora-border outline-none focus-visible:ring-2 focus-visible:ring-aurora-teal/60"
    >
      {/* showCredit={false} and the chip re-hung at the TOP, because
          CoverCredit's own "corner" placement is `absolute bottom-1.5
          right-1.5` — directly underneath "Make it mine", which spans the full
          width of this card's bottom. The two were drawn on top of each other.
          The attribution cannot be the thing that moves off (Wikimedia's CC
          BY-SA and Unsplash's terms both bind it to the display), so the button
          keeps the bottom and the credit takes the top corner. */}
      <TripCoverImg cover={card.cover} sizes="164px" showCredit={false} />
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
        {/* The affordance, not a second button: the whole card already goes to
            the guide, and that guide is where the copy actually happens. A real
            <button> here would either duplicate the link or need a copy
            endpoint this rail has no business owning. */}
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/[0.14] px-2.5 py-1 text-[10.5px] font-bold text-white backdrop-blur-sm transition-colors group-hover:bg-aurora-teal group-hover:text-aurora-teal-ink">
          Make it mine
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h13M12 5l7 7-7 7" />
          </svg>
        </span>
      </div>
    </Link>
  )
}
