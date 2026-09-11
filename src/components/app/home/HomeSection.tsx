import Link from "next/link"
import type { ReactNode } from "react"

// The two shapes every band on the home is built from: a titled section, and a
// horizontal rail inside it.
//
// They exist as one pair rather than three hand-rolled copies because the home
// now has three rails (your trips, Discover, Inspire) and the previous screen's
// two lists had already drifted — different heading sizes, different gaps, one
// with a count and one without.

export function Section({
  title,
  /** Small right-aligned link — "Explore", "See all". Omitted when there is nowhere to go. */
  action,
  actionHref,
  /** Sits inline after the title, quieter — "3 trips". */
  meta,
  children,
  className = "",
  /**
   * Keep the heading on a phone, drop it on a laptop.
   *
   * For the cockpit row, where the band holds three different subjects side by
   * side — a trip, a globe, a chat list — and a heading reading "Your trips"
   * would be labelling only the left third of what sits under it. Stacked on a
   * phone the same heading is correct again, because there the trip really is
   * the next thing down.
   */
  hideTitleOnDesktop = false,
}: {
  title: string
  action?: string
  actionHref?: string
  meta?: string
  children: ReactNode
  className?: string
  hideTitleOnDesktop?: boolean
}) {
  return (
    <section className={`mt-8 ${className}`}>
      <div
        className={`flex items-baseline justify-between gap-4 px-5 lg:px-10 ${
          hideTitleOnDesktop ? "lg:hidden" : ""
        }`}
      >
        <h2 className="font-drift-display text-[19px] font-bold tracking-[-0.02em] text-aurora-ink sm:text-[21px] lg:text-[24px]">
          {title}
          {/* whitespace-nowrap, and it is load-bearing at 375px. "Trips worth
              stealing" plus "90 guides" plus "See all" does not fit one phone
              line, and without this the count breaks mid-phrase — "90" on one
              line and "GUIDES" alone on the next. The title may wrap; the
              count is two words that mean nothing apart. */}
          {meta && (
            <span className="ml-2.5 whitespace-nowrap font-mono text-[10.5px] font-normal uppercase tracking-[0.14em] text-aurora-ink3">
              {meta}
            </span>
          )}
        </h2>
        {action && actionHref && (
          <Link
            href={actionHref}
            className="shrink-0 rounded text-[12.5px] font-semibold text-aurora-teal outline-none transition-opacity hover:opacity-75 focus-visible:ring-2 focus-visible:ring-aurora-teal/50"
          >
            {action}
          </Link>
        )}
      </div>
      <div className={hideTitleOnDesktop ? "mt-3 lg:mt-0" : "mt-3"}>{children}</div>
    </section>
  )
}

/**
 * The laptop answer to a rail: a grid that fills the width.
 *
 * A rail is the right shape on a phone — swipe is the native gesture and the
 * cards are bigger than the screen. On a laptop it shows three and a half cards
 * out of ninety behind a hidden scrollbar, which is the opposite of what all
 * that width is for. Same cards, laid out rather than queued.
 */
export function RailOrGrid({
  children,
  cols = "lg:grid-cols-6",
}: {
  children: ReactNode
  cols?: string
}) {
  return (
    // ONE container that changes shape, not two that hide each other. Rendering
    // the cards twice behind `lg:hidden` / `hidden lg:grid` would be the
    // simpler JSX and would also put every cover in the DOM twice — `hidden`
    // does not stop a browser fetching an image, so the laptop would pay for
    // the phone's copy of all six photographs and vice versa.
    <div
      className={`-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:grid lg:gap-3.5 lg:overflow-visible lg:px-10 lg:pb-0 ${cols}`}
    >
      {children}
    </div>
  )
}

/**
 * A horizontal scroller that bleeds to the screen edge but starts flush with
 * the section title above it.
 *
 * `-mx-5 px-5` is what does that: the negative margin cancels the page gutter
 * so the track runs edge to edge, and the padding puts the first card back
 * where the heading starts. Without it a rail either starts inset from its own
 * title, or its last card stops short of the edge and looks clipped.
 *
 * Scrollbars are hidden on purpose — on a phone there is never one, and on
 * desktop a permanent grey bar under every rail is three bars of chrome for a
 * gesture the trackpad already does.
 */
export function Rail({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:-mx-10 lg:px-10">
      <div className="flex w-max gap-3">{children}</div>
    </div>
  )
}
