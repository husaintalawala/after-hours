import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { normalizeHandle } from "./handleDerivation.ts"

/**
 * The handle a web signup gets must be the handle the same person would have
 * got on the phone — otherwise one identity has two names depending on where
 * it signed in. These cases mirror Drift/Core/Handle.swift's `normalized`.
 */
describe("normalizeHandle", () => {
  test("a display name becomes a handle", () => {
    assert.equal(normalizeHandle("Husain Talawala"), "husaintalawala")
    assert.equal(normalizeHandle("Mary-Jane O'Neill"), "maryjaneoneill")
  })

  test("keeps the alphabet the column's CHECK allows", () => {
    assert.equal(normalizeHandle("H.T_99"), "h.t_99")
  })

  test("ASCII only — a Unicode-aware filter seeded handles the CHECK rejects", () => {
    // The Swift version used `isLetter`, so a Cyrillic name produced a handle
    // the constraint refused: the upsert threw and the user landed on the very
    // form the derivation exists to remove.
    assert.equal(normalizeHandle("Пётр"), "")
    assert.equal(normalizeHandle("Ελένη"), "")
  })

  test("opens with a letter or a digit", () => {
    assert.equal(normalizeHandle("..._bob"), "bob")
    assert.equal(normalizeHandle("..."), "")
  })

  test("caps at 20, leaving room for two collision digits under the column's 30", () => {
    assert.equal(normalizeHandle("a".repeat(40)).length, 20)
  })

  test("too short a seed is the caller's problem, not silently padded", () => {
    // deriveProfileIdentity substitutes "traveler" below three characters; the
    // normaliser itself never invents characters.
    assert.equal(normalizeHandle("Jo"), "jo")
  })
})
