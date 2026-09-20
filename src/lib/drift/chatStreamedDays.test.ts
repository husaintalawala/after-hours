import { test, describe, afterEach } from "node:test"
import assert from "node:assert/strict"
import {
  askDrift,
  normalizeItinerary,
  normalizeStreamedDay,
  orderedStreamedDays,
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
