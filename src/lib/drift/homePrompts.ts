/**
 * The questions the home offers to ask Drift, written from who the reader is.
 *
 * The panel used to list recent threads. Three hardcoded questions stood behind
 * it as an empty state — one of them "Add a rest day before Samarkand", which is
 * a real place nobody here has ever been. A prompt that names somewhere the
 * reader has no connection to is worse than no prompt: it reads as a screenshot
 * of somebody else's app.
 *
 * So these are built from what the account actually knows: the next trip and
 * where it goes, when it starts, where the reader lives, and the five
 * preferences the first-run flow collected — rhythm, budget, mobility, food and
 * the trip shapes they picked. Someone flying to Thimphu in three weeks who
 * said they eat where locals eat and like unhurried days is offered "Where do
 * locals actually eat in Thimphu?" and "Add a rest day in Thimphu", not
 * Samarkand.
 *
 * DETERMINISTIC, NOT GENERATED, and that is a deliberate trade. Asking a model
 * for these would put a network call and a second of latency on the first paint
 * of the home screen, on every load, to produce three lines of text — and a
 * failure would leave the panel empty. Every rule below is a template over data
 * the page has already fetched, so the prompts cost nothing and cannot fail.
 * The questions themselves are still answered by the real agent; this only
 * decides which ones are worth putting in front of this particular person.
 */

export interface PromptTrip {
  title: string
  city: string | null
  country: string | null
  /** ISO date, or null. */
  startDate: string | null
  isActive: boolean
}

/** The five answers the first-run flow collects. All optional — a reader who
 *  skipped it still gets sensible questions, just less pointed ones. */
export interface PromptPrefs {
  travelRhythm: string | null
  budgetStyle: string | null
  mobilityStyle: string | null
  foodMoods: string[]
  /** The trip shapes — `islands`, `high`, `stones`… see TRIP_SHAPES. */
  priorities: string[]
}

export interface PromptContext {
  homeCity: string | null
  /** The next trip, or the one in progress. */
  trip: PromptTrip | null
  prefs: PromptPrefs | null
}

/** How many the panel shows. */
export const HOME_PROMPT_COUNT = 3

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

/**
 * The month a trip starts, by STRING SURGERY rather than a Date.
 *
 * `new Date("2026-10-01")` is midnight UTC, and rendering that through a
 * negative-offset local calendar gives September — the same class of bug the
 * date helpers in this codebase already carry warnings about. The stored value
 * is a wall-clock date, so the month is simply its second field.
 */
function monthOf(iso: string | null): string | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})/.exec(iso)
  if (!m) return null
  const idx = Number(m[2]) - 1
  return MONTHS[idx] ?? null
}

/** What to call where a trip goes: the city if it has one, else the country,
 *  else the trip's own name — which is always something. */
function placeOf(trip: PromptTrip): string {
  return trip.city?.trim() || trip.country?.trim() || trip.title.trim()
}

/** Questions about a trip the reader is about to take, or is on. */
function tripPrompts(trip: PromptTrip, prefs: PromptPrefs | null): string[] {
  const place = placeOf(trip)
  const out: string[] = []

  if (trip.isActive) out.push(`What's open near me today?`)

  const mood = prefs?.foodMoods ?? []
  if (mood.includes("local_gems")) out.push(`Where do locals actually eat in ${place}?`)
  else if (mood.includes("night_out")) out.push(`Where's the night out in ${place}?`)
  else if (mood.includes("fine_dining")) out.push(`One dinner worth dressing for in ${place}?`)
  else out.push(`Where should we eat in ${place}?`)

  switch (prefs?.travelRhythm) {
    case "easy":
      out.push(`Add a rest day in ${place}`)
      break
    case "full_days":
      out.push(`What can we fit into one day in ${place}?`)
      break
    default:
      out.push(`What's worth a whole morning in ${place}?`)
  }

  switch (prefs?.mobilityStyle) {
    case "rental_car":
      out.push(`Is ${place} better with a car?`)
      break
    case "walkable":
      out.push(`Can we do ${place} on foot?`)
      break
    case "public_transit":
      out.push(`How do we get around ${place}?`)
      break
  }

  const month = monthOf(trip.startDate)
  if (month && !trip.isActive) out.push(`What's ${place} like in ${month}?`)

  return out
}

/** Questions for an account with nothing booked. */
function idlePrompts(ctx: PromptContext): string[] {
  const out: string[] = []
  const from = ctx.homeCity?.trim()

  if (from) {
    switch (ctx.prefs?.budgetStyle) {
      case "save":
        out.push(`Somewhere good and cheap, a short flight from ${from}`)
        break
      case "splurge":
        out.push(`Somewhere worth splurging on, a short flight from ${from}`)
        break
      default:
        out.push(`Somewhere warm, a short flight from ${from}`)
    }
  }

  // What they said they travel for, asked back to them.
  //
  // KEYED ON PRIORITIES, NOT SHAPES, and that is a fix rather than a rename.
  // This map used to be keyed `islands | high | stones | wild | drive | eat |
  // stay` — the trip SHAPES the first-run flow shows. Those are never stored:
  // `prioritiesForShapes` in daybreak.ts folds them into a four-word vocabulary
  // (eat→food, stones→history, wild→nature, high→nature+views, islands and
  // drive→views) and only that reaches the column. The two sets are disjoint, so
  // the lookup was always undefined and this prompt has never rendered for
  // anybody.
  //
  // `priorities` arrives sorted, so `[0]` is alphabetical rather than a
  // first pick — which is why these read as "what you travel for" rather than
  // "your top answer".
  const priority = (ctx.prefs?.priorities ?? [])[0]
  const byPriority: Record<string, string> = {
    food: "Plan me a trip built around the food",
    history: "Plan me a week of old towns and museums",
    nature: "Plan me a week of trails and open country",
    views: "Plan me a week of coast, ridgelines and long views",
    arts_culture: "Plan me a week of galleries, music and good rooms",
  }
  if (priority && byPriority[priority]) out.push(byPriority[priority])

  return out
}

/** The last resort, so the panel is never short. Deliberately not about
 *  anywhere in particular — an unpersonalised prompt should read as an open
 *  question, not as somebody else's itinerary. */
const GENERIC = [
  "Find me a long weekend somewhere new",
  "Where should I go next?",
  "What's worth booking early?",
]

/**
 * Three questions for this reader, best first.
 *
 * Trip-specific beats profile-specific beats generic, because a question about
 * the place you are going in three weeks is the one most likely to be the
 * reason you opened the app.
 */
export function homeChatPrompts(ctx: PromptContext): string[] {
  const ranked = [
    ...(ctx.trip ? tripPrompts(ctx.trip, ctx.prefs) : []),
    ...idlePrompts(ctx),
    ...GENERIC,
  ]
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of ranked) {
    const key = p.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
    if (out.length === HOME_PROMPT_COUNT) break
  }
  return out
}
