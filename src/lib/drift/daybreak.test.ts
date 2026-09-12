import { test, describe } from "node:test"
import assert from "node:assert/strict"
import {
  prioritiesForShapes,
  rankGuides,
  SHAPE_INTERESTS,
  seasonScore,
  shelfFor,
  lengthFits,
  metresFromHome,
  distanceText,
  hasSeenDaybreak,
  readSeen,
  TRIP_LENGTHS,
  type RankableGuide,
  type TripLength,
} from "./daybreak.ts"

// The first-run flow's recommendation, pinned — the web half of the pair that
// lives in DriftTests/DaybreakRankingTests.swift. The two platforms have to
// agree about which three guides a person is offered, and the only way that
// survives either side being edited is if both sides assert it.
//
// These ran once in a throwaway harness when the ranking was ported, which
// proved the code and left nothing behind to stop it rotting. The repo had no
// runner at all; it does now, and it needed no new dependency — Node 22 ships
// `node:test`, and `--experimental-strip-types` runs the TypeScript directly.
// A test that cannot be run by `npm test` is a note, not a gate.

/** Ordering-only fixture: the ranking reads exactly these six fields. */
function guide(
  id: string,
  opts: {
    days?: number
    tags?: string[]
    /** Override the derived interests directly, for tier tests. */
    interests?: string[]
    optimizeFor?: string[]
    setting?: string[]
    cityCount?: number
    shapeWeights?: Record<string, number>
    shapePrimary?: string | null
    monthScores?: number[]
    blackoutMonths?: number[]
    months?: number[]
    party?: string
    pace?: string
    budget?: string
  } = {}
): RankableGuide & { id: string } {
  const tags = opts.tags ?? ["wild"]
  const g = {
    id,
    tags,
    // DERIVED FROM `tags` BY DEFAULT, so the twenty tests written before the
    // shape term moved off `tags` still mean what they meant. They were
    // written as "this guide is a `wild` trip", and the ranker now asks that
    // question of `interests` — so the fixture answers it there, at tier 0.
    //
    // Mapped through the ranker's OWN table rather than a literal copy: a
    // fixture with its own idea of what `wild` means would pass while the
    // product ranked on something else, which is the exact failure mode this
    // file exists to catch.
    interests:
      opts.interests ?? tags.flatMap((t) => (SHAPE_INTERESTS[t] ?? []).slice(0, 1)),
    optimizeFor: opts.optimizeFor ?? [],
    setting: opts.setting ?? [],
    // Three, so the `stay` structural clause does not fire unasked.
    cityCount: opts.cityCount ?? 3,
    // Empty by default: every guide then gains the same constant per pick, so
    // the order these older tests assert is exactly what it was.
    shapeWeights: opts.shapeWeights ?? {},
    shapePrimary: opts.shapePrimary ?? null,
    monthScores: opts.monthScores ?? [],
    blackoutMonths: opts.blackoutMonths ?? [],
    bestMonths: opts.months ?? [6],
    days: opts.days ?? 10,
    // Absent by DEFAULT, so every pre-existing test proves the new components
    // stay silent when nothing was asked. A fixture that defaulted these to a
    // value would have made three of six components always fire.
    party: opts.party ?? null,
    pace: opts.pace ?? null,
    budget: opts.budget ?? null,
  }
  // The Swift fixtures had to assert their own round-trip: a tolerant decoder
  // and a malformed fixture make a silent no-op, and two tests once failed
  // against a correct ranker because interpolating quoted strings had emitted
  // escaped quotes and every fixture decoded with empty tags. Nothing is
  // decoded here — `tsc --noEmit` types this against RankableGuide, which is
  // the equivalent guarantee — but the shape is still checked so the file
  // cannot drift into asserting nothing.
  assert.ok(Array.isArray(g.tags) && Array.isArray(g.bestMonths))
  assert.ok(Array.isArray(g.interests), "the fixture must carry interests — the shape term reads them, not tags")
  assert.equal(typeof g.days, "number")
  return g
}

const ids = (gs: ReadonlyArray<{ id: string }>) => gs.map((g) => g.id)

function answers(
  o: Partial<{
    shapes: string[]
    length: TripLength
    month: number
    party: string
    rhythm: string
    budget: string
  }> = {}
) {
  return {
    shapes: new Set(o.shapes ?? []),
    length: o.length ?? ("any" as TripLength),
    departureMonth: o.month ?? 6,
    party: o.party ?? null,
    rhythm: o.rhythm ?? null,
    budget: o.budget ?? null,
  }
}

describe("shapes", () => {
  test("the picked shape comes first", () => {
    // `eat` is first in, so only the shape can reorder them.
    const out = rankGuides(
      [guide("eat", { tags: ["eat"] }), guide("wild", { tags: ["wild"] })],
      answers({ shapes: ["wild"] })
    )
    assert.equal(ids(out)[0], "wild")
  })

  test("nothing is ever removed", () => {
    // The stance the corpus is built on. A filter would return one guide here,
    // and an empty screen when nothing matched — which is what the old
    // `pickForShapes` fallback existed to paper over.
    const out = rankGuides(
      [guide("a", { tags: ["wild"] }), guide("b", { tags: ["eat"] })],
      answers({ shapes: ["islands"], length: "tenPlus", month: 1 })
    )
    assert.equal(out.length, 2)
  })
})

// The web half of DaybreakRankingTests' `// MARK: - Match depth` extension.
// Added after the flow was reported as showing "always the same 3 trips no
// matter the selection" on both platforms. Not a plumbing fault: `shapeMiss`
// was binary, the shelf's three highest-ranked guides carry four of the seven
// tags between them, and so four of the seven possible answers scored those
// three at 0 and let the editorial tie-break hand back the same front of the
// shelf.
describe("match depth", () => {
  test("more of the picked shapes wins", () => {
    // `one` is FIRST in, so under the old binary key it won on editorial order.
    // Only counting the misses can reorder these.
    const out = rankGuides(
      [guide("one", { tags: ["wild"] }), guide("both", { tags: ["wild", "high"] })],
      answers({ shapes: ["wild", "high"] })
    )
    assert.equal(ids(out)[0], "both", "a guide matching BOTH picks lost to one matching half")
  })

  test("a popular guide does not own every answer", () => {
    // The regression in the shape the user actually hit: `popular` is ranked
    // first and carries the four common tags — the Amalfi shape.
    //
    // THE PICK OVERLAPS IT BY ONE, deliberately, and this is where the web test
    // diverges from its Swift counterpart. `testAPopularGuideDoesNotOwnEveryAnswer`
    // picks {wild, high}, which `popular` carries NEITHER of — so binary scored
    // it 1 against the specific guide's 0 and that test passes against the
    // implementation it was written to catch. It pins the name of the bug, not
    // the bug. Picking one tag `popular` has and one it hasn't is the actual
    // reported case: binary calls both a match, the editorial tie-break returns
    // the front of the shelf, and the answer changes nothing.
    const out = rankGuides(
      [
        guide("popular", { tags: ["islands", "eat", "stay", "stones"] }),
        guide("exact", { tags: ["stones", "high"] }),
      ],
      answers({ shapes: ["stones", "high"] })
    )
    assert.equal(ids(out)[0], "exact")
  })

  test("a single pick is satisfied by a single tag", () => {
    // Matching one of one is still a full match: a narrow guide must not be
    // penalised against one that happens to carry more tags. Both miss zero
    // picks, so the shelf's own order decides — as before.
    //
    // This one cannot go red against the binary key, and is not meant to: it
    // guards the OVER-correction, where counting the guide's unpicked tags (or
    // scoring the fraction of them that matched) would rank a narrow guide
    // below a broad one for a pick both satisfy completely.
    const out = rankGuides(
      [guide("broad", { tags: ["wild", "eat", "high"] }), guide("narrow", { tags: ["wild"] })],
      answers({ shapes: ["wild"] })
    )
    assert.equal(ids(out)[0], "broad")
  })
})

describe("season", () => {
  test("in season outranks out of season", () => {
    const out = rankGuides(
      [guide("winter", { months: [1] }), guide("summer", { months: [7] })],
      answers({ shapes: ["wild"], month: 7 })
    )
    assert.equal(ids(out)[0], "summer")
  })

  test("no best months ranks with out of season", () => {
    // Absent editorial is not a claim that any month will do.
    const out = rankGuides(
      [guide("silent", { months: [] }), guide("inSeason", { months: [7] })],
      answers({ month: 7 })
    )
    assert.equal(ids(out)[0], "inSeason")
  })

  test("shape outranks season", () => {
    // The shape is the thing they chose out loud.
    const out = rankGuides(
      [
        guide("wrongShapeRightMonth", { tags: ["eat"], months: [7] }),
        guide("rightShapeWrongMonth", { tags: ["wild"], months: [1] }),
      ],
      answers({ shapes: ["wild"], month: 7 })
    )
    assert.equal(ids(out)[0], "rightShapeWrongMonth")
  })
})

describe("length", () => {
  test("the picked length is honoured", () => {
    const out = rankGuides(
      [guide("long", { days: 12 }), guide("short", { days: 7 })],
      answers({ shapes: ["wild"], length: "aboutAWeek" })
    )
    assert.equal(ids(out)[0], "short")
  })

  test("the buckets cover the real corpus range", () => {
    // Live guides run 5–13 days. If a bucket ever covers nothing, the question
    // has no answer behind it and should not be asked — so seeding short trips
    // must FAIL here rather than silently under-serve them.
    for (let days = 5; days <= 13; days++) {
      const claimed = TRIP_LENGTHS.some((l) => l.id !== "any" && lengthFits(l.id, days))
      assert.ok(claimed, `no length bucket claims a ${days}-day trip, but the shelf has one`)
    }
  })
})

describe("distance", () => {
  const lisbon = { lat: 38.72, lng: -9.14 }
  const reykjavik = { lat: 64.14, lng: -21.94 }

  test("measured from home", () => {
    const metres = metresFromHome(reykjavik, lisbon)
    assert.ok(metres !== null)
    // ~2,900 km. Wide bounds on purpose: this pins the units and the order of
    // magnitude, not the geodesy — web is haversine on a sphere where iOS uses
    // CLLocation's WGS84 ellipsoid, and the difference cannot survive the
    // rounding anyway.
    assert.ok(metres! > 2_500_000 && metres! < 3_400_000, `got ${metres}`)
  })

  test("no home means no distance, never an invented one", () => {
    assert.equal(metresFromHome(reykjavik, null), null)
    assert.equal(distanceText(reykjavik, null), null)
  })

  test("null island is rejected", () => {
    // (0,0) is the corpus's unset sentinel, not a spot in the Atlantic.
    assert.equal(metresFromHome({ lat: 0, lng: 0 }, lisbon), null)
  })

  test("distance does not affect the order", () => {
    // Shown, not scored. Near is not better: someone who says "into the wild"
    // from Lisbon has not asked to be kept in Europe.
    const near = guide("near")
    const far = guide("far")
    const out = rankGuides([far, near], answers({ shapes: ["wild"] }))
    assert.equal(ids(out)[0], "far", "distance is not an input to rankGuides at all")
  })
})

describe("the seen marker", () => {
  // Per ACCOUNT, not per browser. A bare `drift_daybreak=1` closed the flow for
  // every account that signed into a browser after the first one, which on a
  // machine where accounts are made back to back is all of them.
  const a = "11111111-1111-1111-1111-111111111111"
  const b = "22222222-2222-2222-2222-222222222222"

  test("an account that has seen it is remembered", () => {
    assert.equal(hasSeenDaybreak(a, a), true)
  })

  test("ANOTHER account's marker does not count as this one's", () => {
    assert.equal(hasSeenDaybreak(a, b), false)
  })

  test("no cookie means not seen", () => {
    assert.equal(hasSeenDaybreak(undefined, a), false)
    assert.equal(hasSeenDaybreak("", a), false)
  })

  test("several accounts can share a browser", () => {
    assert.equal(hasSeenDaybreak(`${a}.${b}`, a), true)
    assert.equal(hasSeenDaybreak(`${a}.${b}`, b), true)
  })

  test("a raw cookie header is read as well as a bare value", () => {
    assert.deepEqual(readSeen(`foo=1; drift_daybreak=${a}.${b}; bar=2`), [a, b])
    assert.equal(hasSeenDaybreak(`foo=1; drift_daybreak=${a}; bar=2`, a), true)
  })
})

describe("party, pace and budget", () => {
  test("who you travel with reorders the shelf", () => {
    // `couple` is first in, so only the answer can flip them.
    const shelf = [
      guide("couple", { tags: [], party: "couple" }),
      guide("friends", { tags: [], party: "friends" }),
    ]
    assert.equal(ids(rankGuides(shelf, answers({ party: "friends" })))[0], "friends")
    assert.equal(
      ids(rankGuides(shelf, answers()))[0],
      "couple",
      "an unasked question must not reorder anything"
    )
  })

  test("pace and budget are summed, not binary", () => {
    // Matching one is strictly better than matching neither. Binary would tie
    // `half` with `neither` and let the shelf order decide — the fault the
    // shape component already had.
    const out = rankGuides(
      [
        guide("neither", { tags: [], pace: "easy", budget: "save" }),
        guide("half", { tags: [], pace: "full_days", budget: "save" }),
        guide("both", { tags: [], pace: "full_days", budget: "splurge" }),
      ],
      answers({ rhythm: "full_days", budget: "splurge" })
    )
    assert.deepEqual(ids(out), ["both", "half", "neither"])
  })

  test("a null column ranks as a miss, not a wildcard", () => {
    // The stance bestMonths already takes. A guide seeded without these must
    // not be promoted for having said nothing.
    const out = rankGuides(
      [guide("silent", { tags: [] }), guide("answers", { tags: [], party: "solo" })],
      answers({ party: "solo" })
    )
    assert.equal(ids(out)[0], "answers")
  })

  test("an answer outranks the season", () => {
    // Pins the precedence change: season is derived from a month nobody
    // picked, so it loses to every answer actually given. Fails against the
    // version where season came second.
    const out = rankGuides(
      [
        guide("inSeason", { tags: [], months: [6], party: "couple" }),
        guide("rightCrew", { tags: [], months: [1], party: "solo" }),
      ],
      answers({ party: "solo", month: 6 })
    )
    assert.equal(ids(out)[0], "rightCrew")
  })

  test("shapes still outrank style", () => {
    // Two style answers must not outweigh the one thing picked by hand.
    const out = rankGuides(
      [
        guide("rightStyle", { tags: ["eat"], pace: "full_days", budget: "splurge" }),
        guide("rightShape", { tags: ["wild"], pace: "easy", budget: "save" }),
      ],
      answers({ shapes: ["wild"], rhythm: "full_days", budget: "splurge" })
    )
    assert.equal(ids(out)[0], "rightShape")
  })
})

/**
 * The shape answer has to reach the itinerary builder, and has to reach it in
 * exactly the shape iOS writes — the two platforms upsert the same column on
 * the same account, so a different ordering or a different vocabulary means one
 * platform silently rewrites the other's answer on the traveller's next visit.
 */
describe("prioritiesForShapes", () => {
  test("maps each shape tag the way iOS does", () => {
    assert.deepEqual(prioritiesForShapes(["eat"]), ["food"])
    assert.deepEqual(prioritiesForShapes(["stones"]), ["history"])
    assert.deepEqual(prioritiesForShapes(["wild"]), ["nature"])
    assert.deepEqual(prioritiesForShapes(["high"]), ["nature", "views"])
    assert.deepEqual(prioritiesForShapes(["islands"]), ["views"])
    assert.deepEqual(prioritiesForShapes(["drive"]), ["views"])
  })

  test("`stay` contributes nothing — it is a statement about pace", () => {
    assert.deepEqual(prioritiesForShapes(["stay"]), [])
  })

  test("de-duplicates and sorts, matching Swift's Set(...).sorted()", () => {
    assert.deepEqual(prioritiesForShapes(["high", "islands", "wild"]), ["nature", "views"])
    assert.deepEqual(prioritiesForShapes(["stones", "eat"]), ["food", "history"])
  })

  test("never infers arts_culture, which nothing in the vocabulary means", () => {
    const all = prioritiesForShapes(["eat", "stones", "wild", "high", "islands", "drive", "stay"])
    assert.equal(all.includes("arts_culture"), false)
    assert.deepEqual(all, ["food", "history", "nature", "views"])
  })

  test("an empty pick writes nothing rather than a default", () => {
    assert.deepEqual(prioritiesForShapes([]), [])
  })
})

describe("graded season", () => {
  test("a shoulder month outranks an off-season one once month_scores exist", () => {
    const shoulder = guide("shoulder", { monthScores: [15, 15, 15, 15, 15, 15, 15, 15, 65, 90, 65, 15] })
    const off = guide("off", { monthScores: [90, 65, 15, 15, 15, 15, 15, 15, 15, 15, 15, 65] })
    assert.deepEqual(ids(rankGuides([off, shoulder], answers({ shapes: ["wild"], month: 9 }))), [
      "shoulder",
      "off",
    ])
  })

  test("without month_scores it is exactly the old in-or-out test", () => {
    const g = guide("g", { months: [6] })
    assert.equal(seasonScore(g, 6), 90)
    assert.equal(seasonScore(g, 7), 15)
  })

  test("a blackout month removes the guide from the shelf", () => {
    const closed = guide("closed", { blackoutMonths: [9] })
    const open = guide("open")
    assert.deepEqual(ids(shelfFor([closed, open], answers({ shapes: ["wild"], month: 9 })).guides), ["open"])
  })
})

