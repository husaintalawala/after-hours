import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { bannerReducer, namesDetail, type Banner, type BannerAction } from "./chatBanner.ts"

// The chat action banner's state rules: show, progress, merge, dismiss. Pinned
// because the merge is the part a person notices when it is wrong — a second
// add to the same trip must join the banner and Undo must remove both.

const run = (...actions: BannerAction[]): Banner | null =>
  actions.reduce<Banner | null>((s, a) => bannerReducer(s, a), null)

const add = (tripId: string | null, name: string, stepId: string, detail?: string): BannerAction => ({
  type: "success",
  tripId,
  tripTitle: tripId === "jp" ? "Japan with a Little One" : "Lisbon",
  names: [name],
  stepIds: [stepId],
  detail,
})

describe("bannerReducer", () => {
  test("a single add shows its trip and its day", () => {
    const b = run(add("jp", "Shinjuku", "s1", "Shinjuku · Day 1, Sep 10"))
    assert.equal(b?.kind, "success")
    assert.equal(b?.title, "Added to Japan with a Little One")
    assert.equal(b?.detail, "Shinjuku · Day 1, Sep 10")
    assert.deepEqual(b?.stepIds, ["s1"])
  })

  test("adds to the same trip merge: count, latest names, every step, new seq", () => {
    const one = run(add("jp", "Shinjuku", "s1"))!
    const three = run(add("jp", "Shinjuku", "s1"), add("jp", "Omoide Yokocho", "s2"), add("jp", "Meiji Jingu", "s3"))!
    assert.equal(three.title, "3 places added to Japan with a Little One")
    assert.equal(three.detail, "Meiji Jingu, Omoide Yokocho +1")
    assert.deepEqual(three.stepIds, ["s1", "s2", "s3"])
    assert.ok(three.seq > one.seq)
  })

  test("a different trip replaces instead of merging", () => {
    const b = run(add("jp", "Shinjuku", "s1"), add("pt", "Belém Tower", "s2"))!
    assert.equal(b.title, "Added to Lisbon")
    assert.deepEqual(b.stepIds, ["s2"])
  })

  test("nothing merges into a dismissed banner, or into one with no trip", () => {
    assert.deepEqual(run(add("jp", "A", "s1"), { type: "dismiss" }, add("jp", "B", "s2"))?.stepIds, ["s2"])
    assert.deepEqual(run(add(null, "A", "s1"), add(null, "B", "s2"))?.stepIds, ["s2"])
  })

  test("add all: working with progress, then one success", () => {
    const working = run({ type: "working", tripId: "jp", tripTitle: "Japan", total: 36 }, { type: "progress", done: 7 })!
    assert.equal(working.kind, "working")
    assert.equal(working.title, "Adding to Japan…")
    assert.equal(working.detail, "7 of 36")
    const done = bannerReducer(working, {
      type: "success",
      tripId: "jp",
      tripTitle: "Japan",
      names: ["A", "B"],
      stepIds: ["s1", "s2"],
      title: "Added to Japan",
      detail: "2 places across 1 day",
    })!
    assert.equal(done.kind, "success")
    assert.equal(done.detail, "2 places across 1 day")
  })

  test("progress without a working banner changes nothing", () => {
    const b = run(add("jp", "A", "s1"))
    assert.equal(bannerReducer(b, { type: "progress", done: 3 }), b)
    assert.equal(bannerReducer(null, { type: "progress", done: 3 }), null)
  })

  test("expire closes only the banner it was set for, never a working one", () => {
    const b = run(add("jp", "A", "s1"))!
    assert.equal(bannerReducer(b, { type: "expire", seq: b.seq - 1 }), b)
    assert.equal(bannerReducer(b, { type: "expire", seq: b.seq }), null)
    const w = run({ type: "working", tripId: "jp", tripTitle: "Japan", total: 2 })!
    assert.equal(bannerReducer(w, { type: "expire", seq: w.seq }), w)
  })

  test("a failure carries no steps to undo", () => {
    const b = run(add("jp", "A", "s1"), { type: "failure", tripId: "jp", title: "Couldn’t add Shinjuku — try again" })!
    assert.equal(b.kind, "failure")
    assert.deepEqual(b.stepIds, [])
  })

  test("a place taken back from its own card says so, and offers View not Undo", () => {
    const b = run(add("jp", "A", "s1"), add("jp", "B", "s2"))!
    assert.deepEqual(b.stepIds, ["s1", "s2"])
    const r = bannerReducer(b, { type: "removed", tripId: "jp", tripTitle: "Japan", name: "B" })!
    assert.equal(r.kind, "success")
    assert.equal(r.title, "Removed B")
    assert.equal(r.detail, "Japan")
    // It REPLACES the add's banner rather than merging into it: no names to
    // count, and no steps, so there is nothing left to offer Undo on.
    assert.deepEqual(r.names, [])
    assert.deepEqual(r.stepIds, [])
    assert.ok(r.seq > b.seq)
    // A run in flight owns the banner and filters its own receipt.
    const w = run({ type: "working", tripId: "jp", tripTitle: "Japan", total: 2 })!
    assert.equal(bannerReducer(w, { type: "removed", tripId: "jp", name: "A" }), w)
    // The next add to that trip starts its own banner rather than joining a
    // removal, which has no places to count.
    const next = bannerReducer(r, add("jp", "C", "s3"))!
    assert.equal(next.title, "Added to Japan with a Little One")
    assert.deepEqual(next.stepIds, ["s3"])
  })

  test("namesDetail", () => {
    assert.equal(namesDetail([]), "")
    assert.equal(namesDetail(["A"]), "A")
    assert.equal(namesDetail(["A", "B"]), "B, A")
    assert.equal(namesDetail(["A", "B", "C", "D"]), "D, C +2")
  })
})
