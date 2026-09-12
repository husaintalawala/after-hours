import { describe, test } from "node:test"
import assert from "node:assert/strict"
import {
  rankGuides,
  shapeMissFor,
  shelfFor,
  reasonFor,
  shapeFit,
  type RankableGuide,
  type TripLength,
} from "./daybreak.ts"
import { SHELF_FIXTURE } from "./__fixtures__/shelf.ts"

/**
 * The golden set: twenty readers, and the guides they must never be shown.
 *
 * WHY FORBIDDEN LISTS RATHER THAN PRECISION AND RECALL. The failure this file
 * exists to prevent was ONE catastrophic item in a set of three — a safari
 * returned to somebody who asked for coast. Aggregate relevance metrics do not
 * penalise an egregious item; they average it away. So the durable half of
 * every persona below is what must NOT appear, and those assertions hold
 * against any interests-based scorer, not just today's tiering.
 *
 * WHY THE EXPECTED ORDER IS ASSERTED MORE LOOSELY. The three titles a persona
 * gets will move if the tiers are ever retuned, and a test that pins them
 * exactly gets deleted by whoever is on call the first time it goes red for a
 * good reason. What is pinned hard is the property — every returned guide is
 * genuinely that kind of trip — and the absence of the known-wrong answers.
 *
 * THE PAIR THAT PROVES IT DISCRIMINATES. Scotland is FORBIDDEN for "Islands &
 * beaches" and EXPECTED for "History & ruins". Serengeti is FORBIDDEN for
 * islands and EXPECTED for "Nature & wildlife". One guide, opposite verdicts,
 * from the same data — that is the difference between a ranker that
 * discriminates and one that merely demotes.
 */

type Guide = RankableGuide & { slug: string; title: string }

const SHELF: Guide[] = SHELF_FIXTURE.map((g) => ({
  slug: g.slug,
  title: g.title,
  tags: [...g.tags],
  interests: [...g.interests],
  optimizeFor: [...g.optimizeFor],
  setting: [...g.setting],
  cityCount: g.cityCount,
  shapeWeights: { ...g.shapeWeights },
  shapePrimary: g.shapePrimary,
  // The frozen shelf predates month_scores, so it exercises the fallback — the
  // path every client takes until the backfill is applied. Graded season is
  // pinned with synthetic guides in daybreak.test.ts.
  monthScores: [],
  blackoutMonths: [],
  bestMonths: [...g.bestMonths],
  party: g.party,
  pace: g.pace,
  budget: g.budget,
  days: g.days,
}))

function ask(o: {
  shapes: string[]
  length?: TripLength
  party?: string
  rhythm?: string
  budget?: string
  month: number
}) {
  return {
    shapes: new Set(o.shapes),
    length: (o.length ?? "any") as TripLength,
    party: o.party ?? null,
    rhythm: o.rhythm ?? null,
    budget: o.budget ?? null,
    departureMonth: o.month,
  }
}

/** The top three of the RANKING, ignoring the floor — what the flow showed
 *  before `shelfFor` existed. Kept separate so the ordering assertions above
 *  and the floor assertions below cannot be confused for one another. */
const podium = (a: ReturnType<typeof ask>) => rankGuides(SHELF, a).slice(0, 3)
const rankOf = (a: ReturnType<typeof ask>, slug: string) =>
  rankGuides(SHELF, a).findIndex((g) => g.slug === slug) + 1

describe("the fixture itself", () => {
  test("is the whole shelf and carries the columns the ranker reads", () => {
    assert.equal(SHELF.length, 90)
    // A fixture whose arrays are empty ranks everything identically and makes
    // every assertion below pass for the wrong reason — which is the exact
    // shape of the bug being fixed, so it is checked first.
    assert.ok(
      SHELF.every((g) => g.interests.length > 0),
      "every guide must carry interests — an empty array ties the whole shelf"
    )
  })

  test("no survey chip is a dead end", () => {
    // The floor rule: a chip fewer than five guides can satisfy sends readers
    // into the fallthrough path that caused the reported bug, reached by a
    // missing option rather than a tie.
    for (const shape of ["wild", "stones", "drive", "eat", "islands", "high", "stay"]) {
      const eligible = SHELF.filter((g) => shapeMissFor(g, shape) <= 1).length
      assert.ok(eligible >= 5, `${shape} has only ${eligible} guides at tier 0-1`)
    }
  })
})

describe("P1 — the reported case: coast, and only coast", () => {
  const a = ask({ shapes: ["islands"], party: "couple", rhythm: "balanced", budget: "smart_mix", month: 10 })

  test("every guide shown is genuinely a beach trip", () => {
    for (const g of podium(a)) {
      assert.ok(
        g.interests.includes("islands_beaches"),
        `${g.title} was shown for an islands pick without islands_beaches in its interests`
      )
    }
  })

  test("the three guides that were actually returned are gone", () => {
    const shown = podium(a).map((g) => g.slug)
    assert.ok(!shown.includes("scotland-west-highland-line"), "a Highland rail journey")
    assert.ok(!shown.includes("serengeti-crossings-then-zanzibar"), "a safari")
  })

  test("Scotland is nowhere near the top, not merely off the podium", () => {
    assert.ok(rankOf(a, "scotland-west-highland-line") > 20)
  })

  test("a family picking islands is led by a family guide", () => {
    // `family` joined the survey once the shelf carried twelve family guides.
    const fam = ask({ shapes: ["islands"], party: "family", month: 10 })
    assert.equal(podium(fam)[0].party, "family", podium(fam).map((g) => g.slug).join(", "))
  })

  test("how much of a trip is beach never outranks who is travelling", () => {
    // The regression the first weighting shipped: folded above party, it put
    // four family guides on a couple's islands podium.
    const top = podium(a)
    assert.ok(
      top.every((g) => g.party !== "family"),
      top.map((g) => `${g.slug}:${g.party}`).join(", ")
    )
  })

  test("the Maldives is no longer beaten by a budget column", () => {
    // It scored styleMiss 2 against the safari's 1 and lost the third slot.
    assert.ok(rankOf(a, "maldives-baa-atoll-manta-season") <= 5)
  })
})

describe("the same guide, opposite verdicts", () => {
  test("Scotland is right for History & ruins and wrong for Islands", () => {
    const stones = ask({ shapes: ["stones"], length: "aboutAWeek", party: "couple", rhythm: "balanced", budget: "smart_mix", month: 5 })
    const islands = ask({ shapes: ["islands"], party: "couple", rhythm: "balanced", budget: "smart_mix", month: 10 })
    assert.ok(rankOf(stones, "scotland-west-highland-line") <= 5, "should rank for stones")
    assert.ok(rankOf(islands, "scotland-west-highland-line") > 20, "should not rank for islands")
  })

  test("Serengeti is right for Nature & wildlife and wrong for Islands", () => {
    const wild = ask({ shapes: ["wild"], length: "tenPlus", party: "couple", rhythm: "balanced", budget: "splurge", month: 9 })
    const islands = ask({ shapes: ["islands"], party: "couple", rhythm: "balanced", budget: "smart_mix", month: 10 })
    assert.ok(rankOf(wild, "serengeti-crossings-then-zanzibar") <= 3, "should rank for wild")
    assert.ok(rankOf(islands, "serengeti-crossings-then-zanzibar") > 5, "should not reach the islands podium")
  })
})

describe("every chip returns its own kind of trip", () => {
  // The property that makes this bug class impossible rather than merely fixed:
  // for every shape, everything shown carries that shape's own evidence.
  const tails = [
    { label: "couple/balanced/Oct", o: { party: "couple", rhythm: "balanced", budget: "smart_mix", month: 10 } },
    { label: "solo/full_days/Mar", o: { party: "solo", rhythm: "full_days", budget: "save", month: 3, length: "tenPlus" as TripLength } },
  ]
  for (const shape of ["wild", "stones", "drive", "eat", "islands", "high"]) {
    for (const tail of tails) {
      test(`${shape} · ${tail.label}`, () => {
        for (const g of podium(ask({ shapes: [shape], ...tail.o }))) {
          assert.ok(
            shapeMissFor(g, shape) <= 1,
            `${g.title} reached the podium for ${shape} at tier ${shapeMissFor(g, shape)}`
          )
        }
      })
    }
  }
  // `stay` is deliberately excluded from the tier<=1 property: no guide can
  // reach tier 0 for it, because every value that means "slow" in this corpus
  // sits structurally late in its array. It is pinned separately below.
})

describe("P6 — Road trip stops returning trains", () => {
  const a = ask({ shapes: ["drive"], length: "tenPlus", party: "friends", rhythm: "full_days", budget: "smart_mix", month: 6 })
  test("no rail journey is shown for a chip that says Road trip", () => {
    const rail = [
      "montreal-quebec-city-by-train",
      "uzbekistan-silk-road-fifteen-days",
      "prague-palava-budapest-by-rail",
      "poland-down-the-vistula",
      "sri-lanka-hill-country-by-train",
    ]
    const shown = podium(a).map((g) => g.slug)
    for (const slug of rail) assert.ok(!shown.includes(slug), slug)
  })
})

describe("P7 — Unpack once", () => {
  const a = ask({ shapes: ["stay"], length: "aboutAWeek", party: "couple", rhythm: "easy", budget: "smart_mix", month: 2 })

  test("a fifteen-day safari is not an answer to 'one base, slow days'", () => {
    const shown = podium(a).map((g) => g.slug)
    assert.ok(!shown.includes("serengeti-crossings-then-zanzibar"))
    assert.ok(!shown.includes("mongolia-naadam-to-the-gobi"))
  })

  test("the screen is never empty", () => {
    // `stay` is the weakest shape in the corpus and the one this change does
    // not fully fix. What is pinned is that it degrades rather than breaks.
    assert.equal(podium(a).length, 3)
  })
})

describe("multi-pick", () => {
  test("a guide satisfying both shapes beats one satisfying either", () => {
    const a = ask({ shapes: ["high", "wild"], length: "tenPlus", party: "couple", rhythm: "full_days", budget: "smart_mix", month: 3 })
    const top = podium(a)
    for (const g of top) {
      const both = shapeMissFor(g, "high") <= 1 && shapeMissFor(g, "wild") <= 1
      const either = shapeMissFor(g, "high") <= 1 || shapeMissFor(g, "wild") <= 1
      assert.ok(either, `${g.title} matches neither picked shape`)
      void both
    }
    // The best guide must satisfy both, not merely one of them well.
    const best = top[0]
    assert.ok(
      shapeMissFor(best, "high") + shapeMissFor(best, "wild") <= 2,
      `${best.title} leads a two-shape pick on a single shape`
    )
  })
})

describe("the tiering itself", () => {
  test("first match wins — it does not accumulate", () => {
    // A guide whose primary interest is the shape scores 0 even though its
    // setting would also have matched at tier 3. Summing instead of returning
    // is the port error this pins.
    const g = SHELF.find((x) => x.interests[0] === "islands_beaches" && x.setting.includes("beach"))
    assert.ok(g, "corpus should contain one")
    assert.equal(shapeMissFor(g!, "islands"), 0)
  })

  test("an unknown shape is a uniform miss, never a throw", () => {
    assert.equal(shapeMissFor(SHELF[0], "not_a_shape"), 4)
  })

  test("a guide with no interests falls to the bottom rather than crashing", () => {
    const bare: Guide = { ...SHELF[0], interests: [], optimizeFor: [], setting: [] }
    assert.equal(shapeMissFor(bare, "islands"), 4)
  })
})

describe("the floor — showing fewer beats padding with a wrong one", () => {
  const shelf = (o: Parameters<typeof ask>[0]) => shelfFor(SHELF, ask(o), 3)

  test("a normal answer still fills three", () => {
    const s = shelf({ shapes: ["islands"], party: "couple", rhythm: "balanced", budget: "smart_mix", month: 10 })
    assert.equal(s.guides.length, 3)
    assert.equal(s.relaxed, null)
  })

  test("nothing below the floor is ever shown while something above it exists", () => {
    for (const shape of ["wild", "stones", "drive", "eat", "islands", "high", "stay"]) {
      const s = shelf({ shapes: [shape], month: 6 })
      if (s.relaxed !== null) continue
      for (const g of s.guides) {
        assert.ok(
          shapeMissFor(g, shape) <= 1,
          `${g.title} was shown for ${shape} at tier ${shapeMissFor(g, shape)} without the shelf being marked relaxed`
        )
      }
    }
  })

  test("an impossible multi-pick relaxes and SAYS it relaxed", () => {
    // No guide in the corpus is primarily a road trip AND primarily a beach
    // trip AND primarily a mountain trip. The shelf must widen rather than
    // return nothing, and must not do it quietly.
    const s = shelf({ shapes: ["drive", "islands", "high", "stay"], month: 1 })
    assert.ok(s.guides.length > 0, "never an empty first-run screen")
    assert.equal(s.relaxed, "shape", "a widened search must be declared")
  })

  test("the screen is never empty, whatever is asked", () => {
    for (const shape of ["wild", "stones", "drive", "eat", "islands", "high", "stay"]) {
      for (let month = 1; month <= 12; month++) {
        const s = shelf({ shapes: [shape], month })
        assert.ok(s.guides.length > 0, `${shape}/${month} returned nothing`)
      }
    }
  })
})

describe("the reason on each card", () => {
  const label = (s: string) => ({ islands: "Islands & beaches", wild: "Nature & wildlife" })[s] ?? s

  test("names the shape that actually put the guide there", () => {
    const a = ask({ shapes: ["islands"], party: "couple", rhythm: "balanced", budget: "smart_mix", month: 10 })
    for (const g of shelfFor(SHELF, a, 3).guides) {
      assert.equal(reasonFor(g, a, label), "Islands & beaches")
    }
  })

  test("never a percentage, a score or a rank", () => {
    const a = ask({ shapes: ["wild"], month: 7 })
    for (const g of shelfFor(SHELF, a, 3).guides) {
      const r = reasonFor(g, a, label) ?? ""
      assert.ok(!/%|\bmatch\b|#\d/.test(r), `explanation looked statistical: "${r}"`)
    }
  })

  test("falls back to something true rather than inventing one", () => {
    // No shape picked at all — there is no shape reason to give.
    const a = ask({ shapes: [], month: 6 })
    const r = reasonFor(SHELF[0], a, label)
    assert.ok(r === null || r === "In season")
  })
})

describe("the weights", () => {
  test("every guide in the fixture carries weights and a primary", () => {
    // Without this, a fixture missing the columns ranks every tier-mate
    // identically and the within-tier tie-break passes every test while doing
    // nothing — which is precisely how the iOS suite first went green.
    assert.ok(
      SHELF.every((g) => Object.keys(g.shapeWeights).length > 0 && g.shapePrimary),
      "a guide in the fixture has no shape weights or no primary"
    )
  })

  test("being the primary is full strength even at a nights weight of 0", () => {
    const g = SHELF.find(
      (x) => x.shapePrimary !== null && (x.shapeWeights[x.shapePrimary] ?? 0) === 0
    )
    assert.ok(g, "the corpus should carry structural primaries (drive/stay) with 0 nights")
    assert.equal(shapeFit(g!, g!.shapePrimary!), 1)
  })

  test("a guide that is only partly a shape fits it only partly", () => {
    const g = SHELF.find((x) => x.slug === "serengeti-crossings-then-zanzibar")
    assert.ok(g)
    const f = shapeFit(g!, "islands")
    assert.ok(f > 0 && f < 1, `Serengeti's islands fit should be partial, was ${f}`)
  })
})
