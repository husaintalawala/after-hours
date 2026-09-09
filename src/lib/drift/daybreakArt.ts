import type { TripCoverResult } from "./tripCover"

/**
 * The photographs the first-run flow is built on. Port of
 * Drift/Core/DaybreakArt.swift.
 *
 * WHY THIS EXISTS. The flow asked six questions over a CSS gradient — in an app
 * whose entire asset is 108 photographed places, a person could answer four
 * screens before seeing one. Every image this hands back is already in the
 * corpus, is already credited, and is chosen by the same rule the shelf uses, so
 * nothing here is a new asset or a curator's decision baked into code.
 *
 * NOTHING IS HARDCODED. The tile for "Nature & wildlife" shows Reykjavík because
 * the highest-ranked guide tagged `wild` genuinely starts there — not because a
 * place name was typed into this file. Re-rank the shelf or retag a guide and
 * these follow, which is the only version of this that cannot go stale.
 *
 * CREDIT TRAVELS WITH THE PICTURE. Both licences bind attribution to the
 * DISPLAY, so a photo without its credit is not a styling choice. `Plate` is a
 * `TripCoverResult` and nothing else, which means every photograph in this flow
 * reaches the screen through TripCoverImg — the one component that cannot draw a
 * stock photo without drawing its credit. iOS returns the credit in the same
 * struct as the URL for the same reason; this is the web shape of that promise,
 * reusing the chain the rest of the app already goes through rather than
 * inventing a third way to render an attributed photo.
 *
 * PURE, and it imports only a type. It is exercised by daybreakArt.test.ts under
 * `node --experimental-strip-types`, which cannot resolve the `@/` alias — so
 * the shelf arrives as the structural `PlatedGuide` below rather than as
 * DaybreakGuide, the same trick RankableGuide plays in daybreak.ts.
 */

/** One photograph, and the attribution bound to it. */
export interface Plate {
  cover: TripCoverResult
  /** The real place, for the small caption under a mosaic tile. */
  place: string | null
}

/** Everything the picture-picking reads, and nothing else. */
export interface PlatedGuide {
  /** The shape tags the row stores (`wild`, `stones`, …). */
  tags: string[]
  /** The face of this guide at tile size — its first photographed stop, or its
   *  hero when no stop carries one. See buildDaybreakShelf. */
  tile: Plate
  /** The hero at full-bleed width. */
  backdrop: Plate
}

/**
 * The picture for one shape tag: the tile of the highest-ranked guide carrying
 * it.
 *
 * The shelf arrives in rank order, so `find` IS "highest ranked" — the same
 * assumption categoriesWithCounts and the deck already make, kept rather than
 * re-sorted so all three cannot disagree.
 *
 * Null when no guide carries the tag, which the caller draws as the tile's own
 * placeholder rather than as a hole.
 */
export function plateForTag<T extends PlatedGuide>(
  tag: string,
  shelf: readonly T[]
): Plate | null {
  return shelf.find((g) => g.tags.includes(tag))?.tile ?? null
}

/**
 * The full-bleed ground for a screen.
 *
 * Walks DOWN the shelf so consecutive screens are not the same picture —
 * `offset` is the screen index, and the modulo means a short shelf repeats
 * rather than returning nothing. A flow with a blank screen in it is worse than
 * one that shows Iceland twice.
 */
export function backdropAt<T extends PlatedGuide>(
  offset: number,
  shelf: readonly T[]
): Plate | null {
  if (!shelf.length) return null
  return shelf[offset % shelf.length].backdrop
}
