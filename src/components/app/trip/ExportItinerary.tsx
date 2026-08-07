"use client"

import { useState } from "react"

// "Export itinerary" — the Plan-tab row directly under Find bookings, the same
// place it sits on iOS. Renders the trip to a designed multi-page PDF and hands
// it to the browser: the native share sheet where one exists (iOS/Android
// Safari + Chrome), a plain download everywhere else.
//
// All the work happens in /api/drift/itinerary-pdf — @react-pdf/renderer stays
// server-side, so this row costs the trip page nothing but its own markup.

type Phase = "idle" | "working" | "error"

export default function ExportItinerary({ tripId }: { tripId: string }) {
  const [phase, setPhase] = useState<Phase>("idle")

  async function run() {
    if (phase === "working") return
    setPhase("working")
    try {
      const res = await fetch(`/api/drift/itinerary-pdf?trip=${encodeURIComponent(tripId)}`)
      if (!res.ok) throw new Error(`export_${res.status}`)
      const blob = await res.blob()
      const name = fileNameFrom(res.headers.get("content-disposition"))

      const file = new File([blob], name, { type: "application/pdf" })
      // Share where the platform actually supports sharing a file — otherwise
      // navigator.share throws and the user gets nothing.
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: name.replace(/\.pdf$/, "") })
          setPhase("idle")
          return
        } catch (e) {
          // A dismissed share sheet is a choice, not a failure — fall through
          // to the download only if sharing genuinely errored.
          if ((e as Error)?.name === "AbortError") {
            setPhase("idle")
            return
          }
        }
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
      setPhase("idle")
    } catch {
      setPhase("error")
      setTimeout(() => setPhase("idle"), 4000)
    }
  }

  const sub =
    phase === "working"
      ? "Building your PDF…"
      : phase === "error"
        ? "Couldn't build the PDF — try again"
        : "Share a beautiful PDF"

  return (
    <button
      onClick={run}
      disabled={phase === "working"}
      className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-aurora-border bg-aurora-glass p-3.5 text-left transition-colors hover:border-aurora-teal/40 disabled:cursor-wait"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-aurora-teal/10 text-aurora-teal">
        {phase === "working" ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 3a9 9 0 1 0 9 9" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 15V3" />
            <path d="M8 7l4-4 4 4" />
            <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-drift-ink">Export itinerary</span>
        <span className="block truncate text-[12.5px] text-drift-text-tertiary">{sub}</span>
      </span>
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-drift-text-tertiary" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  )
}

/** Pull the real filename out of the response so the saved file is called
 *  "Japan 2026 — Itinerary.pdf", not "itinerary.pdf". */
function fileNameFrom(header: string | null): string {
  const star = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (star) {
    try {
      return decodeURIComponent(star)
    } catch {
      /* fall through */
    }
  }
  return header?.match(/filename="([^"]+)"/i)?.[1] ?? "Itinerary.pdf"
}
