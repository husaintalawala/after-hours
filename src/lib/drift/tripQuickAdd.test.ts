import assert from "node:assert/strict"
import test from "node:test"
import { buildTripQuickAddRow } from "./tripQuickAdd.ts"

const bowenIsland = {
  id: "bowen",
  name: "Bowen Island",
  address: "Bowen Island, BC, Canada",
  latitude: 49.3768,
  longitude: -123.3702,
  primaryType: "tourist_attraction",
}

const vancouver = {
  id: "vancouver-step",
  date: "2026-09-26",
  nights: 5,
  label: "Vancouver",
}

test("spot and stay rows are attached to the selected destination", () => {
  const spot = buildTripQuickAddRow({
    kind: "spot",
    tripId: "trip-1",
    candidate: bowenIsland,
    destination: vancouver,
  })
  const stay = buildTripQuickAddRow({
    kind: "stay",
    tripId: "trip-1",
    candidate: { ...bowenIsland, name: "Bowen Island Lodge" },
    destination: vancouver,
  })

  assert.equal(spot.parent_step_id, "vancouver-step")
  assert.equal(spot.step_type, "spot")
  assert.equal(spot.date, "2026-09-26")
  assert.equal(stay.parent_step_id, "vancouver-step")
  assert.equal(stay.step_type, "stay")
  assert.equal(stay.nights, 5)
})

test("destination rows are top-level and use the trip start", () => {
  const row = buildTripQuickAddRow({
    kind: "destination",
    tripId: "trip-1",
    candidate: bowenIsland,
    tripStart: "2026-09-26T12:00:00Z",
  })

  assert.equal(row.step_type, "destination")
  assert.equal(row.date, "2026-09-26")
  assert.equal(row.nights, 1)
  assert.equal("parent_step_id" in row, false)
})

test("spot and stay rows cannot be built without a destination", () => {
  assert.throws(
    () =>
      buildTripQuickAddRow({
        kind: "spot",
        tripId: "trip-1",
        candidate: bowenIsland,
      }),
    /Add a destination/,
  )
})
