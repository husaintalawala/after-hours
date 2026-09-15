import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { dayDateFor, lastDestinationDay, pickDestinationId } from "./itineraryPlacement.ts"

// Where an itinerary Add lands. apply-quick-op refuses a date outside the trip
// and a stop with no resolvable destination, so these answers are the
// difference between an Add that works and one that 422s.

describe("dayDateFor", () => {
  const trip = { tripStart: "2026-10-01", tripEnd: "2026-10-04" }

  test("the day's own date wins", () => {
    assert.equal(dayDateFor(0, { ...trip, dayDate: "2026-10-03" }), "2026-10-03")
  })

  test("else the plan's start + index, else the trip's start + index", () => {
    assert.equal(dayDateFor(1, { ...trip, planStart: "2026-10-02" }), "2026-10-03")
    assert.equal(dayDateFor(2, trip), "2026-10-03")
  })

  test("a candidate outside the trip falls through, then to null", () => {
    assert.equal(dayDateFor(0, { ...trip, dayDate: "2026-11-01" }), "2026-10-01")
    assert.equal(dayDateFor(1, { ...trip, planStart: "2026-12-01" }), "2026-10-02")
    assert.equal(dayDateFor(9, trip), null)
  })

  test("a trip with no dates leaves the stop unscheduled", () => {
    assert.equal(dayDateFor(0, {}), null)
    assert.equal(dayDateFor(0, { dayDate: "soon" }), null)
  })
})

describe("pickDestinationId", () => {
  const dests = [
    { id: "porto", date: "2026-10-04", nights: 2, label: "Porto" },
    { id: "lisbon", date: "2026-10-01", nights: 3, label: "Lisbon, Portugal" },
  ]

  test("the destination covering the date", () => {
    assert.equal(pickDestinationId(dests, "2026-10-02", null), "lisbon")
    assert.equal(pickDestinationId(dests, "2026-10-05", "Lisbon"), "porto")
  })

  test("no covering date → the one the plan named", () => {
    assert.equal(pickDestinationId(dests, null, "porto"), "porto")
    assert.equal(pickDestinationId(dests, null, "Lisbon"), "lisbon")
  })

  test("else the latest to start on or before the date, else the first", () => {
    assert.equal(pickDestinationId(dests, "2026-10-20", null), "porto")
    assert.equal(pickDestinationId(dests, null, "Faro"), "lisbon")
  })

  test("no destinations → null", () => {
    assert.equal(pickDestinationId([], "2026-10-02", "Lisbon"), null)
  })

  test("lastDestinationDay spans start + nights", () => {
    assert.equal(lastDestinationDay(dests), "2026-10-06")
    assert.equal(lastDestinationDay([]), null)
  })
})
