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
  /** A node, not just a string: the home's Discover rail makes its own
   *  heading the place picker, so the title has to be able to be a control. */
  title: ReactNode
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

/** A single, independently scrollable shelf at every viewport width. */
export function Rail({ children }: { children: ReactNode }) {
  return <div className="home-shelf flex min-w-0 gap-3 overflow-x-auto overscroll-x-contain px-5 pb-3 lg:gap-4 lg:px-10" tabIndex={0} role="region" aria-label="Scroll through this shelf">{children}</div>
}

/** Compatibility for saved surfaces that share the same shelf. */
export function RailOrGrid({ children }: { children: ReactNode; cols?: string }) {
  return <Rail>{children}</Rail>
}

/**
 * The last card in a rail: "see all of this".
 *
 * AT THE END OF THE SCROLL, not under the section. A rail's own gesture already
 * ends somewhere — you swipe until the cards run out — and that is the moment
 * the reader has just established they want more of them. A button below the
 * band answers the same question a scroll earlier, in a place the thumb is not.
 *
 * It takes its geometry from the rail rather than owning any, because the two
 * rails are different shapes (Discover's places are 132x152, Inspire's guides
 * 164x218) and a See-all that is not exactly the size of its neighbours reads
 * as a card that failed to load its photograph.
 *
 * On a laptop `RailOrGrid` turns the rail into a grid, so this stops being "the
 * end of the scroll" and becomes the last cell — which is why the sections that
 * use it keep their heading link too. Same destination, two affordances, one
 * per shape.
 */
export function SeeAllCard({
  href,
  label,
  className = "",
}: {
  href: string
  label: string
  /** The neighbouring card's size and corner, passed down by the rail. */
  className?: string
}) {
  return (
    <Link
      href={href}
      className={`group flex shrink-0 flex-col items-center justify-center gap-2.5 border border-aurora-border bg-aurora-glass text-center outline-none transition-colors hover:bg-aurora-glass2 focus-visible:ring-2 focus-visible:ring-aurora-teal/60 ${className}`}
    >
      <span
        aria-hidden="true"
        className="grid h-9 w-9 place-items-center rounded-full bg-aurora-teal/15 text-[15px] text-aurora-teal transition-transform group-hover:translate-x-0.5"
      >
        &rarr;
      </span>
      <span className="px-3 text-[12.5px] font-semibold leading-tight text-aurora-ink2">
        {label}
      </span>
    </Link>
  )
}
