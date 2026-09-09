import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { backdropAt, plateForTag, type Plate, type PlatedGuide } from "./daybreakArt.ts"
import {
  BUDGET_STYLES,
  DEFAULT_BUDGET,
  DEFAULT_RHYTHM,
  TRAVEL_RHYTHMS,
} from "./daybreak.ts"

// Which photograph the first-run flow shows, and which strings screen 4 writes.
//
// Both are the kind of thing that looks obviously right in a diff and is
// obviously wrong in production. The picture rule is "the first guide on a
// rank-ordered shelf", which is one word away from "any guide" and from "the
// last one"; the vocabulary is three slugs that a reviewer aligning the two
// platforms would very reasonably make match iOS, at the cost of the feature.

/** A plate as buildDaybreakShelf actually returns one: rung 3 with its credit,
 *  or rung 4 with none. The credit riding in the same value as the url is the
 *  whole promise of this module, so the fixture cannot be built without it. */
function plate(url: string | null, place: string | null = null): Plate {
  return {
    cover: {
      url,
      credit: url ? { text: `${url} / CC BY-SA 4.0 · Wikimedia Commons`, href: null } : null,
      placeholder: { from: "#6D7CFF", to: "#DB34F2", glyph: "D" },
      rung: url ? 3 : 4,
    },
    place,
  }
}

function guide(name: string, tags: string[]): PlatedGuide {
  return { tags, tile: plate(`${name}-tile`), backdrop: plate(`${name}-hero`) }
}

describe("the picture for a shape tag", () => {
  // Rank order IS shelf order — the same assumption the deck and the category
  // rails already make. `findLast`, a filter, or a re-sort would all pass a
  // one-match fixture and hand back the wrong guide against a real shelf.
  test("the highest-ranked guide carrying the tag wins", () => {
    const shelf = [
      guide("amalfi", ["eat", "islands"]),
      guide("iceland", ["wild", "drive"]),
      guide("patagonia", ["wild", "high"]),
    ]
    assert.equal(plateForTag("wild", shelf)?.cover.url, "iceland-tile")
  })

  test("its own stop, not the shelf's front, when the front does not carry it", () => {
    const shelf = [guide("amalfi", ["eat"]), guide("peru", ["stones"])]
    assert.equal(plateForTag("stones", shelf)?.cover.url, "peru-tile")
  })

  // Null rather than a substitute picture: a tile drawn from a guide that does
  // not carry the tag would be a caption naming one thing over a photograph of
  // another, which is worse than the designed placeholder the caller paints.
  test("a tag nothing on the shelf carries has no picture", () => {
    assert.equal(plateForTag("drive", [guide("amalfi", ["eat"])]), null)
    assert.equal(plateForTag("wild", []), null)
  })

  // The reason Plate is a TripCoverResult and not a url. If a photograph can
  // ever reach a caller without the attribution bound to it, the licence is
  // being honoured by everyone remembering to.
  test("the credit travels with the photograph", () => {
    const found = plateForTag("wild", [guide("iceland", ["wild"])])
    assert.ok(found?.cover.url)
    assert.ok(found?.cover.credit?.text)
  })
})

describe("the ground under a screen", () => {
  const shelf = [guide("a", []), guide("b", []), guide("c", [])]

  test("consecutive screens are never the same picture", () => {
    assert.equal(backdropAt(0, shelf)?.cover.url, "a-hero")
    assert.equal(backdropAt(1, shelf)?.cover.url, "b-hero")
    assert.equal(backdropAt(2, shelf)?.cover.url, "c-hero")
  })

  // A flow with a blank screen in it is worse than one that shows Iceland
  // twice. Without the modulo this reads off the end and the screen goes dark.
  test("a shelf shorter than the flow repeats rather than going blank", () => {
    const two = [guide("a", []), guide("b", [])]
    assert.equal(backdropAt(6, two)?.cover.url, "a-hero")
    assert.equal(backdropAt(5, two)?.cover.url, "b-hero")
  })

  // The sky underneath is the fallback, so "no shelf" has to be expressible.
  test("an empty shelf has no ground of its own", () => {
    assert.equal(backdropAt(0, []), null)
  })
})

describe("how you travel", () => {
  // THE VALUES ARE THE SERVER'S, THE LABELS ARE iOS'S. build-itinerary and
  // refine-itinerary both branch on `travel_rhythm === "full_days"`, and
  // refine-itinerary's budget phrasing is keyed on save|smart_mix|splurge. iOS's
  // DaybreakStyleStep writes `packed`, `careful` and `no_limit`, which those
  // reads miss entirely — so aligning these strings to the phone would make the
  // screen a survey. If that alignment is ever wanted, it belongs in a change
  // that moves the server too, and this is the test that will say so.
  test("the pace values are the ones the itinerary functions read", () => {
    assert.deepEqual(
      TRAVEL_RHYTHMS.map((r) => r.value),
      ["easy", "balanced", "full_days"]
    )
  })

  test("the budget values are the ones the itinerary functions read", () => {
    assert.deepEqual(
      BUDGET_STYLES.map((b) => b.value),
      ["save", "smart_mix", "splurge"]
    )
  })

  // The words on the pills stay iOS's — the two platforms are one product and
  // must not ask the same question in different language.
  test("the labels are the words the phone shows", () => {
    assert.deepEqual(
      TRAVEL_RHYTHMS.map((r) => r.label),
      ["Easy", "Balanced", "Packed"]
    )
    assert.deepEqual(
      BUDGET_STYLES.map((b) => b.label),
      ["Careful", "Smart mix", "No limit"]
    )
  })

  // The screen opens on these, and Skip writes nothing — so a default that is
  // not a real option would show a screen with nothing selected on it.
  test("the defaults are options, and are the column defaults", () => {
    assert.ok(TRAVEL_RHYTHMS.some((r) => r.value === DEFAULT_RHYTHM))
    assert.ok(BUDGET_STYLES.some((b) => b.value === DEFAULT_BUDGET))
    assert.equal(DEFAULT_RHYTHM, "balanced")
    assert.equal(DEFAULT_BUDGET, "smart_mix")
  })
})
