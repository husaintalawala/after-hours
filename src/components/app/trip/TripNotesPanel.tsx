"use client"

import { useState } from "react"
import type { TripNote, TripNoteGroup } from "@/lib/drift/tripNotes"

// Every note in the trip, in one place, grouped by stop in itinerary order.
//
// Read-only on purpose — see the header of src/lib/drift/tripNotes.ts. Editing
// stays in the step inspector, which already works; this is the surface that
// answers "what did we all write down about this trip".
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
  groups,
  total,
  onClose,
}: {
  groups: TripNoteGroup[]
  total: number
  onClose: () => void
}) {
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
            </section>
          ))
        )}
      </div>
    </div>
  )
}

function NoteRow({ note }: { note: TripNote }) {
  const [expanded, setExpanded] = useState(false)
  // Notes have no length cap anywhere in the product, so a long one has to be
  // clamped or a 30-note trip becomes a wall of text.
  const long = note.body.length > 220

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

      <p
        className={`mt-1.5 whitespace-pre-wrap text-[14px] leading-snug ${
          long && !expanded ? "line-clamp-4" : ""
        }`}
      >
        {note.body}
      </p>
      {long && (
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
