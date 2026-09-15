/**
 * A conversation that is not about any one trip.
 *
 * This is the web half of what iOS calls a `general` thread. The system prompt
 * below is a port of DriftChatView.systemPrompt() — the same instrument, so the
 * two apps answer the same question the same way rather than developing two
 * personalities. Where it differs from iOS it differs deliberately, and the
 * comments say where.
 */

/** One place inside a chat-proposed day. */
export interface ItineraryPlace {
  name: string
  why: string
  /** Lookup string for resolve-place / Maps. Trip-chat plans carry one; the
   *  general block does not, and the name is used instead. */
  query?: string
  type?: "spot" | "activity" | "food" | "stay"
  time?: string | null
}

export interface ItineraryDay {
  title: string
  /** yyyy-MM-dd when the plan pinned this day to a date (trip chat). */
  date?: string | null
  destinationRef?: string | null
  places: ItineraryPlace[]
}

/**
 * A multi-day plan the model laid out, parsed out of its machine block.
 *
 * Mirrors iOS's ChatItinerary. `startDate` is the wall-clock string the model
 * emitted, kept as a string rather than a Date deliberately — it is a calendar
 * day, and turning it into an instant here is how a trip starting on the 1st
 * becomes one starting on the 31st for anyone west of Greenwich.
 */
export interface ChatItinerary {
  destination: string
  country: string | null
  title: string
  startDate: string | null
  days: ItineraryDay[]
}

export interface GeneralTrip {
  title: string
  city: string | null
  country: string | null
  startDate: string | null
  /** Present when the chat can add to this trip. */
  id?: string
  endDate?: string | null
  destinations?: Array<{ id: string; date: string | null; nights: number; label: string }>
}

/** The first-run answers as stored. Every field optional — a skipped screen
 *  is a missing field, not an error. */
export interface TravelPrefs {
  party?: string | null
  travel_rhythm?: string | null
  budget_style?: string | null
  mobility_style?: string | null
  food_moods?: string[] | null
  shapes?: string[] | null
  notes?: string | null
}

/**
 * The labels the traveller picked their answers under — the same words as iOS
 * DaybreakPrefCatalog and ask-drift-chat's PREF_LABELS, so all three chats
 * describe a person identically. An id missing here (a legacy value) is left
 * out rather than leaking a slug into the prompt.
 */
const PREF_LABELS: Record<string, Record<string, string>> = {
  party: { solo: "Just me", couple: "Two of us", friends: "A group", family: "With kids" },
  travel_rhythm: { easy: "Unhurried", balanced: "Balanced", full_days: "Full days" },
  budget_style: { save: "Careful", smart_mix: "Smart mix", splurge: "No limit" },
  mobility_style: { walkable: "Walkable first", public_transit: "Public transit", rental_car: "Self-drive" },
  food_moods: { local_gems: "Local gems", casual: "Casual", fine_dining: "Fine dining", night_out: "Night out" },
  shapes: {
    wild: "Nature & wildlife",
    stones: "History & ruins",
    drive: "Road trip",
    eat: "Food & drink",
    islands: "Islands & beaches",
    high: "Mountains & hiking",
    stay: "One base, slow days",
  },
}

/**
 * " TRAVELER PREFERENCES, already answered in Drift — …: travelling: With kids; pace: Unhurried."
 *
 * A port of iOS DriftChatView.preferencesLine, leading space included, so it
 * drops into the prompt the same way. Empty when nothing usable is saved.
 */
export function preferencesLine(prefs: TravelPrefs | null | undefined): string {
  if (!prefs) return ""
  const one = (k: keyof typeof PREF_LABELS, v: string | null | undefined) =>
    v ? PREF_LABELS[k][v] ?? null : null
  const many = (k: keyof typeof PREF_LABELS, vs: string[] | null | undefined) =>
    (Array.isArray(vs) ? vs : []).map((v) => PREF_LABELS[k][v]).filter(Boolean)
  const parts: string[] = []
  const party = one("party", prefs.party)
  if (party) parts.push(`travelling: ${party}`)
  const pace = one("travel_rhythm", prefs.travel_rhythm)
  if (pace) parts.push(`pace: ${pace}`)
  const budget = one("budget_style", prefs.budget_style)
  if (budget) parts.push(`budget: ${budget}`)
  const mobility = one("mobility_style", prefs.mobility_style)
  if (mobility) parts.push(`getting around: ${mobility}`)
  const food = many("food_moods", prefs.food_moods)
  if (food.length) parts.push(`food: ${food.join(", ")}`)
  const shapes = many("shapes", prefs.shapes)
  if (shapes.length) parts.push(`loves: ${shapes.join(", ")}`)
  const notes = prefs.notes?.trim()
  if (notes) parts.push(`notes: ${notes}`)
  if (!parts.length) return ""
  return ` TRAVELER PREFERENCES, already answered in Drift — shape every recommendation around them and NEVER ask about any of these again: ${parts.join("; ")}.`
}

const placeKey = (s: string | null | undefined): string[] =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)

/**
 * Which trip a general-chat Add lands in — decided, never asked.
 *
 * Mirrors iOS bestTrip(for:place:): a trip already going to the plan's
 * destination (one not yet ended first), else the next trip not yet ended,
 * else the first trip listed. null only when there are no trips at all, which
 * the caller answers by creating one. Place names are compared by
 * comma-separated part, so "Lisbon, Portugal" matches "Lisbon" but "US" never
 * matches "Austin".
 */
export function chooseTripForItinerary<T extends GeneralTrip>(
  trips: T[],
  itin: { destination: string; country: string | null },
  today: string
): T | null {
  if (!trips.length) return null
  const wanted = new Set([...placeKey(itin.destination), ...placeKey(itin.country)])
  const goesThere = (t: T) =>
    [t.city, t.country, ...(t.destinations ?? []).map((d) => d.label)]
      .flatMap(placeKey)
      .some((k) => wanted.has(k))
  const live = trips.filter((t) => {
    const end = (t.endDate ?? t.startDate)?.slice(0, 10)
    return !end || end >= today
  })
  const soonest = [...live].sort((a, b) =>
    (a.startDate?.slice(0, 10) || "9999").localeCompare(b.startDate?.slice(0, 10) || "9999")
  )[0]
  return live.find(goesThere) ?? trips.find(goesThere) ?? soonest ?? trips[0]
}

/**
 * "Bhutan in Crane Season (Thimphu, Oct 2026); Barcelona (Sep 2026)".
 *
 * WHY THE DIGEST IS IN THE PROMPT AT ALL. Without it the assistant has no idea
 * the account has any trips, so "do I have a New York trip?" gets answered with
 * a confident no, and "add this to my Lisbon trip" gets answered with advice to
 * try TripIt. iOS solved that by injecting exactly this line, and the whole
 * value of it is that the model can answer BY NAME from a list it was handed.
 */
export function tripsDigest(trips: GeneralTrip[]): string {
  return trips
    .slice(0, 24)
    .map((t) => {
      const where = t.city?.trim() || t.country?.trim() || null
      // A wall-clock slice, not a Date: parsing "2026-10-01" as UTC midnight and
      // rendering it locally lands on September in any western timezone, which
      // would put a trip in the wrong month in the model's own context.
      const when = t.startDate?.slice(0, 7) ?? null
      const paren = [where, when].filter(Boolean).join(", ")
      return paren ? `${t.title} (${paren})` : t.title
    })
    .join("; ")
}

/** Today as yyyy-MM-dd, by the reader's calendar rather than the server's. */
function todayISO(): string {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, "0")
  const day = `${d.getDate()}`.padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}

export function generalSystemPrompt(opts: {
  trips: GeneralTrip[]
  homeCity?: string | null
  prefs?: TravelPrefs | null
}): string {
  const digest = tripsDigest(opts.trips)
  const trips = digest
    ? ` The user's trips in Drift are: ${digest}. If they ask whether a trip exists or which trip to use, answer from this list by name. Drift IS their trip planner — NEVER tell them to use another app like TripIt or Google Trips.`
    : ""
  const home = opts.homeCity?.trim()
    ? ` They live in ${opts.homeCity.trim()}; use it for "near me" and flight-time questions.`
    : ""

  // ITINERARY MODE is carried over verbatim in intent, because the block it
  // describes is what `stripItineraryBlock` below removes. Drop one and the
  // other becomes either dead code or raw JSON on screen.
  return [
    `You are Drift, a sharp, friendly travel assistant inside the Drift trip-planning app.${home}${trips}${preferencesLine(opts.prefs)} Answer their question concisely.`,
    `NEVER INTERVIEW. When they want a trip or days planned, do not ask who is going, the occasion, interests, pace or budget first — lay the itinerary out NOW from what you already know (their preferences, their trips, and their message), making sensible assumptions and naming any in one short clause. They tweak it afterwards. Ask a question only when there is no destination at all.`,
    `IMPORTANT — you cannot save a trip yourself. Under any itinerary you lay out the app shows an Add button on every place and a "Create this trip" button, and only the user's tap on one writes anything. NEVER claim or imply you have already created, added or saved a trip.`,
    `ITINERARY MODE — when the user asks you to plan a multi-day or day-by-day trip (2+ days, or "plan my trip to X"), write a SHORT 1–2 sentence intro, then append EXACTLY ONE machine block on its own line with NOTHING after it:`,
    `<<DRIFT_ITINERARY>>{"destination":"Montreal","country":"Canada","title":"3 days in Montreal","start_date":"2026-08-15","days":[{"title":"Old Montreal","places":[{"name":"Notre-Dame Basilica","why":"Gothic-revival landmark"}]}]}<<END>>`,
    `Block rules: 3–4 REAL places per day, "why" is one short line, valid minified JSON, no markdown or newlines inside it. Today is ${todayISO()}; if the user named dates, set "start_date" to the first day as yyyy-MM-dd and make the number of days match the range; OMIT "start_date" when they gave none, and then use 3–5 days. Do NOT also write the day-by-day list in prose. Omit the block entirely for anything that is not a multi-day itinerary.`,
    `Format the prose with light markdown: **bold** key names and facts, short "- " bullets for concrete details. Keep it tight and skimmable. Never invent specifics you are unsure of.`,
  ].join("\n")
}

/**
 * The transcript, as one string — which is the shape claude-complete takes.
 *
 * It has no `messages` array: the contract is { system?, user, max_tokens? }, so
 * the conversation is flattened the way iOS flattens it, newest 20 turns, each
 * prefixed by who said it.
 */
export function flattenTurns(turns: Array<{ role: string; text: string }>): string {
  return turns
    .filter((t) => t.text.trim())
    .slice(-20)
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.text}`)
    .join("\n\n")
}

/**
 * Split the hidden itinerary block out of the prose.
 *
 * IT MUST BE REMOVED WHETHER OR NOT WE RENDER IT. The model is instructed to
 * emit `<<DRIFT_ITINERARY>>{…}<<END>>`, so an answer that is not cleaned shows
 * the reader a wall of raw JSON. iOS parses the block into a map and day-by-day
 * cards; web does not draw those yet, so it strips the block and keeps the
 * prose. The parsed object is returned anyway — the day it is rendered, the
 * caller already has it.
 */
export function stripItineraryBlock(answer: string): {
  text: string
  itinerary: ChatItinerary | null
} {
  const start = answer.indexOf("<<DRIFT_ITINERARY>>")
  if (start === -1) return { text: answer.trim(), itinerary: null }
  const end = answer.indexOf("<<END>>", start)
  const raw =
    end === -1
      ? answer.slice(start + "<<DRIFT_ITINERARY>>".length)
      : answer.slice(start + "<<DRIFT_ITINERARY>>".length, end)
  let itinerary: ChatItinerary | null = null
  try {
    itinerary = coerceItinerary(JSON.parse(raw.trim()))
  } catch {
    // A truncated block is the common failure — the prose above it is still a
    // real answer, so it is kept rather than the whole turn being discarded.
    itinerary = null
  }
  const text = (answer.slice(0, start) + (end === -1 ? "" : answer.slice(end + "<<END>>".length)))
    .trim()
  return { text, itinerary }
}

/**
 * Shape whatever parsed into something renderable, or nothing.
 *
 * TOLERANT BY DESIGN. This is model output crossing a JSON boundary, and a
 * strict decode that throws on one unexpected field loses an entire itinerary
 * over a stray key — the "LLM-JSON silent blank" failure this codebase has hit
 * before. Anything with a destination and at least one day with one place is
 * worth drawing; everything else falls back to prose, which is never wrong.
 */
function coerceItinerary(raw: unknown): ChatItinerary | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const destination = typeof o.destination === "string" ? o.destination.trim() : ""
  const daysRaw = Array.isArray(o.days) ? o.days : []
  const days: ItineraryDay[] = daysRaw
    .map((d): ItineraryDay | null => {
      if (!d || typeof d !== "object") return null
      const dd = d as Record<string, unknown>
      const placesRaw = Array.isArray(dd.places) ? dd.places : []
      const places = placesRaw
        .map((pl): ItineraryPlace | null => {
          if (!pl || typeof pl !== "object") return null
          const pp = pl as Record<string, unknown>
          const name = typeof pp.name === "string" ? pp.name.trim() : ""
          if (!name) return null
          return { name, why: typeof pp.why === "string" ? pp.why.trim() : "" }
        })
        .filter((x): x is ItineraryPlace => x !== null)
      if (!places.length) return null
      return { title: typeof dd.title === "string" ? dd.title.trim() : "", places }
    })
    .filter((x): x is ItineraryDay => x !== null)

  if (!destination || !days.length) return null
  const start = typeof o.start_date === "string" ? o.start_date.slice(0, 10) : null
  return {
    destination,
    country: typeof o.country === "string" ? o.country.trim() || null : null,
    title: typeof o.title === "string" && o.title.trim() ? o.title.trim() : `${destination} trip`,
    startDate: start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : null,
    days,
  }
}

/** One turn against claude-complete. Resolves to the prose, already cleaned. */
export async function askGeneral(
  system: string,
  transcript: string,
  signal?: AbortSignal
): Promise<{ text: string; itinerary: ChatItinerary | null; error?: string }> {
  try {
    const res = await fetch("/api/drift/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, user: transcript }),
      signal,
    })
    const json = (await res.json()) as { ok?: boolean; text?: string; error?: string }
    if (!res.ok || json.ok === false || !json.text) {
      return { text: "", itinerary: null, error: json.error || "no answer" }
    }
    return stripItineraryBlock(json.text)
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return { text: "", itinerary: null, error: "aborted" }
    return { text: "", itinerary: null, error: "network" }
  }
}
