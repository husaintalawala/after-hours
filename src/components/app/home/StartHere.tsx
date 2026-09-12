import Link from "next/link"
import type { InspirePromo } from "@/lib/drift/inspirePromo"

/**
 * The one step an account with no trips should take next.
 *
 * IT USED TO BE THE SHELF, AGAIN. This drew a full-width hero plus a four-tile
 * grid of curated guides — and InspireRail, which renders directly above it on
 * the same screen, draws `[hero, ...rest].slice(0, 8)` from the same promo. So
 * seven guides appeared twice and the hero three times, and roughly two thirds
 * of a brand-new account's home was the same seven trips repeated. The shelf is
 * a good pitch; it does not get to make itself three times.
 *
 * What is left is the thing the shelf was arguing FOR. The band above says
 * "here is what a finished trip looks like"; this is the answer to it, and the
 * order matters — the button lands after the pitch, not before it.
 *
 * THE PRIMARY IS "start from scratch", which inverts the old ranking. The
 * reasoning then was that copying a finished trip is two taps while the new-trip
 * form is the longest road, so the photograph should be the button and scratch
 * should be a line of small text. That is true about effort and wrong about
 * rank: it left the one account that has never made anything with its single
 * most important action rendered as an underlined fragment of a sentence.
 * Copying is still one tap away — every card above IS that tap.
 *
 * "Point. Tap. Go. / The planning's already done." goes with the duplicate
 * deck. It is marketing voice inside a signed-in product, restating in words
 * what the band above it had just shown in photographs.
 */
export default function StartHere({
  promo,
}: {
  promo: InspirePromo | null
  /** Accepted and unused — this band is the same at every width. */
  dense?: boolean
}) {
  return (
    <div className="flex flex-col items-start gap-3 border-t border-aurora-border pt-5 sm:flex-row sm:items-center sm:gap-4">
      <Link
        href="/app/trips/new"
        className="inline-flex items-center gap-2 rounded-full bg-aurora-teal px-5 py-2.5 font-drift-display text-[14px] font-bold text-aurora-teal-ink outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-aurora-teal/50"
      >
        Start your first trip
        <span aria-hidden="true">&rarr;</span>
      </Link>

      {/* The count is READ from the shelf, never typed into the sentence — the
          corpus grows, and copy that lies about its own size is worse than copy
          with no number in it. Absent entirely when the shelf failed to load,
          rather than offering to copy from a deck that is not on screen. */}
      {promo && (
        <Link
          href="/app/inspire"
          className="text-[13px] text-aurora-ink3 underline-offset-2 outline-none hover:text-aurora-ink2 hover:underline focus-visible:ring-2 focus-visible:ring-aurora-teal/50"
        >
          Or copy one of {promo.total} finished trips
        </Link>
      )}
    </div>
  )
}
