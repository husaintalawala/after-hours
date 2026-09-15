/**
 * Where a place from a chat itinerary lands in a trip: which day, and under
 * which destination.
 *
 * Decided here, never asked. apply-quick-op refuses a create_step whose date is
 * outside the trip or whose parent destination it cannot resolve, so these two
 * answers are what stand between an Add tap and a silent 422. Pure, and in
 * yyyy-MM-dd strings throughout — a calendar day parsed as an instant walks back
 * a day west of Greenwich.
 */

export interface PlacementDestination {
  id: string
  date: string | null
  nights: number
  label: string
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const day = (s: string | null | undefined): string | null => {
  const d = s?.slice(0, 10) ?? ""
  return ISO.test(d) ? d : null
}

export function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86_400_000)
  return `${t.getUTCFullYear()}-${`${t.getUTCMonth() + 1}`.padStart(2, "0")}-${`${t.getUTCDate()}`.padStart(2, "0")}`
}

/** "Sep 10" for a yyyy-MM-dd string, read in UTC so the day never shifts. */
export function shortDate(iso: string): string {
  const [y, mo, d] = iso.split("-").map(Number)
  if (!y || !mo || !d) return iso
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

/** The last calendar day the destinations cover (start + nights), or null. */
export function lastDestinationDay(dests: PlacementDestination[]): string | null {
  let last: string | null = null
  for (const d of dests) {
    const s = day(d.date)
    if (!s) continue
    const e = addDaysISO(s, Math.max(0, d.nights))
    if (!last || e > last) last = e
  }
  return last
}

/**
 * The date for day `dayIndex` (0-based) of a plan: the day's own date, else
 * the plan's start + index (a general plan the user gave dates for), else the
 * trip's start + index. A candidate outside the trip is skipped, and null —
 * an unscheduled stop — is the answer when nothing fits.
 */
export function dayDateFor(
  dayIndex: number,
  opts: {
    dayDate?: string | null
    planStart?: string | null
    tripStart?: string | null
    tripEnd?: string | null
  }
): string | null {
  const start = day(opts.tripStart)
  const end = day(opts.tripEnd)
  const inTrip = (d: string) => (!start || d >= start) && (!end || d <= end)
  const own = day(opts.dayDate)
  if (own && inTrip(own)) return own
  const plan = day(opts.planStart)
  if (plan) {
    const c = addDaysISO(plan, dayIndex)
    if (inTrip(c)) return c
  }
  if (start) {
    const c = addDaysISO(start, dayIndex)
    if (inTrip(c)) return c
  }
  return null
}

const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()

/**
 * The destination a stop hangs off: the one whose stay covers the date, else
 * the one the plan named, else the latest to start on or before the date, else
 * the first. null only for a trip with no destinations.
 */
export function pickDestinationId(
  dests: PlacementDestination[],
  date: string | null,
  ref: string | null | undefined
): string | null {
  if (!dests.length) return null
  const sorted = [...dests].sort((a, b) => (day(a.date) ?? "").localeCompare(day(b.date) ?? ""))
  const d = day(date)
  if (d) {
    const covering = sorted.find((x) => {
      const s = day(x.date)
      return s && d >= s && d <= addDaysISO(s, Math.max(0, x.nights))
    })
    if (covering) return covering.id
  }
  const r = norm(ref)
  if (r) {
    const named = sorted.find((x) => {
      const l = norm(x.label)
      return l && (l === r || l.split(",")[0].trim() === r.split(",")[0].trim())
    })
    if (named) return named.id
  }
  if (d) {
    const before = sorted.filter((x) => (day(x.date) ?? "") <= d).pop()
    if (before) return before.id
  }
  return sorted[0].id
}
