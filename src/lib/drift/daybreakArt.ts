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
 * NOTHING IS HARDCODED. A tile shows what it shows because a guide carrying that
 * tag genuinely goes there — not because a place name was typed into this file.
 * Re-rank the shelf or retag a guide and these follow, which is the only version
 * of this that cannot go stale.
 *
 * THAT WAS NOT SUFFICIENT, and this note used to offer the counter-example as
 * the proof: "the tile for Nature & wildlife shows Reykjavík because the
 * highest-ranked guide tagged `wild` genuinely starts there". STARTS there — the
 * arrival city, which every guide photographs and which is never what a category
 * is named for. Not hardcoded and still wrong: the rule was derived, and derived
 * the anti-correlation. Both halves of the fix are below and in
 * buildDaybreakShelf; neither is visible from inside a single tile.
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
  /** The face of this guide at tile size — a photographed stop it travels on
   *  to, else its arrival, else its hero. See buildDaybreakShelf. */
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
 * One picture per tag, chosen TOGETHER, so no guide serves two tiles.
 *
 * The rule that made this necessary is invisible from inside a single tile: the
 * shelf's top guides carry several shape tags each, so the same trip won
 * `plateForTag` for several of them and three of the seven tiles came back as
 * the identical Positano storm — "seven tiles all showing the same three covers
 * would say less than seven words did", which is the failure the per-stop rule
 * in buildDaybreakShelf was already trying to avoid.
 *
 * Tags are served in the order given and a guide is spent once. A tag whose
 * every carrier is already spent falls back to its highest-ranked one rather
 * than showing a hole; a tag nothing carries is simply absent, and the mosaic
 * draws its own placeholder for that. Identity is the guide OBJECT rather than
 * a trip id, so `PlatedGuide` still declares only what the picture-picking
 * reads. Mirrors DaybreakArt.plates(forTags:in:).
 */
export function platesForTags<T extends PlatedGuide>(
  tags: readonly string[],
  shelf: readonly T[]
): Map<string, Plate> {
  const spent = new Set<T>()
  const out = new Map<string, Plate>()
  for (const tag of tags) {
    const carriers = shelf.filter((g) => g.tags.includes(tag))
    const guide = carriers.find((g) => !spent.has(g)) ?? carriers[0]
    if (!guide) continue
    spent.add(guide)
    out.set(tag, guide.tile)
  }
  return out
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
