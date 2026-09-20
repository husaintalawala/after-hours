/**
 * How a chat plans — quick or guided — and the guided interview itself.
 *
 * QUICK (the default) drafts a plan at once from saved preferences: no
 * decisions. GUIDED asks the plan's questions one at a time first, for the
 * person who wants to choose. Remembered per chat on the person's own turns
 * (`trip_chat_messages.metadata.planning_mode`) and sent to ask-drift-chat as
 * `planning_mode`.
 *
 * THE WEB TWIN of iOS `Drift/Core/ChatPlanningGuide.swift` and of
 * ask-drift-chat's `planningMode.ts`. Trip chats get their questions from
 * ask-drift-chat; the general chat answers through claude-complete, which has
 * no trip, so it runs this one. It is also how a reopened chat gets a
 * question's chips back, since chips are not stored. THE QUESTION TEXTS ARE THE
 * CONTRACT between the three: a later turn knows what was asked by finding that
 * exact text. Change them together.
 */

import type { TravelPrefs } from "./generalChat"

export type PlanningMode = "quick" | "guided"

/** The way out on every planning question: draft now, and stop asking. */
export const ESCAPE = "Just draft it"
/** The same way out on a guided follow-up question (stays, restaurants…). */
export const FOLLOWUP_ESCAPE = "Just show me"
/** Quick → guided, from under a plan. */
export const WALK_THROUGH = "Walk me through it"

type Column = "party" | "pace" | "budget" | "shapes"

export interface PlanningStep {
  key: string
  question: string
  label: string
  column?: Column
  options: Array<{ id: string | null; title: string }>
  hint?: string
}

const opt = (id: string | null, title: string) => ({ id, title })

// Titles are the first-run catalogue's (DaybreakPrefCatalog), so the traveller
// meets the words they onboarded with.
export const STEPS: PlanningStep[] = [
  {
    key: "who",
    question: "Who's coming on this trip?",
    label: "Who's coming",
    column: "party",
    options: [opt("solo", "Just me"), opt("couple", "Two of us"), opt("friends", "A group"), opt("family", "With kids")],
  },
  {
    key: "pace",
    question: "What pace feels right?",
    label: "Pace",
    column: "pace",
    options: [opt("easy", "Unhurried"), opt("balanced", "Balanced"), opt("full_days", "Full days")],
  },
  {
    key: "budget",
    question: "How should it feel on spend?",
    label: "Budget",
    column: "budget",
    options: [opt("save", "Careful"), opt("smart_mix", "Smart mix"), opt("splurge", "No limit")],
  },
  // The last three are offered only as someone's saved answer: five options
  // plus the way out is all the answer chips a message shows.
  {
    key: "interests",
    question: "What should the days lean into?",
    label: "Lean into",
    column: "shapes",
    options: [
      opt("eat", "Food & drink"),
      opt("stones", "History & ruins"),
      opt("wild", "Nature & wildlife"),
      opt("islands", "Islands & beaches"),
      opt(null, "A bit of everything"),
      opt("high", "Mountains & hiking"),
      opt("drive", "Road trip"),
      opt("stay", "One base, slow days"),
    ],
  },
  {
    key: "must_sees",
    question: "Anything you already know you want to see?",
    label: "Must-sees",
    options: [opt(null, "Nothing specific, surprise me")],
    hint: "Name them, or tap below.",
  },
]

export interface PlanningTurn {
  role: string
  text: string
}

export type PlanningDecision =
  /** Not a planning turn — answer as usual. */
  | { kind: "none" }
  /** Ask this question, with these answer chips. */
  | { kind: "ask"; text: string; chips: string[] }
  /** Draft now, from this brief (the request plus the choices made). */
  | { kind: "draft"; brief: string }

/**
 * What this turn is: a question to ask, a plan to draft, or neither.
 * `history` is the thread BEFORE `message`.
 */
export function decide(
  mode: PlanningMode,
  message: string,
  history: PlanningTurn[],
  prefs: TravelPrefs | null | undefined
): PlanningDecision {
  const key = normalize(message)
  const last = history[history.length - 1]
  const lastStep = last?.role === "assistant" ? stepAsked(last.text) : null
  const escaping = isEscape(key)
  const walking = isWalkThrough(key)
  // Mid-interview, a question or an essay is not an answer — follow it. Nor is
  // a re-draft: the Tune row and per-day Swap sit under the plan ABOVE the
  // question, so they stay tappable while one is pending, and "Re-draft the
  // plan…" is a choice already made (see isPlanRequest).
  const offScript =
    !escaping &&
    !walking &&
    (message.includes("?") || message.length > 160 || /\bre ?draft\b/.test(key) || /\bday \d+\b/.test(key))
  if (lastStep && offScript) return { kind: "none" }

  const answers = answersInThread(history)
  const trimmed = message.trim()
  if (lastStep && !escaping && !walking && trimmed) answers[lastStep.key] = trimmed.slice(0, 160)

  if (mode === "quick") {
    // Only an interview in progress is quick's business: end it with a draft.
    return lastStep ? { kind: "draft", brief: brief(history, message, answers) } : { kind: "none" }
  }
  if (!lastStep && !walking && !isPlanRequest(key)) return { kind: "none" }
  if (escaping) {
    return lastStep ? { kind: "draft", brief: brief(history, message, answers) } : { kind: "none" }
  }

  const remaining = STEPS.filter((s) => answers[s.key] === undefined)
  const next = remaining[0]
  if (!next) return { kind: "draft", brief: brief(history, message, answers) }
  const saved = savedTitles(next, prefs)
  const lines: string[] = []
  if (!lastStep) {
    const n = remaining.length
    lines.push(`Let's shape it together — ${n} quick question${n === 1 ? "" : "s"}, then I'll draft the days.`, "")
  }
  lines.push(next.question)
  if (saved.length) lines.push(`Your usual: ${saved.join(", ")}.`)
  if (next.hint) lines.push(next.hint)
  return { kind: "ask", text: lines.join("\n"), chips: [...chipsFor(next, saved), ESCAPE] }
}

/**
 * The mode a message switches the chat to: the switch chips' own words, tapped
 * or typed. null leaves the mode as it is.
 */
export function modeSwitch(text: string): PlanningMode | null {
  if (isEscape(text)) return "quick"
  return normalize(text) === normalize(WALK_THROUGH) ? "guided" : null
}

/** A reopened question's chips — they are not stored with the message. */
export function chipsForQuestion(text: string, prefs: TravelPrefs | null | undefined): string[] | null {
  const step = stepAsked(text)
  if (!step) return null
  return [...chipsFor(step, savedTitles(step, prefs)), ESCAPE]
}

export function stepAsked(text: string | null | undefined): PlanningStep | null {
  if (!text) return null
  return STEPS.find((s) => text.includes(s.question)) ?? null
}

export function isEscape(text: string): boolean {
  return /^(just draft it|draft it now|just draft it now|just show me|skip the questions|no more questions)$/.test(
    normalize(text)
  )
}

export function isWalkThrough(text: string): boolean {
  return /\b(walk me through|guide me through|step by step|ask me (a few |some )?questions)\b/.test(normalize(text))
}

/** A whole-trip plan request. Re-drafts and single-day asks draft directly. */
export function isPlanRequest(text: string): boolean {
  const key = normalize(text)
  if (!key || /\bre ?draft\b/.test(key) || /\bday \d+\b/.test(key)) return false
  if (isWalkThrough(key) || /\bitinerar(y|ies)\b/.test(key) || /\bplan (this|it)\b/.test(key)) return true
  return (
    /\b(plan|planning|lay out|map out|put together)\b/.test(key) &&
    /\b(trip|days|week|weekend|holiday|vacation|getaway|honeymoon|route)\b/.test(key)
  )
}

// MARK: - Tuning a drafted plan

export interface Tune {
  label: string
  prompt: string
}

/**
 * One-tap re-drafts under the latest plan. Each prompt starts "Re-draft the
 * plan" — a choice already made, so it drafts straight away, never interviews.
 */
export const TUNES: Tune[] = [
  { label: "Slower pace", prompt: "Re-draft the plan at a slower pace — fewer stops each day, more room between them." },
  { label: "Fuller days", prompt: "Re-draft the plan with fuller days — more stops each day." },
  { label: "Cheaper", prompt: "Re-draft the plan on a tighter budget — cheaper picks, free sights, casual food." },
  { label: "Splurge", prompt: "Re-draft the plan with a few splurges that are worth it." },
  {
    label: "More food",
    prompt: "Re-draft the plan with more food — markets, local favourites, one standout meal a day.",
  },
  { label: "More nature", prompt: "Re-draft the plan with more nature and time outdoors." },
]

/**
 * Typed into the composer by "Add a must-see" — the place is the person's to
 * name. No "add"/"include": those words route a message to direct add.
 */
export const MUST_SEE_PREFILL = "Re-draft the plan around this must-see: "

export function swapPrompt(day: number, title: string): string {
  const named = title ? ` (${title})` : ""
  return `Re-draft the plan: swap the stops on Day ${day}${named} for different ones, and keep the other days as they are.`
}

// MARK: - Rendering a plan

/**
 * A day's title without the "Day 2 ·" the chip beside it already says.
 *
 * Plans often lead their titles with it ("Day 2 · Historic Taipei"), and a day
 * with no title of its own is named just "Day 2", which the chip covers
 * entirely. Titles that don't lead with a day are left alone — and so are
 * titles that lead with a DIFFERENT day from the one the chip shows: a plan for
 * days 3-5 of a trip numbers its own titles from the trip, and that number is
 * the one thing worth reading, not dropping.
 */
export function dayHeading(title: string, day: number): string {
  const t = title.trim()
  const m = /^day\s*(\d+)\s*(?:[·•:\-–—|,.]\s*|$)/i.exec(t)
  if (!m) return t
  // The match is "day", digits and a separator, so its digits are the title's
  // day number and nothing else.
  if (Number(m[1]) !== day) return t
  return t.slice(m[0].length)
}

/**
 * Pull a guided follow-up question's `<<DRIFT_CHIPS>>["…"]<<END>>` answers out
 * of the prose. No block, or JSON that does not parse, is no chips — the
 * block's text is stripped either way, so no raw JSON reaches the reader.
 */
export function splitChipsBlock(raw: string): { text: string; chips: string[] } {
  const start = raw.indexOf("<<DRIFT_CHIPS>>")
  if (start < 0) return { text: raw, chips: [] }
  const after = start + "<<DRIFT_CHIPS>>".length
  const end = raw.indexOf("<<END>>", after)
  const json = (end < 0 ? raw.slice(after) : raw.slice(after, end)).trim()
  const text = (raw.slice(0, start) + (end < 0 ? "" : raw.slice(end + "<<END>>".length))).trim()
  let chips: string[] = []
  try {
    const parsed: unknown = JSON.parse(json)
    if (Array.isArray(parsed)) {
      chips = parsed
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.trim())
        .filter(Boolean)
        .slice(0, 6)
    }
  } catch {
    /* no chips — the block is still stripped above */
  }
  return { text, chips }
}

/**
 * Guided chats only. Plan questions are asked in the browser before the model
 * sees a plan request, so this covers the rest: a follow-up (stays,
 * restaurants…) may ask ONE narrowing question, with its answers as chips.
 */
export function guidedModeRules(mode: PlanningMode): string {
  if (mode !== "guided") return ""
  return `\n\nGUIDED MODE — this person chose to make the choices themselves. For stays, restaurants, activities or any recommendation where ONE choice that would change the answer is still open (area, price level, vibe, which night) and nothing above or in the chat settles it, ask that ONE short question instead of answering, then end with EXACTLY ONE block on its own line and nothing after it: <<DRIFT_CHIPS>>["3-5 short answers","…","${FOLLOWUP_ESCAPE}"]<<END>> — "${FOLLOWUP_ESCAPE}" always last. Never ask about who is going, pace, budget or interests; never ask when your previous turn already asked something or when they say "${FOLLOWUP_ESCAPE}" — answer then. Plans and re-drafts are laid out straight away, as above.`
}

// MARK: - Private

function answersInThread(history: PlanningTurn[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i + 1 < history.length; i++) {
    const turn = history[i]
    const reply = history[i + 1]
    if (turn.role !== "assistant" || reply.role === "assistant") continue
    const text = reply.text.trim()
    const step = stepAsked(turn.text)
    if (!step || !text || isEscape(text) || isWalkThrough(text)) continue
    out[step.key] = text.slice(0, 160)
  }
  return out
}

/** The request the plan is for, plus what was chosen. */
function brief(history: PlanningTurn[], message: string, answers: Record<string, string>): string {
  let origin = isPlanRequest(message) && !isWalkThrough(message) && !isEscape(message) ? message.trim() : ""
  if (!origin) {
    const turn = [...history]
      .reverse()
      .find((t) => t.role !== "assistant" && isPlanRequest(t.text) && !isWalkThrough(t.text))
    if (turn) origin = turn.text.trim()
  }
  const chosen = STEPS.flatMap((s) => (answers[s.key] ? [`- ${s.label}: ${answers[s.key]}`] : []))
  const lines = [origin || "Plan this trip.", ""]
  if (chosen.length) {
    lines.push(
      "Choices the traveler made in this chat, one question at a time — they override saved preferences for this plan:"
    )
    lines.push(...chosen, "")
  }
  lines.push("Draft the full day-by-day plan now.")
  return lines.join("\n")
}

/**
 * Options with the saved answer first — five at most, so with the way out they
 * fit the six answer chips a message shows.
 */
function chipsFor(step: PlanningStep, saved: string[]): string[] {
  const lead = saved.length > 1 ? [saved.slice(0, 2).join(" + ")] : saved
  // Against the saved TITLES, not the joined lead — "A + B" matches neither.
  const used = new Set(saved.slice(0, 2))
  return [...lead, ...step.options.map((o) => o.title).filter((t) => !used.has(t))].slice(0, 5)
}

function savedTitles(step: PlanningStep, prefs: TravelPrefs | null | undefined): string[] {
  if (!prefs || !step.column) return []
  let ids: Array<string | null | undefined> = []
  switch (step.column) {
    case "party":
      ids = prefs.party ? [prefs.party] : []
      break
    case "pace":
      ids = [prefs.travel_rhythm]
      break
    case "budget":
      ids = [prefs.budget_style]
      break
    case "shapes":
      ids = prefs.shapes ?? []
      break
  }
  return ids.flatMap((id) => {
    const hit = step.options.find((o) => o.id === id)
    return hit ? [hit.title] : []
  })
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}
