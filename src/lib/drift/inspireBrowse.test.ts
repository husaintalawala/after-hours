import { test } from "node:test"
import assert from "node:assert/strict"
// @ts-ignore -- Node's strip-types runner resolves the source extension.
import { BROWSE_COLUMNS, placeSearchText } from "./inspireBrowse.ts"

test("summary excludes items/full snapshot and preserves ordered stop metadata", () => {
  assert.ok(!BROWSE_COLUMNS.split(",").includes("snapshot"))
  assert.ok(!BROWSE_COLUMNS.includes("items"))
  for (const key of ["title", "day_count", "countries", "cities", "destinations"]) assert.ok(BROWSE_COLUMNS.includes(`${key}:snapshot->`))
})

test("deferred place text matches the previous inline search fields", () => {
  const items = [null, { title: "Rāmen", location_name: "Kyōto", canonical_name: "Shop", kind: "food", place_category: "noodles", notes: "not previously searched" }, { title: 42 }]
  assert.equal(placeSearchText(items), "ramen kyoto shop food noodles")
  const summary = "japan family"
  const search = `${summary} ${placeSearchText(items)}`
  assert.ok(["japan", "ramen"].every(term => search.includes(term)))
  assert.equal(placeSearchText(null), "")
  assert.ok(!search.includes("not previously searched"))
})
