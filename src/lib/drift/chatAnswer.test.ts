import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { normalizeAnswer, normalizeItinerary } from "./chat.ts"

// ask-drift-chat's `itinerary` field, as the web client reads it. The backend
// that sends it may not be deployed, and what it sends is model output, so the
// reader must survive the field being absent, null, or wrong in any part.

const base = {
  assistant_text: "Here's a slow three days.",
  title: "",
  subtitle: "",
  mode: "answer_only",
  cards: [],
  followups: [],
  reply_chips: [],
}

describe("normalizeItinerary", () => {
  test("a well-formed plan comes through intact", () => {
    const itin = normalizeItinerary({
      title: "3 days in Lisbon",
      days: [
        {
          title: "Alfama",
          date: "2026-10-01",
          destination_ref: "Lisbon",
          places: [
            { name: "São Jorge Castle", why: "Views", place_query: "Castelo de São Jorge Lisbon", type: "activity", time: "09:30" },
          ],
        },
      ],
    })
    assert.deepEqual(itin, {
      title: "3 days in Lisbon",
      days: [
        {
          title: "Alfama",
          date: "2026-10-01",
          destination_ref: "Lisbon",
          places: [
            { name: "São Jorge Castle", why: "Views", place_query: "Castelo de São Jorge Lisbon", type: "activity", time: "09:30" },
          ],
        },
      ],
    })
  })

  test("null, absent and non-objects are null", () => {
    assert.equal(normalizeItinerary(null), null)
    assert.equal(normalizeItinerary(undefined), null)
    assert.equal(normalizeItinerary("plan"), null)
    assert.equal(normalizeItinerary([]), null)
    assert.equal(normalizeItinerary({ title: "x" }), null)
    assert.equal(normalizeItinerary({ title: "x", days: "day 1" }), null)
  })

  test("a plan with no named place anywhere is null, not an empty card", () => {
    assert.equal(
      normalizeItinerary({ title: "x", days: [{ title: "d", places: [{ name: "  " }, null, 7] }, { title: "e", places: [] }] }),
      null
    )
  })

  test("bad fields degrade one at a time instead of losing the plan", () => {
    const itin = normalizeItinerary({
      days: [
        "junk",
        { title: 3, date: "Oct 1", destination_ref: "", places: [{ name: "Time Out Market", type: "restaurant", time: "25:00" }, { why: "no name" }] },
      ],
    })
    assert.deepEqual(itin, {
      title: "",
      days: [
        {
          title: "",
          date: null,
          destination_ref: null,
          places: [{ name: "Time Out Market", why: "", place_query: "Time Out Market", type: "spot", time: null }],
        },
      ],
    })
  })
})

describe("normalizeAnswer", () => {
  test("an answer from a backend without the field reads as no itinerary", () => {
    const a = normalizeAnswer(base)
    assert.equal(a.itinerary, null)
    assert.equal(a.assistant_text, base.assistant_text)
  })

  test("itinerary: null stays null", () => {
    assert.equal(normalizeAnswer({ ...base, itinerary: null }).itinerary, null)
  })

  test("a malformed itinerary is null and the rest of the answer survives", () => {
    const a = normalizeAnswer({ ...base, itinerary: { days: [{}] }, followups: ["More?"] })
    assert.equal(a.itinerary, null)
    assert.deepEqual(a.followups, ["More?"])
  })

  test("a present itinerary is normalized", () => {
    const a = normalizeAnswer({
      ...base,
      itinerary: { title: "Plan", days: [{ title: "D1", date: null, destination_ref: null, places: [{ name: "A", why: "b", place_query: "", type: "food", time: null }] }] },
    })
    assert.equal(a.itinerary?.days[0].places[0].place_query, "A")
    assert.equal(a.itinerary?.days[0].places[0].type, "food")
  })

  test("missing arrays become empty arrays", () => {
    const a = normalizeAnswer({ assistant_text: "hi" })
    assert.deepEqual(a.cards, [])
    assert.deepEqual(a.followups, [])
    assert.deepEqual(a.reply_chips, [])
    assert.equal(normalizeAnswer("nope").assistant_text, "")
  })
})
