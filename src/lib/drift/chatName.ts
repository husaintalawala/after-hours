/**
 * What a chat thread is CALLED — in one place, because it is asked in two.
 *
 * The home panel and the Chats tab each resolved this inline, with the same
 * chain written out twice and a comment in homeData.ts warning that a thread
 * called "Barcelona" in one place and something else in the other is two names
 * for one object. Two copies of a rule is how that happens, so the rule lives
 * here now and both call it.
 *
 * THE LAST RUNG USED TO BE THE WORD "Chat". Most threads hang off a trip and
 * take its title, but a free-standing one — started from the home bar, about
 * nowhere in particular — has no trip, no anchor label, and no title of its
 * own, so it fell all the way through to the literal string "Chat". One of
 * those is uninformative; a column of four, which is what the home panel shows
 * once it lists six, is a list that tells the reader nothing at all.
 *
 * So the real last rung is what the person actually said. The first thing you
 * type into a thread is the best short name it will ever have — it is the
 * question you came to ask — and unlike a stored title it needs no migration
 * and no write path: it is already in trip_chat_messages, and it names every
 * thread that exists today rather than only the ones opened from now on.
 */

/** A message, cut down to something that fits on one line of a list row. */
export function chatSnippet(text: string | null | undefined): string | null {
  if (!text) return null
  // Collapse newlines and runs of space — a pasted itinerary is one line here.
  const flat = text.replace(/\s+/g, " ").trim()
  if (!flat) return null
  const MAX = 48
  if (flat.length <= MAX) return flat
  // Cut on a word boundary when there is one to cut on, so the label does not
  // end mid-word; fall back to a hard cut for a single long token (a URL).
  const cut = flat.slice(0, MAX)
  const lastSpace = cut.lastIndexOf(" ")
  const body = lastSpace > MAX * 0.6 ? cut.slice(0, lastSpace) : cut
  return `${body.replace(/[,;:.\-\s]+$/, "")}…`
}

/**
 * The display name for one thread, in priority order.
 *
 * The trip's CURRENT title beats the label stored on the session, deliberately:
 * a trip that gets renamed should rename its thread, and the stored label is a
 * snapshot from whenever the thread was opened.
 */
export function resolveChatName(parts: {
  tripTitle?: string | null
  anchorLabel?: string | null
  sessionTitle?: string | null
  /** The first thing the reader typed — see chatSnippet. */
  firstMessage?: string | null
}): string {
  return (
    parts.tripTitle?.trim() ||
    parts.anchorLabel?.trim() ||
    parts.sessionTitle?.trim() ||
    parts.firstMessage?.trim() ||
    "Chat"
  )
}

/** Does this thread need the reader's own words to be nameable? */
export function needsFirstMessage(parts: {
  tripTitle?: string | null
  anchorLabel?: string | null
  sessionTitle?: string | null
}): boolean {
  return !(parts.tripTitle?.trim() || parts.anchorLabel?.trim() || parts.sessionTitle?.trim())
}

/** One row of the answer — the only part of the query whose shape matters. */
interface OpenerRow {
  session_id: string | null
  text: string | null
}

/**
 * How the caller gets those rows.
 *
 * A CALLBACK RATHER THAN THE CLIENT, and not for testability. Writing the
 * builder chain out as a structural interface made tsc give up —
 * "TS2589: Type instantiation is excessively deep" — because the generated
 * Database types resolve `.from("trip_chat_messages").select(...)` through
 * enough conditional layers to blow the depth limit when matched against a
 * hand-written shape. Handing the query back to the caller, who already holds a
 * properly typed client, keeps this module free of the generated types
 * altogether and costs each call site three lines.
 */
export type OpenerFetch = (ids: string[]) => PromiseLike<{ data: OpenerRow[] | null }>

/** The caller passes at most a listful of ids; this is the backstop. */
export const MAX_SESSIONS = 60
/** Rows to pull for the whole set. A thread whose opener falls outside the
 *  window simply keeps "Chat", which is where it already was. */
export const MAX_OPENER_ROWS = 600

/**
 * The first thing the reader typed in each of these threads.
 *
 * ONE ROUND TRIP for the whole set rather than one per row, and only for the
 * threads that actually need it — a trip chat is already named, so asking about
 * it would be a query spent on an answer nobody reads.
 *
 * The row cap is a backstop, not a budget: the caller passes at most a
 * listful of ids, and a thread whose first message falls outside the window
 * simply keeps the old "Chat", which is where it was already.
 */
export async function firstUserMessages(
  fetchRows: OpenerFetch,
  sessionIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const ids = sessionIds.slice(0, MAX_SESSIONS)
  if (!ids.length) return out

  const { data } = await fetchRows(ids)

  for (const row of data ?? []) {
    const id = row.session_id
    if (!id || out.has(id)) continue // ascending, so the first seen IS the first sent
    const snippet = chatSnippet(row.text)
    if (snippet) out.set(id, snippet)
  }
  return out
}
