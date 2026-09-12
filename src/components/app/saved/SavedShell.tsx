import Link from "next/link"
import TripCoverImg from "@/components/app/TripCoverImg"
import CoverCredit from "@/components/app/CoverCredit"
import BackLink from "@/components/app/BackLink"
import type { InspirePromoCard } from "@/lib/drift/inspirePromo"

/**
 * The Saved screen's rendering half.
 *
 * A GRID, not the home's rail. A rail is right on the home, where Saved is one
 * band among several; here it is the whole page, and queueing a collection
 * behind a horizontal scroll is the shape this page exists to replace — the
 * same reasoning the all-trips archive records.
 *
 * Sized to match the Inspire shelf's own column rather than inventing a third
 * width for the app.
 */
export default function SavedShell({
  cards,
  savedCount,
}: {
  cards: InspirePromoCard[]
  /** What is SAVED, which can exceed what resolved — see the empty state. */
  savedCount: number
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-28 pt-6 lg:max-w-[1100px] lg:px-8">
      <div className="flex items-center gap-4">
        <BackLink href="/app" label="home" />
        <h1 className="font-drift-display text-[24px] font-bold tracking-[-0.02em] text-aurora-ink lg:text-[28px]">
          Saved
          {savedCount > 0 && (
            <span className="ml-3 whitespace-nowrap font-mono text-[11px] font-normal uppercase tracking-[0.14em] text-aurora-ink3">
              {savedCount} {savedCount === 1 ? "guide" : "guides"}
            </span>
          )}
        </h1>
      </div>

      {cards.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="font-drift-display text-[18px] font-semibold text-aurora-ink">
            {savedCount > 0 ? "These guides are no longer listed" : "Nothing saved yet"}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-drift-muted">
            {savedCount > 0
              ? // A guide is de-listed by is_active = false, which leaves the
                // save intact and merely unresolvable. Saying so beats
                // claiming the account has nothing.
                "They were taken off the shelf after you saved them. Nothing has been deleted."
              : "Tap the heart on a guide to keep it here."}
          </p>
          <Link
            href="/app/inspire"
            className="mt-5 inline-block rounded-full bg-aurora-teal px-4 py-2 text-[13px] font-semibold text-aurora-teal-ink"
          >
            Browse guides
          </Link>
        </div>
      ) : (
        <div className="mt-7 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
          {cards.map((c) => (
            <SavedGridCard key={c.href} card={c} />
          ))}
        </div>
      )}
    </div>
  )
}

function SavedGridCard({ card }: { card: InspirePromoCard }) {
  return (
    <Link
      href={card.href}
      aria-label={card.aria}
      className="group relative block h-[230px] overflow-hidden rounded-hero border border-aurora-border outline-none focus-visible:ring-2 focus-visible:ring-aurora-teal/60"
    >
      {/* The credit takes the top corner and the title keeps the bottom — the
          collision the Inspire cards already record. The attribution is not the
          thing that moves: Wikimedia's CC BY-SA and Unsplash's terms both bind
          it to the display. */}
      <TripCoverImg
        cover={card.cover}
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 260px"
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
      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.15em] text-aurora-teal">
          {card.kicker}
        </p>
        <p className="mt-1 line-clamp-3 font-drift-display text-[14px] font-bold leading-[1.18] text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]">
          {card.title}
        </p>
      </div>
    </Link>
  )
}
