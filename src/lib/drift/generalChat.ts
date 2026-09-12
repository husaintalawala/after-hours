/**
 * A conversation that is not about any one trip.
 *
 * This is the web half of what iOS calls a `general` thread. The system prompt
 * below is a port of DriftChatView.systemPrompt() — the same instrument, so the
 * two apps answer the same question the same way rather than developing two
 * personalities. Where it differs from iOS it differs deliberately, and the
 * comments say where.
 */

export interface GeneralTrip {
  title: string
  city: string | null
  country: string | null
  startDate: string | null
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
    `You are Drift, a sharp, friendly travel assistant inside the Drift trip-planning app.${home}${trips} Answer their question concisely.`,
    `IMPORTANT — you cannot save a trip yourself. Present the plan and let the user save it; NEVER claim or imply you have already created, added or saved a trip.`,
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
  itinerary: unknown | null
} {
  const start = answer.indexOf("<<DRIFT_ITINERARY>>")
  if (start === -1) return { text: answer.trim(), itinerary: null }
  const end = answer.indexOf("<<END>>", start)
  const raw =
    end === -1
      ? answer.slice(start + "<<DRIFT_ITINERARY>>".length)
      : answer.slice(start + "<<DRIFT_ITINERARY>>".length, end)
  let itinerary: unknown | null = null
  try {
    itinerary = JSON.parse(raw.trim())
  } catch {
    // A truncated block is the common failure — the prose above it is still a
    // real answer, so it is kept rather than the whole turn being discarded.
    itinerary = null
  }
  const text = (answer.slice(0, start) + (end === -1 ? "" : answer.slice(end + "<<END>>".length)))
    .trim()
  return { text, itinerary }
}

/** One turn against claude-complete. Resolves to the prose, already cleaned. */
export async function askGeneral(
  system: string,
  transcript: string,
  signal?: AbortSignal
): Promise<{ text: string; itinerary: unknown | null; error?: string }> {
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
