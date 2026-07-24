"use client"

import { useState } from "react"
import TripChat from "@/components/app/chat/TripChat"

interface DestinationLite {
  id: string
  date: string
  nights: number
  label: string
}

// Mobile trip-scoped chat dock (iOS parity): a slim composer pinned just above
// the bottom nav, present anywhere in the trip. Submitting opens the trip's chat
// full-screen with the message already sent. Desktop keeps the right-hand
// Ask Drift panel, so this is lg:hidden.
export default function TripDockComposer({
  tripId,
  tripTitle,
  tripStart,
  country,
  destinations,
}: {
  tripId: string
  tripTitle: string
  tripStart: string | null
  country: string | null
  destinations: DestinationLite[]
}) {
  const [input, setInput] = useState("")
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState<string | null>(null)

  function submit() {
    const text = input.trim()
    setInput("")
    setSent(text || null) // null → just open the thread, no auto-send
    setOpen(true)
  }

  return (
    <>
      {!open && (
        <div className="fixed inset-x-0 bottom-[calc(74px+env(safe-area-inset-bottom))] z-40 px-3 lg:hidden">
          <div className="mx-auto flex max-w-md items-center gap-2 rounded-full border border-aurora-border bg-aurora-glass/95 px-2.5 py-2 shadow-lg backdrop-blur-xl">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[15px] text-white"
              style={{ background: "linear-gradient(135deg,#37D6C4,#6B5CFF)" }}
              aria-hidden
            >
              ✦
            </span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder={`Ask Drift about ${tripTitle}…`}
              aria-label={`Ask Drift about ${tripTitle}`}
              className="h-8 min-w-0 flex-1 bg-transparent px-1 text-[14px] text-drift-ink outline-none placeholder:text-drift-text-tertiary"
            />
            <button
              onClick={submit}
              aria-label="Ask Drift"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-drift-coral text-[16px] text-white"
            >
              ↑
            </button>
          </div>
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[60] flex flex-col lg:hidden"
          style={{ background: "#08131D" }}
        >
          <div className="flex shrink-0 items-center gap-3 border-b border-aurora-border px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              onClick={() => setOpen(false)}
              aria-label="Back to trip"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-aurora-border bg-aurora-glass text-[17px] text-drift-ink"
            >
              ←
            </button>
            <div className="min-w-0">
              <p className="font-drift-display text-[17px] font-semibold leading-none">Ask Drift</p>
              <p className="mt-0.5 truncate text-[12px] text-drift-text-tertiary">{tripTitle}</p>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <TripChat
              tripId={tripId}
              tripTitle={tripTitle}
              tripStart={tripStart}
              country={country}
              destinations={destinations}
              fill
              bare
              initialSend={sent}
            />
          </div>
        </div>
      )}
    </>
  )
}
