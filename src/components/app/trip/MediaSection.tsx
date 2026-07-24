"use client"

import { useEffect, useState } from "react"
import { listTripFiles } from "@/lib/drift/media"
import MediaTab from "./MediaTab"

// The Media (Files) entry in the Plan tab — a section-card below Find bookings
// that opens the full Files library. Files/attachments only; Track owns photos.
export default function MediaSection({ tripId }: { tripId: string }) {
  const [count, setCount] = useState<number | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    listTripFiles(tripId).then((f) => setCount(f.length))
  }, [tripId])

  const sub =
    count === null
      ? "Files, receipts & tickets"
      : count === 0
        ? "Add files, receipts & tickets"
        : `${count} ${count === 1 ? "file" : "files"}`

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-aurora-border bg-aurora-glass p-3.5 text-left transition-colors hover:border-aurora-teal/40"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-aurora-teal/10 text-aurora-teal">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-drift-ink">Media</span>
          <span className="block truncate text-[12.5px] text-drift-text-tertiary">{sub}</span>
        </span>
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-drift-text-tertiary" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex flex-col overflow-y-auto"
          style={{ background: "#08131D" }}
        >
          <div
            className="sticky top-0 z-10 flex items-center gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]"
            style={{ background: "#08131D" }}
          >
            <button
              onClick={() => setOpen(false)}
              aria-label="Back to trip"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-aurora-border bg-aurora-glass text-[17px] text-drift-ink"
            >
              ←
            </button>
          </div>
          <div className="px-5 pb-12">
            <MediaTab tripId={tripId} />
          </div>
        </div>
      )}
    </>
  )
}
