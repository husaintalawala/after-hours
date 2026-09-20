import { test, describe, afterEach } from "node:test"
import assert from "node:assert/strict"
import {
  askDrift,
  normalizeItinerary,
  normalizeStreamedDay,
  orderedStreamedDays,
  toCardItinerary,
  type AskItineraryDay,
} from "./chat.ts"

// ask-drift-chat streams one `day` frame per finished itinerary day, ahead of
// the payload that also carries them. These are the two rules that make the
// streamed card and the final card the same card: a day reads identically
// whichever frame it arrived in, and a day is only drawn once every day before
// it has arrived — because a day is printed under its POSITION.

/** The day from the wire contract, verbatim. */
const rawDay = {
  title: "Arrival",
  date: "2026-11-05",
  destination_ref: "Tokyo",
  places: [
    { name: "Senso-ji", why: "The oldest temple in Tokyo.", place_query: "Senso-ji Asakusa Japan", type: "spot", time: "09:00" },
    { name: "Den", why: "Playful kaiseki.", place_query: "Den Tokyo Japan", type: "food", time: "19:30" },
  ],
}

const day = (title: string): AskItineraryDay => ({
  title,
  date: null,
  destination_ref: null,
  places: [{ name: `${title} place`, why: "", place_query: `${title} place`, type: "spot", time: null }],
})

describe("normalizeStreamedDay", () => {
  test("a day frame comes through with its index", () => {
    assert.deepEqual(normalizeStreamedDay({ index: 0, day: rawDay }), {
      index: 0,
      day: {
        title: "Arrival",
        date: "2026-11-05",
        destination_ref: "Tokyo",
        places: [
          { name: "Senso-ji", why: "The oldest temple in Tokyo.", place_query: "Senso-ji Asakusa Japan", type: "spot", time: "09:00" },
          { name: "Den", why: "Playful kaiseki.", place_query: "Den Tokyo Japan", type: "food", time: "19:30" },
        ],
      },
    })
  })

  test("the streamed day is the payload's day, field for field", () => {
    const streamed = normalizeStreamedDay({ index: 2, day: rawDay })
    const inPayload = normalizeItinerary({ title: "4 days in Tokyo", days: [rawDay] })
    assert.deepEqual(streamed?.day, inPayload?.days[0])
  })

  test("a frame with nothing to draw is null", () => {
    assert.equal(normalizeStreamedDay(null), null)
    assert.equal(normalizeStreamedDay([{ index: 0, day: rawDay }]), null)
    assert.equal(normalizeStreamedDay({ day: rawDay }), null)
    assert.equal(normalizeStreamedDay({ index: -1, day: rawDay }), null)
    assert.equal(normalizeStreamedDay({ index: 1.5, day: rawDay }), null)
    assert.equal(normalizeStreamedDay({ index: "0", day: rawDay }), null)
    assert.equal(normalizeStreamedDay({ index: 0 }), null)
    // A place-less day is never streamed — and is dropped if one ever is,
    // rather than drawn as an empty day that renumbers the rest.
    assert.equal(normalizeStreamedDay({ index: 0, day: { title: "Spare", places: [] } }), null)
  })

  test("a bad field degrades on its own, like it does in the payload", () => {
    const d = normalizeStreamedDay({
      index: 1,
      day: { title: 7, date: "Nov 5", places: [{ name: "Den", type: "restaurant", time: "25:00" }] },
    })
    assert.deepEqual(d, {
      index: 1,
      day: {
        title: "",
        date: null,
        destination_ref: null,
        places: [{ name: "Den", why: "", place_query: "Den", type: "spot", time: null }],
      },
    })
  })
})

describe("orderedStreamedDays", () => {
  test("nothing yet is no days", () => {
    assert.deepEqual(orderedStreamedDays({}), [])
  })

  test("days arriving in order grow the plan one at a time", () => {
    const buf: Record<number, AskItineraryDay> = {}
    buf[0] = day("one")
    assert.deepEqual(orderedStreamedDays(buf).map((d) => d.title), ["one"])
    buf[1] = day("two")
    buf[2] = day("three")
    assert.deepEqual(orderedStreamedDays(buf).map((d) => d.title), ["one", "two", "three"])
  })

  test("a gap holds back what follows it, and filling it releases the run", () => {
    // Day 3 drawn while day 2 is missing would print it as "Day 2" and then
    // renumber it when the missing one landed.
    const buf: Record<number, AskItineraryDay> = { 0: day("one"), 2: day("three") }
    assert.deepEqual(orderedStreamedDays(buf).map((d) => d.title), ["one"])
    buf[1] = day("two")
    assert.deepEqual(orderedStreamedDays(buf).map((d) => d.title), ["one", "two", "three"])
  })

  test("a repeated index replaces that day rather than adding one", () => {
    const buf: Record<number, AskItineraryDay> = { 0: day("one"), 1: day("two") }
    buf[1] = day("two again")
    assert.deepEqual(orderedStreamedDays(buf).map((d) => d.title), ["one", "two again"])
  })
})

// ---- Which city a streamed day resolves against ----
//
// A place on a day that names no city is looked up against the PLAN's city, so
// what `toCardItinerary` puts there decides which Kyoto the photograph comes
// from — and a streamed plan is handed to it a prefix at a time. The question
// these answer is whether reading a partial plan biases a day differently from
// the finished one, and whether pinning the city while the plan grows would
// help. It reads the whole plan's answer as soon as the plan contains it, and
// pinning would throw that away.

const OPTS = { tripTitle: "Japan Adventure", country: "Japan", fallbackDestination: "Osaka" }

const named = (title: string, ref: string | null): AskItineraryDay => ({
  title,
  date: null,
  destination_ref: ref,
  places: [{ name: `${title} place`, why: "", place_query: `${title} place`, type: "spot", time: null }],
})

/** ItineraryCard's own rule: a place is looked up against its day's city, else
 *  the plan's. */
const biasOf = (card: ReturnType<typeof toCardItinerary>) =>
  card.days.map((d) => d.destinationRef || card.destination)

/** The city each day was hydrated under as the plan streamed. A day is looked
 *  up ONCE, when it lands — the card caches by place — so its bias is the one
 *  in force for the prefix that was on screen at that moment. */
const asStreamed = (days: AskItineraryDay[]) =>
  days.map((_, i) => biasOf(toCardItinerary({ title: "", days: days.slice(0, i + 1) }, OPTS))[i])

/** The same plan delivered whole — the blocking retry, or a reload. */
const asPayload = (days: AskItineraryDay[]) =>
  biasOf(toCardItinerary({ title: "Japan", days }, OPTS))

/** The suggested alternative: decide the city at the first day frame and hold
 *  it until the payload. */
const asPinned = (days: AskItineraryDay[]) => {
  const pin = toCardItinerary({ title: "", days: days.slice(0, 1) }, OPTS).destination
  return days.map((d) => d.destination_ref || pin)
}

describe("the city a streamed day resolves against", () => {
  test("a plan that never names a city is the trip's own, start to finish", () => {
    const days = [named("one", null), named("two", null), named("three", null)]
    assert.deepEqual(asStreamed(days), ["Osaka", "Osaka", "Osaka"])
    assert.deepEqual(asStreamed(days), asPayload(days))
  })

  test("once the plan has named a city, every later day resolves against it", () => {
    // Day 2 says Kyoto; day 3 says nothing and belongs to Kyoto with it.
    const days = [named("travel", null), named("temples", "Kyoto"), named("east", null)]
    assert.deepEqual(asStreamed(days).slice(1), ["Kyoto", "Kyoto"])
    assert.deepEqual(asStreamed(days).slice(1), asPayload(days).slice(1))
  })

  test("the days AHEAD of the first named city are the only ones that differ", () => {
    // And for those the plan does not hold the answer yet: day 1 has landed,
    // nothing has said Kyoto. It wears the trip's city, which is the same city
    // it would have worn if the plan had never named one.
    const days = [named("travel", null), named("temples", "Kyoto"), named("east", null)]
    assert.deepEqual(asStreamed(days), ["Osaka", "Kyoto", "Kyoto"])
    assert.deepEqual(asPayload(days), ["Kyoto", "Kyoto", "Kyoto"])
  })

  test("pinning the city at the first day frame biases later days to the trip", () => {
    // The reason not to "pin while the plan grows": it does not rescue day 1,
    // which takes the fallback either way — and it loses day 3, which the
    // plan HAS named a city for by the time it lands.
    const days = [named("travel", null), named("temples", "Kyoto"), named("east", null)]
    assert.deepEqual(asPinned(days), ["Osaka", "Kyoto", "Osaka"])
    assert.notDeepEqual(asPinned(days)[2], asPayload(days)[2])
    assert.deepEqual(asStreamed(days)[2], asPayload(days)[2])
  })

  test("a plan that names its city on day one is final from the first frame", () => {
    const days = [named("arrival", "Tokyo"), named("west", null), named("east", null)]
    assert.deepEqual(asStreamed(days), ["Tokyo", "Tokyo", "Tokyo"])
    assert.deepEqual(asStreamed(days), asPayload(days))
  })

  test("with no trip destination to fall back on, the trip's title stands in", () => {
    const days = [named("one", null)]
    const card = toCardItinerary({ title: "", days }, { ...OPTS, fallbackDestination: null })
    assert.equal(card.destination, "Japan Adventure")
  })
})

// ---- The frames on the wire ----

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

/** Answers the streaming call with `sse`, and the blocking call with `answer`. */
function stubAsk(sse: string, answer: unknown) {
  const calls: Array<boolean> = []
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const streaming = !!JSON.parse(init.body).stream
    calls.push(streaming)
    return streaming
      ? new Response(sse, { headers: { "Content-Type": "text/event-stream" } })
      : new Response(JSON.stringify(answer))
  }) as unknown as typeof fetch
  return calls
}

const body = { tripId: "t1", message: "plan my trip", conversation: [] }

describe("askDrift day frames", () => {
  test("days reach onDay in order, before the payload, and `perf` is ignored", async () => {
    const payload = {
      assistant_text: "Four slow days.",
      mode: "answer_only",
      cards: [],
      followups: [],
      itinerary: { title: "Four days in Tokyo", days: [rawDay, rawDay] },
    }
    const calls = stubAsk(
      frame("status", { state: "thinking" }) +
        frame("text_delta", { delta: "Four slow " }) +
        frame("text_delta", { delta: "days." }) +
        frame("day", { index: 0, day: rawDay }) +
        frame("day", { index: 1, day: rawDay }) +
        frame("payload", payload) +
        frame("perf", { day_ttfd_ms: 8500, days_streamed: 2 }),
      payload
    )
    const seen: Array<string> = []
    let landed: unknown = null
    await askDrift(body, {
      onDelta: (d) => seen.push(`delta:${d}`),
      onDay: (i, d) => seen.push(`day:${i}:${d.places.length}`),
      onPayload: (a) => {
        seen.push("payload")
        landed = a.itinerary
      },
      onError: (m) => seen.push(`error:${m}`),
    })
    assert.deepEqual(seen, [
      "delta:Four slow ",
      "delta:days.",
      "day:0:2",
      "day:1:2",
      "payload",
    ])
    // The payload still carries the whole plan — a client that ignored `day`
    // ends up exactly where it was.
    assert.deepEqual(landed, normalizeItinerary(payload.itinerary))
    assert.deepEqual(calls, [true])
  })

  test("a stream of days with no prose is still hollow, and retries blocking", async () => {
    // Days are not a first-token mark: the prose is what the turn is, and a
    // stream that never wrote any is the same silence it has always been.
    const answer = { assistant_text: "Four slow days.", mode: "answer_only", cards: [], followups: [] }
    const calls = stubAsk(frame("day", { index: 0, day: rawDay }), answer)
    let text = ""
    await askDrift(body, {
      onDay: () => {},
      onPayload: (a) => {
        text = a.assistant_text
      },
    })
    assert.deepEqual(calls, [true, false])
    assert.equal(text, "Four slow days.")
  })

  test("a malformed day frame is skipped, not fatal", async () => {
    const payload = { assistant_text: "ok", mode: "answer_only", cards: [], followups: [], itinerary: null }
    stubAsk(
      frame("text_delta", { delta: "ok" }) +
        "event: day\ndata: {not json\n\n" +
        frame("day", { index: 0, day: { title: "Spare", places: [] } }) +
        frame("day", { index: 0, day: rawDay }) +
        frame("payload", payload),
      payload
    )
    const days: number[] = []
    await askDrift(body, { onDay: (i) => days.push(i), onPayload: () => {} })
    assert.deepEqual(days, [0])
  })
})
