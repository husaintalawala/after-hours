import { test, describe } from "node:test"
import assert from "node:assert/strict"
import {
  chooseTripForItinerary,
  generalSystemPrompt,
  itineraryMetadata,
  planForSingleAdd,
  preferencesLine,
  readStoredItinerary,
  type ChatItinerary,
  type GeneralTrip,
} from "./generalChat.ts"

// The general chat's two decisions that replace questions: what it already
// knows about the traveller (so it never asks), and which trip an Add lands in
// (so it never shows a picker). Mirrors iOS DriftChatView.preferencesLine and
// bestTrip(for:place:).

describe("preferencesLine", () => {
  test("every answer, in the words the traveller picked", () => {
    const line = preferencesLine({
      party: "family",
      travel_rhythm: "easy",
      budget_style: "smart_mix",
      mobility_style: "rental_car",
      food_moods: ["local_gems", "fine_dining"],
      shapes: ["islands", "stay"],
      notes: "  toddler naps 1-3  ",
    })
    assert.equal(
      line,
      " TRAVELER PREFERENCES, already answered in Drift — shape every recommendation around them and NEVER ask about any of these again: travelling: With kids; pace: Unhurried; budget: Smart mix; getting around: Self-drive; food: Local gems, Fine dining; loves: Islands & beaches, One base, slow days; notes: toddler naps 1-3."
    )
  })

  test("unknown ids are skipped, never leaked", () => {
    const line = preferencesLine({ party: "crew", travel_rhythm: "full_days", food_moods: ["street", "night_out"], shapes: ["legacy"] })
    assert.match(line, /pace: Full days; food: Night out\.$/)
    assert.doesNotMatch(line, /crew|street|legacy|travelling|loves/)
  })

  test("nothing saved is an empty string", () => {
    assert.equal(preferencesLine(null), "")
    assert.equal(preferencesLine(undefined), "")
    assert.equal(preferencesLine({}), "")
    assert.equal(preferencesLine({ party: "nope", notes: "   ", food_moods: null }), "")
  })

  test("the prompt carries the line and the no-interview rule", () => {
    const p = generalSystemPrompt({ trips: [], prefs: { party: "couple" } })
    assert.match(p, /travelling: Two of us/)
    assert.match(p, /NEVER INTERVIEW\./)
    assert.match(p, /Ask a question only when there is no destination at all\./)
    assert.doesNotMatch(generalSystemPrompt({ trips: [] }), /TRAVELER PREFERENCES/)
  })
})

describe("chooseTripForItinerary", () => {
  const today = "2026-09-15"
  const trip = (over: Partial<GeneralTrip> & { id: string }): GeneralTrip => ({
    title: over.id,
    city: null,
    country: null,
    startDate: null,
    endDate: null,
    ...over,
  })
  const lisbon = { destination: "Lisbon", country: "Portugal" }

  test("no trips at all is null — the caller creates one", () => {
    assert.equal(chooseTripForItinerary([], lisbon, today), null)
  })

  test("the trip going there wins over a sooner one", () => {
    const trips = [
      trip({ id: "rome", city: "Rome", startDate: "2026-10-01", endDate: "2026-10-05" }),
      trip({ id: "lisbon", city: "Lisbon", startDate: "2026-12-01", endDate: "2026-12-05" }),
    ]
    assert.equal(chooseTripForItinerary(trips, lisbon, today)?.id, "lisbon")
  })

  test("a matching trip not yet ended beats a past one to the same place", () => {
    const trips = [
      trip({ id: "past", city: "Lisbon", startDate: "2025-05-01", endDate: "2025-05-04" }),
      trip({ id: "next", country: "Portugal", startDate: "2027-03-01", endDate: "2027-03-04" }),
    ]
    assert.equal(chooseTripForItinerary(trips, lisbon, today)?.id, "next")
  })

  test("a past trip to the place still beats an unrelated upcoming one", () => {
    const trips = [
      trip({ id: "tokyo", city: "Tokyo", startDate: "2026-11-01", endDate: "2026-11-09" }),
      trip({ id: "past", city: "Lisbon", startDate: "2025-05-01", endDate: "2025-05-04" }),
    ]
    assert.equal(chooseTripForItinerary(trips, lisbon, today)?.id, "past")
  })

  test("destination labels, accents and 'City, Country' all match", () => {
    const trips = [
      trip({ id: "a", startDate: "2026-10-01", destinations: [{ id: "d", date: "2026-10-01", nights: 2, label: "São Paulo, Brazil" }] }),
    ]
    assert.equal(chooseTripForItinerary(trips, { destination: "Sao Paulo", country: null }, today)?.id, "a")
  })

  test("a short code never matches inside a longer name", () => {
    const trips = [
      trip({ id: "austin", city: "Austin", startDate: "2026-12-01", endDate: "2026-12-03" }),
      trip({ id: "soon", city: "Oslo", startDate: "2026-10-01", endDate: "2026-10-03" }),
    ]
    assert.equal(chooseTripForItinerary(trips, { destination: "Boston", country: "US" }, today)?.id, "soon")
  })

  test("no match → the next trip not yet ended, ongoing included", () => {
    const trips = [
      trip({ id: "later", city: "Oslo", startDate: "2027-01-10", endDate: "2027-01-12" }),
      trip({ id: "ongoing", city: "Paris", startDate: "2026-09-10", endDate: "2026-09-20" }),
      trip({ id: "past", city: "Rome", startDate: "2026-01-01", endDate: "2026-01-05" }),
    ]
    assert.equal(chooseTripForItinerary(trips, lisbon, today)?.id, "ongoing")
  })

  test("every trip over and none matching → the first listed", () => {
    const trips = [
      trip({ id: "first", city: "Rome", startDate: "2026-01-01", endDate: "2026-01-05" }),
      trip({ id: "second", city: "Oslo", startDate: "2025-01-01", endDate: "2025-01-05" }),
    ]
    assert.equal(chooseTripForItinerary(trips, lisbon, today)?.id, "first")
  })
})

// A plan persisted in trip_chat_messages.metadata must come back on reopen —
// and a row holding anything else must read as "no plan", never break a load.
describe("readStoredItinerary", () => {
  const webPlan: ChatItinerary = {
    destination: "Tokyo",
    country: "Japan",
    title: "Japan with a Little One",
    startDate: "2026-09-10",
    days: [
      {
        title: "Shinjuku",
        date: "2026-09-10",
        destinationRef: "Tokyo",
        places: [{ name: "Shinjuku Gyoen", why: "Space to run", query: "Shinjuku Gyoen Tokyo", type: "spot", time: "09:00" }],
      },
      { title: "Asakusa", places: [{ name: "Senso-ji", why: "Oldest temple" }] },
    ],
  }

  test("the web shape round-trips through JSON", () => {
    const stored = JSON.parse(JSON.stringify(itineraryMetadata(webPlan)))
    assert.deepEqual(readStoredItinerary(stored), webPlan)
    assert.equal(itineraryMetadata(null), null)
  })

  test("the iOS ChatItinerary shape reads best-effort", () => {
    const ios = {
      itinerary: {
        destination: "Kyoto",
        country: null,
        title: "",
        startDate: 800_000_000, // Swift reference-date seconds → 2026-05-09T06:13Z
        days: [
          {
            id: "D1",
            title: "Higashiyama",
            date: "2026-05-08",
            cards: [
              { id: "C1", title: "Kiyomizu-dera", why: "Views", placeQuery: "Kiyomizu-dera Kyoto", mapQuery: "x", photoURL: null, rating: 4.6, lat: 35, lng: 135, placeId: "p", stepType: "activity", time: "8:00" },
              { id: "C2", title: "", why: "nameless" },
            ],
          },
        ],
      },
    }
    assert.deepEqual(readStoredItinerary(ios), {
      destination: "Kyoto",
      country: null,
      title: "Kyoto trip",
      startDate: "2026-05-09",
      days: [
        {
          title: "Higashiyama",
          date: "2026-05-08",
          places: [{ name: "Kiyomizu-dera", why: "Views", query: "Kiyomizu-dera Kyoto", type: "activity" }],
        },
      ],
    })
    assert.equal(readStoredItinerary({ itinerary: { ...ios.itinerary, startDate: "2026-05-08T04:00:00Z" } })?.startDate, "2026-05-08")
  })

  test("other shapes and malformed rows are no itinerary, not an error", () => {
    for (const m of [
      null,
      undefined,
      "itinerary",
      42,
      [],
      {},
      { agent: { ops: [] } },
      { itinerary: null },
      { itinerary: "Tokyo" },
      { itinerary: [] },
      { itinerary: { destination: "Tokyo", days: "3" } },
      { itinerary: { destination: "", days: webPlan.days } },
      { itinerary: { destination: "Tokyo", days: [{ title: "x", places: [{ why: "no name" }] }] } },
    ]) {
      assert.equal(readStoredItinerary(m), null)
    }
  })
})

describe("planForSingleAdd", () => {
  test("keeps every day of the plan, with only the tapped place on its day", () => {
    const itin: ChatItinerary = {
      destination: "Lisbon",
      country: "Portugal",
      title: "3 days in Lisbon",
      startDate: "2026-10-01",
      days: [
        { title: "A", places: [{ name: "One", why: "" }, { name: "Two", why: "" }] },
        { title: "B", places: [{ name: "Three", why: "" }] },
        { title: "C", places: [{ name: "Four", why: "" }] },
      ],
    }
    const single = planForSingleAdd(itin, 1, itin.days[1].places[0])
    assert.equal(single.days.length, 3)
    assert.equal(single.startDate, "2026-10-01")
    assert.deepEqual(single.days.map((d) => d.places.map((p) => p.name)), [[], ["Three"], []])
    assert.equal(itin.days[0].places.length, 2) // the chat's own plan is untouched
  })
})
