// Trip-level notes rollup — every note in a trip, compiled into one list.
//
// WHAT A "NOTE" IS HERE, because there are three shapes and they are easy to
// conflate (confirmed against production data):
//
//   1. NOTE STEPS — a step row with step_type='note', parent_step_id = the
//      destination, the body in `notes`, and author_id stamped. This is the
//      thing that already looks like "Notes" in the iOS product: an authored,
//      timestamped, per-day entry. 35 of these exist in prod. They are
//      INVISIBLE on web today, because timeline.ts's mapStepType returns null
//      for 'note' and the row is dropped from the day timeline.
//   2. ANNOTATIONS — `notes` on an ordinary stay/spot/food/activity row, or on
//      a destination row. Anonymous, no timestamp. 504 in prod, so this is
//      where most of the writing actually is.
//   3. BOOKING NOTES — transport_bookings.notes, a different table. Genuinely
//      hand-written ("seat 14A", "check in 24h before").
//
// PROVENANCE. `steps.source = 'recommendation'` marks text Drift wrote, not the
// user — every suggestion-created restaurant carries the same "Drift recommends
// — book via Resy / OpenTable / phone to confirm." Only 24 rows in prod, so this
// filters them out rather than building a collapsed drawer for them; a drawer is
// scaffolding for a problem that is 24 rows big.
//
// WRITING. The rollup can ADD a day note (a new step_type='note' row) per stop.
// It does not EDIT existing ones: insertNoteStep mirrors an 80-char preview into
// `location_name` while updateStepNotes writes only `notes`, so an in-place edit
// would permanently desync the preview iOS falls back to. Adding is safe because
// it goes through the same insert shape as iOS — including author_id, without
// which a web-authored note shows as authorless on the phone and its own author
// cannot delete it there.
//
// The synthetic "unassigned" bucket gets no composer: its id is the string
// "unassigned", not a uuid, so an insert against it is Postgres 22P02.

export interface TripNote {
  id: string
  /** note = authored day note · annotation = text on an item · booking = transport note */
  kind: "note" | "annotation" | "booking"
  body: string
  /** What this note is about, so it survives being read out of its own screen. */
  context: string
  /** yyyy-MM-dd, for ordering within a stop. */
  date: string | null
  authorName: string | null
  authorAvatar: string | null
  /** Who wrote it. Needed to gate edit/delete to the author; NULL on the many
   *  pre-attribution rows, which is why attribution must degrade rather than
   *  claim an author it does not know. */
  authorId: string | null
  createdAt: string | null
  /** The step/booking this came from, for a "go to it" affordance. */
  sourceId: string
}

export interface TripNoteGroup {
  destId: string | null
  destLabel: string
  dateRange: string | null
  /** yyyy-MM-dd of the stop's first day — what a new note here is pinned to. */
  startDate: string | null
  notes: TripNote[]
}

interface StepLike {
  id: string
  step_type: string | null
  notes: string | null
  title: string | null
  location_name: string | null
  parent_step_id: string | null
  date: string
  author_id: string | null
  created_at: string | null
  source: string | null
  place_category: string | null
}

interface BookingLike {
  id: string
  notes: string | null
  mode: string
  from_destination_id: string | null
  to_destination_id: string | null
}

interface DestLike {
  id: string
  label: string
  dateRange: string | null
  startDate: string | null
}

interface ProfileLike {
  display_name: string | null
  username: string | null
  avatar_url: string | null
}

const has = (v: string | null | undefined): v is string => !!v && v.trim().length > 0

/** Drift's own boilerplate, not the traveller's writing. */
const isMachineWritten = (s: StepLike) => s.source === "recommendation"

/// Booking notes have no `source` column to discriminate on, and the agent
/// writes route summaries straight into the same field —
/// "~221 km · 3h 4m · Hringvegur · ✨ Drift planned · The Ring Road and regional
/// routes are the way to get around Iceland." That is trip DATA, not something
/// anyone wrote down, and it dominated the rollup on a multi-stop trip. The
/// marker is emitted by TripAgentRuntime.swift:783 as a literal prefix, so
/// matching it is exact rather than heuristic.
const isMachineBookingNote = (body: string) => body.includes("✨ Drift planned")

/// Split a note into its text and its first URL, matching the iOS parser
/// (DestinationDaysView.parseNote) so a note renders the same on both.
/// Notes are frequently JUST a pasted Google Maps link, which as raw text is
/// an unreadable wall and not tappable.
export function splitNoteURL(body: string): { text: string; url: string | null } {
  const m = body.match(/https?:\/\/[^\s]+/)
  if (!m) return { text: body, url: null }
  return { text: body.replace(m[0], "").trim(), url: m[0] }
}

export function isMapsURL(url: string): boolean {
  const s = url.toLowerCase()
  return (
    s.includes("maps.app.goo.gl") ||
    s.includes("google.com/maps") ||
    s.includes("maps.google") ||
    s.includes("goo.gl/maps")
  )
}

function humanize(s: StepLike): string {
  const name = s.title || s.location_name
  if (has(name)) return name.trim()
  const kind = s.place_category || s.step_type
  return has(kind) ? kind.replace(/_/g, " ") : "Untitled"
}

/**
 * Compile every note in the trip, grouped by stop in itinerary order.
 *
 * Deliberately does NOT reuse buildDestinationTimeline. That helper only emits
 * stay/spot/food/activity items — mapStepType returns null for everything else
 * and the row is dropped — so note steps, destination rows and flight/time_block
 * children are simply not in its output and cannot be filtered back out of it.
 * Grouping here is a plain parent_step_id bucket, which is the only destination
 * identifier that exists on a child row.
 */
export function buildTripNotes(
  steps: StepLike[],
  destinations: DestLike[],
  bookings: BookingLike[],
  profileById: Map<string, ProfileLike>,
): TripNoteGroup[] {
  const author = (id: string | null) => {
    if (!id) return { authorName: null, authorAvatar: null }
    const p = profileById.get(id)
    return {
      authorName: p?.display_name || p?.username || null,
      authorAvatar: p?.avatar_url ?? null,
    }
  }

  const destIds = new Set(destinations.map((d) => d.id))
  const groups: TripNoteGroup[] = []

  for (const dest of destinations) {
    const notes: TripNote[] = []
    const destRow = steps.find((s) => s.id === dest.id)

    // The stop's own note. There is no editor for this on either platform
    // today, so in practice it is only ever written by the chat agent — but
    // when it exists it belongs at the top of the stop.
    if (destRow && has(destRow.notes) && !isMachineWritten(destRow)) {
      notes.push({
        id: `dest:${destRow.id}`,
        kind: "annotation",
        body: destRow.notes.trim(),
        context: "About this stop",
        date: destRow.date ?? null,
        ...author(null),
          authorId: null,
        createdAt: destRow.created_at,
        sourceId: destRow.id,
      })
    }

    for (const s of steps) {
      if (s.parent_step_id !== dest.id) continue
      if (!has(s.notes)) continue
      if (isMachineWritten(s)) continue

      if (s.step_type === "note") {
        notes.push({
          id: s.id,
          kind: "note",
          body: s.notes.trim(),
          context: "Day note",
          date: s.date ?? null,
          ...author(s.author_id),
          authorId: s.author_id,
          createdAt: s.created_at,
          sourceId: s.id,
        })
      } else {
        notes.push({
          id: s.id,
          kind: "annotation",
          body: s.notes.trim(),
          context: humanize(s),
          date: s.date ?? null,
          ...author(null),
          authorId: null,
          createdAt: s.created_at,
          sourceId: s.id,
        })
      }
    }

    // Booking notes. A leg is the outbound of one stop AND the inbound of the
    // next, so keying on both double-counts: attach to the DEPARTURE side when
    // there is one, otherwise the arrival side. Departure-only would silently
    // drop the inbound flight into the first stop — which is exactly the leg
    // most likely to carry "seat 14A / check in 24h before".
    for (const b of bookings) {
      if (!has(b.notes)) continue
      if (isMachineBookingNote(b.notes)) continue
      const owner = b.from_destination_id ?? b.to_destination_id
      if (owner !== dest.id) continue
      notes.push({
        id: `booking:${b.id}`,
        kind: "booking",
        body: b.notes.trim(),
        context: b.mode ? b.mode.replace(/_/g, " ") : "Travel",
        date: null,
        authorName: null,
        authorAvatar: null,
        authorId: null,
        createdAt: null,
        sourceId: b.id,
      })
    }

    notes.sort(sortNotes)
    if (notes.length) {
      groups.push({
        destId: dest.id,
        destLabel: dest.label,
        dateRange: dest.dateRange,
        startDate: dest.startDate,
        notes,
      })
    }
  }

  // Anything whose parent stop is gone. Without this bucket a note silently
  // disappears when its destination is deleted, which is the worst outcome for
  // a surface whose whole promise is "everything you wrote is here".
  const orphans: TripNote[] = []
  for (const s of steps) {
    if (!has(s.notes)) continue
    if (isMachineWritten(s)) continue
    if (destIds.has(s.id)) continue // a destination row, handled above
    if (s.parent_step_id && destIds.has(s.parent_step_id)) continue // already grouped
    orphans.push({
      id: s.id,
      kind: s.step_type === "note" ? "note" : "annotation",
      body: s.notes.trim(),
      context: s.step_type === "note" ? "Day note" : humanize(s),
      date: s.date ?? null,
      ...author(s.step_type === "note" ? s.author_id : null),
      authorId: s.step_type === "note" ? s.author_id : null,
      createdAt: s.created_at,
      sourceId: s.id,
    })
  }
  if (orphans.length) {
    orphans.sort(sortNotes)
    groups.push({
      destId: null,
      destLabel: "Other notes",
      dateRange: null,
      startDate: null,
      notes: orphans,
    })
  }

  return groups
}

/** By day, then oldest-first within a day — notes between travel buddies read
 *  as a conversation, so chronological is the correct direction. */
function sortNotes(a: TripNote, b: TripNote): number {
  const ad = a.date ?? "9999-99-99"
  const bd = b.date ?? "9999-99-99"
  if (ad !== bd) return ad < bd ? -1 : 1
  const ac = a.createdAt ?? ""
  const bc = b.createdAt ?? ""
  return ac < bc ? -1 : ac > bc ? 1 : 0
}

export function countTripNotes(groups: TripNoteGroup[]): number {
  return groups.reduce((n, g) => n + g.notes.length, 0)
}
