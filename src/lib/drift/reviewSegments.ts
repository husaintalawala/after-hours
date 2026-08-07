// Review-list filter for imported bookings ("Found N bookings").
//
// reservation_segments accumulates every booking any importer ever parsed for
// a trip: the same flight arrives in four emails, a booking the user already
// added is re-parsed by the next scan, and a mailbox sweep drops in bookings
// that belong to a different trip entirely. Rendering that table raw is what
// produced "Found 33 bookings" on a 12-day trip with ~6 real pending ones.
//
// This module turns the raw rows into the reviewable list. The iOS mirror is
// Drift/Core/ReviewSegmentFilter.swift — keep the two in sync (same clustering
// keys, same scope buffer, same ordering of the passes).
//
// Pipeline (order matters):
//   1. CLUSTER  every segment — applied ones included — by shared identity
//      keys (conf + route + day, conf + title, stored dedupe_key), so all
//      copies of one booking end up in one cluster.
//   2. DROP the cluster if any member is already in the itinerary (status
//      applied/duplicate, or its confirmation/dedupe key matches a real
//      steps / transport_bookings row) — that covers the copy that arrived
//      later with a different dedupe_key.
//   3. DROP the cluster if any member was dismissed (status='ignored'), so a
//      re-scan can't resurrect a booking the user rejected.
//   4. DROP the cluster when nothing in it anchors to this trip — a different
//      place AND a date outside the trip window ± buffer. Mirrors the
//      write-time gate in supabase/functions/_shared/segment-writer.ts.
//   5. Pick one representative per surviving cluster (the most complete row)
//      and carry the sibling ids so dismissing it dismisses the whole cluster.

/** Segment fields the filter needs. Superset of what the review card renders. */
export interface ReviewSegmentRow {
  id: string
  category: string
  status: string
  title: string | null
  confirmation_number: string | null
  starts_at: string | null
  ends_at: string | null
  origin_name: string | null
  origin_code: string | null
  destination_name: string | null
  destination_code: string | null
  address: string | null
  dedupe_key: string | null
  needs_review: boolean
  applied_at: string | null
  applied_object_id: string | null
  created_at: string
  parsed_reservation_id: string
}

/** What ties a segment to the trip: the window and the places it covers. */
export interface TripScope {
  /** YYYY-MM-DD, inclusive. Null disables date scoping. */
  startDay: string | null
  endDay: string | null
  /** City / country / destination names, raw — normalized in here. */
  places: string[]
}

/** Identity of everything already on the itinerary (steps + transport_bookings). */
export interface ItineraryKeys {
  confirmationNumbers: string[]
  dedupeKeys: string[]
}

export interface ReviewCluster {
  /** The row to render. */
  segment: ReviewSegmentRow
  /** Every segment id in the cluster (including the representative) — dismiss
   *  writes status='ignored' to all of them. */
  ids: string[]
  /** How many rows collapsed into this one (0 = no duplicates). */
  duplicateCount: number
}

/** ± days around the trip window that still counts as "this trip". Matches
 *  AUTO_WINDOW_BUFFER_DAYS in segment-writer.ts — deliberately the tight
 *  buffer, not the wide review one: by the time a row reaches the review list
 *  it has already been written, so this is the last gate that can catch a
 *  neighbouring trip's booking (a Jul-31 Montreal flight on a Jul 1-12 trip). */
export const TRIP_WINDOW_BUFFER_DAYS = 3

/** Combining diacritics left behind by NFKD ("Reykjavík" → "Reykjavik"). */
const COMBINING_MARKS = /[\u0300-\u036f]/g

const TRANSPORT = new Set(["flight", "train", "bus", "car_rental"])
/** Statuses that mean "this is on the itinerary already". */
const ADDED_STATUSES = new Set(["applied", "duplicate"])
const MS_PER_DAY = 86_400_000

/** Lowercase, strip accents, drop every non-alphanumeric. "FI 618" and
 *  "FI618" — the same flight split across two emails — normalize equal. */
export function norm(s: string | null | undefined): string {
  if (!s) return ""
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-z0-9]+/g, "")
}

function day(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : ""
}

function dayMs(d: string): number | null {
  if (!d) return null
  const ms = Date.parse(`${d}T00:00:00Z`)
  return Number.isFinite(ms) ? ms : null
}

/** Every key a row is known by. Two rows are the same booking if they share
 *  any one of them. Transport keys carry the route so a round-trip booked on
 *  one confirmation number stays two rows. */
export function identityKeys(r: ReviewSegmentRow): string[] {
  const cat = r.category
  const d = day(r.starts_at) || day(r.ends_at)
  const conf = norm(r.confirmation_number)
  const keys: string[] = []

  if (TRANSPORT.has(cat)) {
    const from = norm(r.origin_code) || norm(r.origin_name)
    const to = norm(r.destination_code) || norm(r.destination_name)
    if (from || to) {
      const route = `${from}>${to}`
      if (d) keys.push(`${cat}:${d}:${route}`)
      // Undated copies of the same leg still collapse onto the dated ones.
      if (conf) keys.push(`${cat}:conf:${conf}:${route}`)
    }
    const t = norm(r.title)
    if (d && t) keys.push(`${cat}:${d}:${t}`)
    if (keys.length === 0 && conf) keys.push(`${cat}:conf:${conf}`)
  } else {
    const name = norm(r.title) || norm(r.destination_name) || norm(r.address)
    // A stay split across two rows (one per night) shares its confirmation.
    if (conf) keys.push(`${cat}:conf:${conf}`)
    if (d && name) keys.push(`${cat}:${d}:${name}`)
  }

  if (r.dedupe_key) keys.push(`dk:${r.dedupe_key}`)
  return keys
}

function titleKey(r: ReviewSegmentRow): string {
  return norm(r.title) || norm(r.destination_name)
}

/** Same booking, differently titled: "Húsavík: Family-Run Whale Watching Tour"
 *  vs "Family-Run Whale Watching Tour". Containment only — and only when the
 *  confirmation matches, or it's the same non-transport category on the same
 *  day — so unrelated bookings can't merge on a common word. */
function fuzzySameBooking(a: ReviewSegmentRow, b: ReviewSegmentRow): boolean {
  const ta = titleKey(a)
  const tb = titleKey(b)
  if (ta.length < 8 || tb.length < 8) return false
  if (!(ta.includes(tb) || tb.includes(ta))) return false
  const ca = norm(a.confirmation_number)
  const cb = norm(b.confirmation_number)
  if (ca && ca === cb) return true
  return (
    a.category === b.category &&
    !TRANSPORT.has(a.category) &&
    day(a.starts_at) === day(b.starts_at)
  )
}

/** Union-find over segment ids and identity keys. */
class DisjointSet {
  private parent = new Map<string, string>()
  find(x: string): string {
    let root = x
    for (;;) {
      const p = this.parent.get(root)
      if (p === undefined) {
        this.parent.set(root, root)
        break
      }
      if (p === root) break
      root = p
    }
    // Path compression — the chains here are short, but this keeps a big
    // trip's clustering linear rather than quadratic.
    let cur = x
    while (cur !== root) {
      const next = this.parent.get(cur) ?? root
      this.parent.set(cur, root)
      cur = next
    }
    return root
  }
  union(a: string, b: string) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }
}

/** True when the segment has any anchor to the trip: a place that matches a
 *  trip destination, or a date inside the window ± buffer. A segment carrying
 *  neither signal can't be judged, so it stays. */
export function anchorsToTrip(r: ReviewSegmentRow, scope: TripScope): boolean {
  const places = scope.places.map(norm).filter((p) => p.length >= 3)
  const placeText = [r.origin_name, r.destination_name, r.address]
    .map(norm)
    .filter((t) => t.length > 0)
  const geo = placeText.some((t) => places.some((p) => p.includes(t) || t.includes(p)))
  if (geo) return true

  const start = dayMs(scope.startDay ?? "")
  const end = dayMs(scope.endDay ?? "") ?? start
  const stamps = [day(r.starts_at), day(r.ends_at)]
    .map(dayMs)
    .filter((v): v is number => v !== null)
  const canJudgeDate = start !== null && stamps.length > 0
  // No date to judge (undated booking, or a trip with no window) → the place
  // alone never drops a row, same as the write-time gate. An undated Iceland
  // tour has to survive this.
  if (!canJudgeDate) return true

  const pad = TRIP_WINDOW_BUFFER_DAYS * MS_PER_DAY
  return Math.min(...stamps) <= (end as number) + pad && Math.max(...stamps) >= start - pad
}

/** How complete a row is — used to pick the representative of a cluster. */
function completeness(r: ReviewSegmentRow): number {
  let n = 0
  for (const v of [
    r.confirmation_number,
    r.starts_at,
    r.ends_at,
    r.origin_name,
    r.destination_name,
    r.address,
    r.title,
  ])
    if (v) n++
  return n
}

/**
 * Collapse raw trip segments into the review list.
 *
 * @param rows   EVERY reservation_segments row for the trip — applied and
 *               ignored ones included. They are what makes duplicate and
 *               already-added detection work; they're never rendered.
 */
export function buildReviewList(
  rows: ReviewSegmentRow[],
  scope: TripScope,
  itinerary: ItineraryKeys
): ReviewCluster[] {
  const ds = new DisjointSet()
  for (const r of rows) {
    const rowNode = `row:${r.id}`
    ds.find(rowNode)
    for (const k of identityKeys(r)) ds.union(rowNode, `key:${k}`)
  }
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (fuzzySameBooking(rows[i], rows[j])) ds.union(`row:${rows[i].id}`, `row:${rows[j].id}`)
    }
  }

  const clusters = new Map<string, ReviewSegmentRow[]>()
  for (const r of rows) {
    const root = ds.find(`row:${r.id}`)
    const list = clusters.get(root) ?? []
    list.push(r)
    clusters.set(root, list)
  }

  const itinConfs = new Set(itinerary.confirmationNumbers.map(norm).filter(Boolean))
  const itinKeys = new Set(itinerary.dedupeKeys.filter(Boolean))

  const out: ReviewCluster[] = []
  for (const members of clusters.values()) {
    const alreadyAdded = members.some(
      (m) =>
        ADDED_STATUSES.has(m.status) ||
        !!m.applied_at ||
        !!m.applied_object_id ||
        (!!norm(m.confirmation_number) && itinConfs.has(norm(m.confirmation_number))) ||
        (!!m.dedupe_key && itinKeys.has(m.dedupe_key))
    )
    if (alreadyAdded) continue
    if (members.some((m) => m.status === "ignored")) continue
    if (!members.some((m) => anchorsToTrip(m, scope))) continue

    const best = members.reduce((a, b) => {
      const d = completeness(b) - completeness(a)
      if (d > 0) return b
      if (d < 0) return a
      return b.created_at > a.created_at ? b : a
    })
    out.push({
      segment: best,
      ids: members.map((m) => m.id),
      duplicateCount: members.length - 1,
    })
  }

  // Chronological, undated last — the review list reads as an itinerary.
  return out.sort((a, b) => {
    const da = a.segment.starts_at ?? "9999"
    const db = b.segment.starts_at ?? "9999"
    return da < db ? -1 : da > db ? 1 : 0
  })
}
