"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

/**
 * The question, made answerable.
 *
 * "Where are we going next?" was an <h1> — the largest sentence on the page,
 * asking something the page gave you no way to say back. The reply lived three
 * cards below it as "Start a chat · Ask Drift where to go", which is the same
 * action wearing a label instead of a cursor. This is the two of them merged:
 * the headline IS the input.
 *
 * WHAT IT DOES TODAY: carries what you type to `/app/chats?ask=`, a parameter
 * that route has accepted since it was written ("a question typed somewhere
 * else and carried here"). So this is a new front door onto the existing
 * agentic chat, not a new capability — which is why it is worth shipping now
 * rather than behind the larger search work.
 *
 * WHAT IT DOES NOT DO YET: find. The designed bar also resolves keywords to
 * your trips, the guides, places and past threads, with a preview pane. That
 * needs an index across four tables and is a real build; it is deliberately not
 * faked here with a client-side filter over whatever HomeData happens to hold,
 * because a search box that silently only knows about today's trip is worse
 * than one that is honestly only an ask bar. The ⌘K affordance and the submit
 * path are shaped so find slots in above the ask row without moving anything.
 */
export default function AskBar() {
  const [value, setValue] = useState("")
  const [focused, setFocused] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // ⌘K / Ctrl-K from anywhere on the page. Deliberately not a global hotkey
  // registered on document forever — the home owns it, and it unbinds when the
  // home unmounts, so the Chats tab's own composer keeps the shortcut later.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const submit = () => {
    const q = value.trim()
    if (!q) {
      input.current?.focus()
      return
    }
    router.push(`/app/chats?ask=${encodeURIComponent(q)}`)
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      role="search"
      className={`flex h-[54px] items-center gap-3 rounded-full border bg-aurora-glass pl-5 pr-2 transition-colors lg:h-[58px] lg:pl-6 ${
        focused ? "border-aurora-teal/45" : "border-aurora-border"
      }`}
      style={{
        boxShadow: focused
          ? "0 0 0 3px rgba(55,214,196,0.14), 0 10px 30px rgba(0,0,0,0.35)"
          : "0 0 0 1px rgba(55,214,196,0.08), 0 10px 30px rgba(0,0,0,0.28)",
      }}
    >
      <input
        ref={input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label="Ask Drift where to go"
        placeholder="Where are we going next?"
        /* font-system on the INPUT itself, never the variable display face —
           InterVariable on a UIKit text field is a documented watchdog kill on
           iOS, and the same rule is cheap insurance in a web view. The serif is
           applied to the placeholder only, through the class below. */
        className="ask-bar-input min-w-0 flex-1 bg-transparent text-[16px] font-medium text-aurora-ink outline-none placeholder:font-drift-display placeholder:text-[17px] placeholder:font-light placeholder:italic placeholder:text-aurora-ink3 lg:text-[17px] lg:placeholder:text-[20px]"
      />

      {/* The hint is desktop-only because ⌘K is. */}
      <kbd className="hidden shrink-0 rounded-md border border-aurora-border px-2 py-1 font-mono text-[11px] text-aurora-ink3 lg:block">
        ⌘K
      </kbd>

      <button
        type="submit"
        aria-label="Ask Drift"
        className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-gradient-to-b from-aurora-teal to-aurora-teal-end outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-aurora-teal/60"
        style={{ boxShadow: "0 0 22px rgba(55,214,196,0.28)" }}
      >
        {/* The paper plane, which until now was a SECOND Drift logo sitting in
            the header three centimetres from the one in the rail. Same glyph,
            given a job. */}
        <svg viewBox="0 0 24 24" className="h-[19px] w-[19px] fill-aurora-teal-ink">
          <path d="M21.5 2.5 2.8 10.2c-.8.3-.8 1.4 0 1.7l7.2 2.6 2.6 7.2c.3.8 1.4.8 1.7 0L21.5 2.5z" />
        </svg>
      </button>
    </form>
  )
}
