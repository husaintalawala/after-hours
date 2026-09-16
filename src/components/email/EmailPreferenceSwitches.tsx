"use client"

import { useId } from "react"
import {
  EMAIL_CATEGORIES,
  EMAIL_CATEGORY_COPY,
  type EmailCategory,
  type SubscribedMap,
} from "@/lib/drift/emailPreferences"

// The four switches, shared by the public page at /email/preferences and
// Settings › Email so the two can never describe the same letter differently.
//
// Each row is one native <button role="switch">: the whole row is the tap
// target, Space and Enter work without any key handling of our own, and a
// screen reader hears the label, the on/off state and then the description.
//
// A save in flight marks the rows aria-disabled rather than `disabled`. A
// disabled button drops keyboard focus to <body> the moment it is pressed, so
// every toggle would throw a keyboard user back to the top of the page.

export default function EmailPreferenceSwitches({
  subscribed,
  busy,
  onToggle,
}: {
  subscribed: SubscribedMap
  busy: boolean
  onToggle: (category: EmailCategory, on: boolean) => void
}) {
  const base = useId()
  return (
    <ul className="divide-y divide-aurora-border">
      {EMAIL_CATEGORIES.map((c) => {
        const on = subscribed[c]
        const labelId = `${base}-${c}-label`
        const descId = `${base}-${c}-desc`
        return (
          <li key={c}>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-labelledby={labelId}
              aria-describedby={descId}
              aria-disabled={busy || undefined}
              onClick={() => {
                if (!busy) onToggle(c, !on)
              }}
              className="flex min-h-[64px] w-full items-center justify-between gap-4 px-5 py-3.5 text-left transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-aurora-teal aria-disabled:cursor-wait"
            >
              <span className="min-w-0">
                <span id={labelId} className="block text-[15px] font-semibold text-aurora-ink">
                  {EMAIL_CATEGORY_COPY[c].label}
                </span>
                <span id={descId} className="mt-1 block text-[12.5px] leading-snug text-aurora-ink2">
                  {EMAIL_CATEGORY_COPY[c].description}
                </span>
              </span>
              <span
                aria-hidden
                className={`relative inline-flex h-[28px] w-[48px] shrink-0 items-center rounded-full border transition-colors ${
                  on ? "border-transparent bg-aurora-teal" : "border-aurora-border-strong bg-white/10"
                }`}
              >
                <span
                  className={`inline-block h-[22px] w-[22px] rounded-full shadow motion-safe:transition-transform ${
                    on ? "translate-x-[21px] bg-white" : "translate-x-[3px] bg-aurora-ink2"
                  }`}
                />
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
