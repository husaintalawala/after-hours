"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { splitNoteURL, isMapsURL, type TripNote, type TripNoteGroup } from "@/lib/drift/tripNotes"

// Every note in the trip, in one place, grouped by stop in itinerary order.
//
// Reads every note and can ADD one per stop. It does not EDIT existing notes —
// see the header of src/lib/drift/tripNotes.ts for why an in-place edit would
// desync the preview iOS falls back to.
//
// Note that two of the three note kinds shown here have NEVER been visible on
// web before: authored day notes (step_type='note') are dropped by the day
// timeline's mapStepType, and a destination's own note is explicitly skipped
// when steps are turned into inspector rows. So this is not purely a rollup of
// things already on screen — for those it is the first time they appear at all.

const KIND_ICON: Record<TripNote["kind"], string> = {
  note: "🗒️",
  annotation: "📍",
  booking: "🎫",
}

export default function TripNotesPanel({
  tripId,
  groups,
  total,
  canWrite,
  onClose,
}: {
  tripId: string
  groups: TripNoteGroup[]
  total: number
  canWrite: boolean
  onClose: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  return (
    // z-[60] to clear the app dock (AppNav is z-50 and renders later in the
    // DOM, so at equal z it paints over this). dvh because iOS Safari's `vh`
    // is the toolbar-hidden viewport and overshoots the real one.
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-[24px] border border-aurora-border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-[24px] sm:pb-5"
        style={{ background: "rgba(16,34,47,0.98)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Trip notes"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-drift-display text-[22px] font-semibold">Notes</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full px-2 py-1 text-[20px] leading-none text-drift-muted hover:text-drift-ink"
          >
            ×
          </button>
        </div>
        <p className="mt-1 text-[12.5px] text-drift-muted">
          {total === 1 ? "1 note across this trip" : `${total} notes across this trip`}
        </p>

        {error && (
          <p
            className="mt-3 rounded-xl border px-3 py-2 text-[13px]"
            style={{ borderColor: "rgba(255,99,88,0.35)", color: "rgba(255,140,130,0.95)" }}
          >
            {error}
          </p>
        )}

        {groups.length === 0 ? (
          <div className="mt-8 rounded-2xl bg-drift-alt-bg p-6 text-center">
            <p className="text-[15px] font-semibold">No notes yet</p>
            <p className="mt-1.5 text-[13px] text-drift-muted">
              Notes you add to a day or a place show up here, all together.
            </p>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.destId ?? "orphans"} className="mt-6">
              <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
                <h3 className="truncate text-[13px] font-bold uppercase tracking-wider text-drift-muted">
                  {g.destLabel}
                </h3>
                {g.dateRange && (
                  <span className="shrink-0 text-[11.5px] text-drift-text-tertiary">{g.dateRange}</span>
                )}
              </div>
              <ul className="space-y-2">
                {g.notes.map((n) => (
                  <NoteRow key={n.id} note={n} />
                ))}
              </ul>
              {/* No composer on the synthetic bucket — its id is the string
                  "unassigned", not a uuid, so an insert there is a 22P02. */}
              {canWrite && g.destId && (
                <AddNote tripId={tripId} destId={g.destId} date={g.startDate} onError={setError} />
              )}
            </section>
          ))
        )}
      </div>
    </div>
  )
}

function NoteRow({ note }: { note: TripNote }) {
  const [expanded, setExpanded] = useState(false)
  const { text, url } = splitNoteURL(note.body)
  // Notes have no length cap anywhere in the product, so a long one has to be
  // clamped or a 30-note trip becomes a wall of text. Measured on the TEXT, not
  // the raw body — a short remark with a long URL is not a long note.
  const long = text.length > 220

  return (
    <li className="rounded-xl bg-drift-alt-bg px-3.5 py-3">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-[13px]">
          {KIND_ICON[note.kind]}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-drift-muted">
          {note.context}
        </span>
        {note.date && (
          <span className="shrink-0 text-[11.5px] text-drift-text-tertiary">{shortDay(note.date)}</span>
        )}
      </div>

      {/* A note is very often JUST a pasted Google Maps link. Rendered raw it
          is an unreadable string and not even tappable — which is exactly what
          the trip screenshot showed. Split the first URL out and render it as a
          chip, matching the iOS parser (DestinationDaysView.parseNote) so the
          same note looks the same on both platforms. */}
      {text && (
        <p
          className={`mt-1.5 whitespace-pre-wrap text-[14px] leading-snug ${
            long && !expanded ? "line-clamp-4" : ""
          }`}
        >
          {text}
        </p>
      )}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
          style={{ background: "rgba(55,214,196,0.14)", color: "#37D6C4" }}
        >
          <span aria-hidden="true">{isMapsURL(url) ? "📍" : "🔗"}</span>
          {isMapsURL(url) ? "View on Google Maps" : "Open link"}
        </a>
      )}
      {long && text && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-[12.5px] font-semibold text-aurora-teal"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}

      {/* Attribution renders only for authored day notes. Annotations carry no
          author_id at all, so the absence of an avatar is what distinguishes
          the two kinds at a glance — for free, without a badge. */}
      {note.authorName && (
        <div className="mt-2 flex items-center gap-1.5">
          {note.authorAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={note.authorAvatar} alt="" className="h-5 w-5 rounded-full object-cover" />
          ) : (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-aurora-teal/20 text-[9px] font-bold text-aurora-teal">
              {note.authorName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="text-[11.5px] text-drift-text-tertiary">{note.authorName}</span>
        </div>
      )}
    </li>
  )
}

/** yyyy-MM-dd → "Sun, Jul 12". Parsed as UTC: these are wall-clock days, and
 *  going through the browser's timezone shifts them by one. */
function shortDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return ""
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

/// Compose a new day note for one stop.
///
/// Mirrors iOS `insertNoteStep` exactly, including the two fields it is easy to
/// miss: `location_name` gets an 80-character preview of the body (iOS's
/// `noteRow` falls back to it when `notes` is absent), and `author_id` is
/// stamped — without it a web-authored note shows as authorless on the phone
/// and its own author cannot delete it there.
function AddNote({
  tripId,
  destId,
  date,
  onError,
}: {
  tripId: string
  destId: string
  date: string | null
  onError: (m: string | null) => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [saving, setSaving] = useState(false)

  async function save() {
    const body = text.trim()
    if (!body || saving) return
    setSaving(true)
    onError(null)
    try {
      const db = createClient()
      const { data: userRes } = await db.auth.getUser()
      const uid = userRes?.user?.id
      if (!uid) throw new Error("You need to be signed in to add a note.")
      await db
        .from("steps")
        .insert({
          trip_id: tripId,
          parent_step_id: destId,
          step_type: "note",
          // The stop's first day. iOS pins a note to the selected day tab; the
          // rollup has no day selection, so the stop's start is the honest
          // equivalent rather than today's date, which could fall outside the trip.
          date: date ?? new Date().toISOString().slice(0, 10),
          notes: body,
          location_name: body.slice(0, 80),
          author_id: uid,
        })
        .throwOnError()
      setText("")
      setOpen(false)
      router.refresh()
    } catch (e) {
      onError(
        (e as { message?: string })?.message ?? "Couldn't save that note. Try again in a moment."
      )
    }
    setSaving(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 w-full rounded-xl border border-dashed border-aurora-border py-2.5 text-[13px] font-semibold text-drift-muted transition-colors hover:border-aurora-teal/50 hover:text-drift-ink"
      >
        + Add a note
      </button>
    )
  }

  return (
    <div className="mt-2 rounded-xl bg-drift-alt-bg p-3">
      <textarea
        autoFocus
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Reminders, ideas, a link…"
        className="w-full resize-none rounded-lg border border-aurora-border bg-black/25 px-3 py-2 text-[14px] outline-none focus:border-aurora-teal/60"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          onClick={() => {
            setOpen(false)
            setText("")
          }}
          disabled={saving}
          className="px-2 text-[13px] font-semibold text-drift-muted"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving || !text.trim()}
          className="rounded-full px-4 py-2 text-[13px] font-semibold text-aurora-teal-ink disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #37D6C4, #22B7D4)" }}
        >
          {saving ? "Saving…" : "Save note"}
        </button>
      </div>
    </div>
  )
}
