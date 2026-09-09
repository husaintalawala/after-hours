/**
 * Daybreak — the first-run flow's non-visual half: who sees it, and which
 * guides its fourth screen offers.
 *
 * Ported from the iOS DaybreakFlow (Drift/Views/DaybreakFlow.swift). Everything
 * here is pure except the cookie writer, so the routing rule and the filter can
 * be reasoned about without a browser.
 */

/**
 * "This account has already met the six questions."
 *
 * iOS decides with `FirstRun.shouldLand(userID:)` — a device-local UserDefaults
 * marker AND "the account has no trips". A cookie is the web analog of that
 * marker: per-browser, cleared with site data, and readable by the server
 * component that has to decide before anything renders.
 *
 * A `profiles.first_run_seen_at` column would be the better answer — it is the
 * same fact on every device the person signs in from, and it is what iOS's
 * marker cannot do either. It is NOT done here because adding a column is a
 * migration against live data, and migrations in this project stop for the
 * owner's explicit sign-off, which has not been given for this feature. The
 * cookie is the version that ships without asking anyone to approve a schema
 * change; the column is the follow-up.
 */
export const DAYBREAK_COOKIE = "drift_daybreak"

/** A year. The flow is once-per-account, so the only thing a shorter life buys
 *  is showing it again to somebody who already answered it. */
export const DAYBREAK_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * Mark the flow as met, from the browser.
 *
 * CALLED ON ENTRY, NEVER ON COMPLETION. `UsernameSetupView` — the screen this
 * flow replaces — was a root view with no exit, and marking a first run "done"
 * only when it is finished is what turns a welcome into a wall: a force-refresh
 * at question three would otherwise land back at question one, forever. Written
 * the moment the flow mounts, so the very next load of /app goes to the app.
 *
 * Not httpOnly on purpose — it is written here, in the browser, and carries no
 * capability: it says "seen", nothing more.
 */
export function markDaybreakSeen(): void {
  if (typeof document === "undefined") return
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : ""
  document.cookie = `${DAYBREAK_COOKIE}=1; Path=/; Max-Age=${DAYBREAK_COOKIE_MAX_AGE}; SameSite=Lax${secure}`
}

/**
 * The guides that match what was picked on screen 3.
 *
 * UNION, NOT INTERSECTION. Somebody who taps "Into the wild" AND "Up high"
 * means either would suit them, and requiring both of a forty-row corpus
 * returns an empty screen surprisingly often. With nothing picked — or with a
 * pick that nothing on the shelf carries — the front of the shelf is the honest
 * answer, because a screen with no trips on it is the one outcome this flow
 * cannot afford.
 *
 * Structural rather than typed to DaybreakGuide so it stays a pure list
 * operation this file can own without importing the shelf.
 */
export function pickForShapes<T extends { tags: string[] }>(
  guides: readonly T[],
  shapes: ReadonlySet<string>,
  count = 3
): T[] {
  if (!shapes.size) return guides.slice(0, count)
  const matched = guides.filter((g) => g.tags.some((t) => shapes.has(t)))
  return (matched.length ? matched : guides).slice(0, count)
}

/**
 * The count, spelled, for "Three of ours fit that."
 *
 * A headline is a sentence and a sentence does not open with a numeral. Beyond
 * the table it falls back to the digits — the flow only ever shows three, so
 * the tail exists to be correct rather than to be read.
 */
const SPELLED = ["Nothing", "One", "Two", "Three", "Four", "Five"]
export function spelledCount(n: number): string {
  return SPELLED[n] ?? String(n)
}
