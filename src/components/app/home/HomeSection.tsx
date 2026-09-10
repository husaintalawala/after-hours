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
}: {
  title: string
  action?: string
  actionHref?: string
  meta?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`mt-8 ${className}`}>
      <div className="flex items-baseline justify-between gap-4 px-5 lg:px-10">
        <h2 className="font-drift-display text-[19px] font-bold tracking-[-0.02em] text-aurora-ink sm:text-[21px] lg:text-[24px]">
          {title}
          {meta && (
            <span className="ml-2.5 font-mono text-[10.5px] font-normal uppercase tracking-[0.14em] text-aurora-ink3">
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
      <div className="mt-3">{children}</div>
    </section>
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
