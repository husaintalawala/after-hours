// Timezone-SAFE date-only helpers. The iOS day-bucketing (DestinationTimeline)
// deliberately buckets by the date-only `date` column ("yyyy-MM-dd"), NOT by the
// `scheduled_at` UTC timestamp — because `startOfDay` on a midnight-UTC stamp
// lands a day earlier in any tz west of UTC, dropping the item from the day
// filmstrip. We replicate that by working purely in "yyyy-MM-dd" strings, which
// removes the browser's local timezone from the math entirely.

export type DateStr = string // "yyyy-MM-dd"

export function dateOnly(s: string | null | undefined): DateStr | null {
  if (!s) return null
  const d = s.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
}

/** Add `n` days to a "yyyy-MM-dd" string using UTC math (tz-independent). */
export function addDays(date: DateStr, n: number): DateStr {
  const [y, m, d] = date.split("-").map(Number)
  const t = Date.UTC(y, m - 1, d) + n * 86_400_000
  const dt = new Date(t)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(dt.getUTCDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}

/** Lexical compare works for "yyyy-MM-dd": <0 if a before b. */
export function compareDate(a: DateStr, b: DateStr): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function clampDate(date: DateStr, lo: DateStr, hi: DateStr): DateStr {
  if (compareDate(date, lo) < 0) return lo
  if (compareDate(date, hi) > 0) return hi
  return date
}

/** Minutes-from-midnight for the "HH:MM" inside an ISO-ish string, tz-safe
 *  (reads the literal HH:MM at chars 11-16 rather than parsing to a Date).
 *  scheduled_at is written by the backend as `${date}T${time}:00` with no zone. */
export function minutesOfDayFromIso(iso: string | null | undefined): number | null {
  if (!iso) return null
  const m = /T(\d{2}):(\d{2})/.exec(iso)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** "Mon, Jul 6" style label for a "yyyy-MM-dd" string (rendered in UTC so the
 *  weekday matches the stored calendar date regardless of viewer tz). */
export function formatDayLabel(date: DateStr): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}
