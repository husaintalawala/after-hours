import { test, describe } from "node:test"
import assert from "node:assert/strict"
import {
  rankGuides,
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

/** Ordering-only fixture: the ranking reads exactly these three fields. */
function guide(
  id: string,
  opts: { days?: number; tags?: string[]; months?: number[] } = {}
): RankableGuide & { id: string } {
  const g = {
    id,
    tags: opts.tags ?? ["wild"],
    bestMonths: opts.months ?? [6],
    days: opts.days ?? 10,
  }
  // The Swift fixtures had to assert their own round-trip: a tolerant decoder
  // and a malformed fixture make a silent no-op, and two tests once failed
  // against a correct ranker because interpolating quoted strings had emitted
  // escaped quotes and every fixture decoded with empty tags. Nothing is
  // decoded here — `tsc --noEmit` types this against RankableGuide, which is
  // the equivalent guarantee — but the shape is still checked so the file
  // cannot drift into asserting nothing.
  assert.ok(Array.isArray(g.tags) && Array.isArray(g.bestMonths))
  assert.equal(typeof g.days, "number")
  return g
}

const ids = (gs: ReadonlyArray<{ id: string }>) => gs.map((g) => g.id)

function answers(o: Partial<{ shapes: string[]; length: TripLength; month: number }> = {}) {
  return {
    shapes: new Set(o.shapes ?? []),
    length: o.length ?? ("any" as TripLength),
    departureMonth: o.month ?? 6,
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
