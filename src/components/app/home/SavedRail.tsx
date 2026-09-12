import Link from "next/link"
import TripCoverImg from "@/components/app/TripCoverImg"
import CoverCredit from "@/components/app/CoverCredit"
import { Section, RailOrGrid } from "@/components/app/home/HomeSection"
import type { InspirePromoCard } from "@/lib/drift/inspirePromo"

// The guides this reader kept.
//
// WHERE IT SITS, AND WHY THERE. The page's laptop reading order is cockpit
// (yours) → Discover (near you) → Inspire (curated). Saved is YOURS, so it
// belongs on the near side of that boundary rather than wedged between the two
// supply bands — it goes directly above Discover, which puts its heading at the
// fold on a 900px viewport and makes its cards the first thing a scroll
// reveals. That is the right prominence for a shelf you built yourself and the
// wrong prominence for one we built for you, which is why Inspire stays below.
//
// WHAT WAS REJECTED. A third card in CtaRow is what the phone gets and what the
// user's words describe, but CtaRow is `lg:hidden` for a reason that persistence
// does not answer: at lg "Start a chat" IS the AskBar and "Create a trip" IS the
// coral + in the rail, so the row's members duplicate permanent controls. A
// seventh AppRail entry was cheap and still wrong — the rail's six entries are
// SECTIONS of the product and Saved is a view over one of them, the same shape
// as "All trips", which is a link inside its own column rather than a rail item.
// A fourth cockpit column would have to take width from the globe, which that
// redesign exists to have given width back to.
//
// SELF-REMOVING when empty, like DiscoverRail — a titled band with a hole under
// it is worse than no band.

export default function SavedRail({
  cards,
  total,
}: {
  cards: InspirePromoCard[]
  /** Everything saved, which may exceed what this band shows. */
  total: number
}) {
  if (cards.length === 0) return null

  return (
    <Section
      title="Saved"
      meta={`${total} ${total === 1 ? "guide" : "guides"}`}
      // Only when there is more than this band is showing — the same
      // conditional-action idiom the trips band uses, so the link never
      // promises a screen that repeats what is already on this one.
      action={total > cards.length ? "See all" : undefined}
      actionHref={total > cards.length ? "/app/saved" : undefined}
    >
      {/* Section + RailOrGrid rather than a hand-rolled list: the home had
          three of those once and they had already drifted on heading size and
          gaps, and RailOrGrid is ONE container that changes shape instead of
          two behind `lg:hidden` — `hidden` does not stop a browser fetching an
          image, so the laptop would otherwise pay for the phone's copy of every
          photograph. */}
      <RailOrGrid cols="lg:grid-cols-6 xl:grid-cols-8">
        {cards.map((c) => (
          <SavedCard key={c.href} card={c} />
        ))}
      </RailOrGrid>
    </Section>
  )
}

function SavedCard({ card }: { card: InspirePromoCard }) {
  return (
    <Link
      href={card.href}
      aria-label={card.aria}
      className="group relative block h-[218px] w-[164px] shrink-0 overflow-hidden rounded-hero border border-aurora-border outline-none focus-visible:ring-2 focus-visible:ring-aurora-teal/60 lg:h-[288px] lg:w-auto"
    >
      {/* showCredit={false} with the chip re-hung at the top, for the reason
          InspireRail's twin records: CoverCredit's own corner placement is
          bottom-right, directly under the card's bottom band. The attribution
          cannot be the thing that moves — Wikimedia's CC BY-SA and Unsplash's
          terms both bind it to the display. */}
      <TripCoverImg
        cover={card.cover}
        sizes="(max-width: 1024px) 164px, (max-width: 1280px) 220px, 190px"
        showCredit={false}
      />
      {card.cover.credit && (
        <div className="absolute right-2 top-2 z-10 [&>*]:mt-0">
          <CoverCredit
            text={card.cover.credit.text}
            href={card.cover.credit.href}
            placement="inline"
          />
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />

      {/* The heart, so this band reads as the same feature as the control that
          filled it. Non-interactive: it is inside the Link's own label, and
          this codebase has shipped cards that stopped opening once something
          tappable landed inside one. */}
      <span
        aria-hidden
        className="absolute left-2 top-2 z-10 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-black/45 text-aurora-teal backdrop-blur-sm"
      >
        <svg viewBox="0 0 24 24" className="h-[13px] w-[13px]" fill="currentColor">
          <path d="M20.8 5.6a5.2 5.2 0 0 0-7.4 0L12 7l-1.4-1.4a5.2 5.2 0 0 0-7.4 7.4l1.4 1.4L12 22l7.4-7.6 1.4-1.4a5.2 5.2 0 0 0 0-7.4z" />
        </svg>
      </span>

      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="line-clamp-3 font-drift-display text-[14px] font-bold leading-[1.18] text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]">
          {card.title}
        </p>
      </div>
    </Link>
  )
}
