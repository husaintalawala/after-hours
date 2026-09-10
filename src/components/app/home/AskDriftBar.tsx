"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

// The persistent "Ask Drift anything…" composer, pinned above the dock.
//
// It is the one control on this page that is always reachable no matter how far
// the reader has scrolled, which is the argument for it being fixed rather than
// a section: every other band answers "here is something we made for you", and
// this one answers "ask for something we didn't".

export default function AskDriftBar() {
  const router = useRouter()
  const [q, setQ] = useState("")

  // `?ask=`, NOT a new parameter of this component's own invention. The trip
  // page already carries a typed question into TripChat exactly this way
  // (trips/[id] reads `ask` and hands it down as `prefill`), so the home uses
  // the same name and the same prop and there is one convention rather than
  // two that do the same job.
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = q.trim()
    router.push(text ? `/app/chats?ask=${encodeURIComponent(text)}` : "/app/chats")
  }

  return (
    // FIXED, and offset by exactly the dock's own height —
    // `calc(4rem+env(safe-area-inset-bottom))` is the same expression the
    // protected layout pads its children by, so the bar sits on top of the dock
    // rather than guessing at a gap. Desktop has no bottom dock (it uses the
    // left rail), so the offset collapses and the bar sits above the viewport
    // edge with its own margin.
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 px-4 pb-3 lg:bottom-0 lg:pl-[92px] lg:pr-6 lg:pb-5">
      <form
        onSubmit={submit}
        className="pointer-events-auto mx-auto flex max-w-2xl items-center gap-2 rounded-full border border-aurora-border bg-aurora-glass/95 py-2 pl-4 pr-2 shadow-[0_6px_28px_rgba(0,0,0,0.4)] backdrop-blur-xl lg:mx-0 lg:max-w-[440px]"
      >
        {/* Teal→indigo is the app's AI gradient; this is the one mark on the
            home that says the thing on the other end is Drift and not a search
            box. */}
        <span
          aria-hidden
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-aurora-ai"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="#04231F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
          </svg>
        </span>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask Drift anything…"
          aria-label="Ask Drift anything"
          // font-drift-body, not the display serif: this is somewhere to type,
          // and a serif input reads as a pull-quote.
          className="min-w-0 flex-1 bg-transparent font-drift-body text-[14px] text-aurora-ink outline-none placeholder:text-aurora-ink3"
        />

        <button
          type="submit"
          aria-label="Send to Drift"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-b from-aurora-teal to-aurora-teal-end text-aurora-teal-ink outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-aurora-ink/70 active:scale-95"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h13M12 5l7 7-7 7" />
          </svg>
        </button>
      </form>
    </div>
  )
}
