import { test, describe } from "node:test"
import assert from "node:assert/strict"
import {
  ESCAPE,
  WALK_THROUGH,
  chipsForQuestion,
  dayHeading,
  decide,
  isPlanRequest,
  modeSwitch,
  splitChipsBlock,
  type PlanningTurn,
} from "./chatPlanning.ts"

// Quick or guided, the web half. The question texts are the contract with iOS
// (ChatPlanningGuide.swift) and ask-drift-chat (planningMode.ts): a later turn
// knows what was asked by finding that exact text, so these pin the flow the
// texts drive rather than the texts themselves.

const user = (text: string): PlanningTurn => ({ role: "user", text })
const bot = (text: string): PlanningTurn => ({ role: "assistant", text })

describe("dayHeading", () => {
  // The chip beside a day's title already says "Day 2", so a title that leads
  // with it drops it — the plan read "Day 2  Day 2 · Historic Taipei and sunset
  // views". Anything else is left as the plan wrote it.
  test("drops the day the chip already says, and only that", () => {
    const cases: Array<[string, number, string]> = [
      ["Day 2 · Historic Taipei and sunset views", 2, "Historic Taipei and sunset views"],
      ["Day 3: Yangmingshan and Shilin", 3, "Yangmingshan and Shilin"],
      ["Day 4 - Jiufen", 4, "Jiufen"],
      ["Day 5 — Taroko Gorge", 5, "Taroko Gorge"],
      ["day 10 | Home", 10, "Home"],
      ["Day 2", 2, ""],
      ["Historic Taipei and sunset views", 1, "Historic Taipei and sunset views"],
      ["Daytrip to Jiufen", 1, "Daytrip to Jiufen"],
      ["Days 2-3: Hualien", 2, "Days 2-3: Hualien"],
      ["Day 2 & 3: Hualien", 2, "Day 2 & 3: Hualien"],
      // A plan numbered from the trip's own days: the chip says 1, the title
      // says 3. The real number stays — erasing it would show the wrong day for
      // what the plan actually planned.
      ["Day 3 · Historic Taipei", 1, "Day 3 · Historic Taipei"],
      ["Day 5 — Taroko Gorge", 3, "Day 5 — Taroko Gorge"],
      ["Day 1 · Arrival", 10, "Day 1 · Arrival"],
    ]
    for (const [title, day, expected] of cases) {
      assert.equal(dayHeading(title, day), expected, title)
    }
  })
})

describe("decide", () => {
  test("quick never interviews a plan request", () => {
    assert.deepEqual(decide("quick", "Plan my Taipei trip", [], null), { kind: "none" })
  })

  test("guided opens with the first question and the way out last", () => {
    const d = decide("guided", "Plan my Taipei trip", [], null)
    assert.equal(d.kind, "ask")
    if (d.kind !== "ask") return
    assert.match(d.text, /5 quick questions/)
    assert.match(d.text, /Who's coming on this trip\?/)
    assert.equal(d.chips[d.chips.length - 1], ESCAPE)
    assert.equal(d.chips.length, 5)
  })

  test("a saved answer leads the chips and is named in the question", () => {
    const d = decide("guided", "Plan my Taipei trip", [], { party: "couple" })
    assert.equal(d.kind, "ask")
    if (d.kind !== "ask") return
    assert.match(d.text, /Your usual: Two of us\./)
    assert.equal(d.chips[0], "Two of us")
    // Offered once, not twice.
    assert.equal(d.chips.filter((c) => c === "Two of us").length, 1)
  })

  test("answering moves on, and the opener line is only on the first", () => {
    const history = [user("Plan my Taipei trip"), bot("Who's coming on this trip?")]
    const d = decide("guided", "Two of us", history, null)
    assert.equal(d.kind, "ask")
    if (d.kind !== "ask") return
    assert.match(d.text, /What pace feels right\?/)
    assert.doesNotMatch(d.text, /Let's shape it together/)
  })

  test("the way out drafts from what was answered so far", () => {
    const history = [user("Plan my Taipei trip"), bot("Who's coming on this trip?"), user("Two of us"), bot("What pace feels right?")]
    const d = decide("guided", ESCAPE, history, null)
    assert.equal(d.kind, "draft")
    if (d.kind !== "draft") return
    assert.match(d.brief, /^Plan my Taipei trip/)
    assert.match(d.brief, /- Who's coming: Two of us/)
    assert.doesNotMatch(d.brief, /- Pace:/)
    assert.match(d.brief, /Draft the full day-by-day plan now\./)
  })

  test("quick ends an interview left open rather than ignoring the answer", () => {
    const history = [user("Plan my Taipei trip"), bot("Who's coming on this trip?")]
    const d = decide("quick", "Two of us", history, null)
    assert.equal(d.kind, "draft")
    if (d.kind !== "draft") return
    assert.match(d.brief, /- Who's coming: Two of us/)
  })

  test("all five answered drafts with every choice", () => {
    const history: PlanningTurn[] = [
      user("Plan my Taipei trip"),
      bot("Who's coming on this trip?"),
      user("Two of us"),
      bot("What pace feels right?"),
      user("Balanced"),
      bot("How should it feel on spend?"),
      user("Smart mix"),
      bot("What should the days lean into?"),
      user("Food & drink"),
      bot("Anything you already know you want to see?"),
    ]
    const d = decide("guided", "Taipei 101", history, null)
    assert.equal(d.kind, "draft")
    if (d.kind !== "draft") return
    for (const line of ["- Who's coming: Two of us", "- Pace: Balanced", "- Budget: Smart mix", "- Lean into: Food & drink", "- Must-sees: Taipei 101"]) {
      assert.match(d.brief, new RegExp(line.replace(/[-[\]/{}()*+?.\\^$|]/g, "\\$&")))
    }
  })

  test("mid-interview, a question is followed rather than taken as an answer", () => {
    const history = [user("Plan my Taipei trip"), bot("What pace feels right?")]
    assert.deepEqual(decide("guided", "How hot is it in June?", history, null), { kind: "none" })
  })

  test("a re-draft from the Tune row drafts, never interviews", () => {
    const history = [user("Plan my Taipei trip"), bot("What pace feels right?")]
    const d = decide("guided", "Re-draft the plan with fuller days — more stops each day.", history, null)
    assert.equal(d.kind, "none")
  })

  test("guided leaves a non-planning question alone", () => {
    assert.deepEqual(decide("guided", "What's the best noodle shop in Taipei?", [], null), { kind: "none" })
  })
})

describe("isPlanRequest", () => {
  test("whole-trip asks yes, single days and re-drafts no", () => {
    for (const yes of ["Plan my Taipei trip", "plan this", "Put together a 5 day itinerary", "map out our week in Lisbon"]) {
      assert.equal(isPlanRequest(yes), true, yes)
    }
    for (const no of ["Re-draft the plan with fuller days", "Swap the stops on Day 3", "What should I eat?", ""]) {
      assert.equal(isPlanRequest(no), false, no)
    }
  })
})

describe("modeSwitch", () => {
  test("the switch chips' own words move the chat, tapped or typed", () => {
    assert.equal(modeSwitch(WALK_THROUGH), "guided")
    assert.equal(modeSwitch("walk me through it"), "guided")
    assert.equal(modeSwitch(ESCAPE), "quick")
    assert.equal(modeSwitch("Just show me"), "quick")
    assert.equal(modeSwitch("Plan my Taipei trip"), null)
  })
})

describe("chipsForQuestion", () => {
  test("a reopened question gets its answers back", () => {
    const chips = chipsForQuestion("What pace feels right?", null)
    assert.deepEqual(chips, ["Unhurried", "Balanced", "Full days", ESCAPE])
  })

  test("anything that is not one of the five has no chips", () => {
    assert.equal(chipsForQuestion("Here's a day-by-day plan.", null), null)
  })
})

describe("splitChipsBlock", () => {
  test("the block becomes chips and never reaches the reader", () => {
    const { text, chips } = splitChipsBlock(
      'Which part of town?\n<<DRIFT_CHIPS>>["Shibuya","Shinjuku","Just show me"]<<END>>'
    )
    assert.equal(text, "Which part of town?")
    assert.deepEqual(chips, ["Shibuya", "Shinjuku", "Just show me"])
  })

  test("malformed JSON is still stripped, with no chips", () => {
    const { text, chips } = splitChipsBlock('Which part of town?\n<<DRIFT_CHIPS>>["Shibuya",<<END>>')
    assert.equal(text, "Which part of town?")
    assert.deepEqual(chips, [])
  })

  test("no block is the answer untouched", () => {
    const { text, chips } = splitChipsBlock("Here are three places.")
    assert.equal(text, "Here are three places.")
    assert.deepEqual(chips, [])
  })
})
