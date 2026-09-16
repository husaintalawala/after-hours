"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import EmailPreferenceSwitches from "@/components/email/EmailPreferenceSwitches"
import { postPrefs, useEmailPreferences } from "@/components/email/useEmailPreferences"
import {
  describeLoadError,
  describeSaved,
  describeSaveError,
  SECURITY_EMAIL_NOTE,
  type EmailCategory,
} from "@/lib/drift/emailPreferences"

// Settings › Email — the same four switches as the page every email footer
// links to, for the signed-in person's own address. It goes through
// /api/drift/email-preferences, which forwards their JWT; the edge function
// looks the address up from that, so nothing here names one.
//
// The switches are one record whichever door is used: turning trip invitations
// off here is the same opt-out the email's Unsubscribe link writes.

const ROUTE = "/api/drift/email-preferences"

type Phase = "loading" | "ready" | "failed"

export default function EmailPreferencesSection() {
  const [phase, setPhase] = useState<Phase>("loading")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const prefs = useEmailPreferences(null)

  async function load() {
    setPhase("loading")
    setLoadError(null)
    const res = await postPrefs(ROUTE, { action: "session_get" })
    if (res.ok && res.subscribed) {
      prefs.setSubscribed(res.subscribed)
      setPhase("ready")
    } else {
      setExpired(res.code === "unauthorized")
      setLoadError(describeLoadError(res.code))
      setPhase("failed")
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function toggle(category: EmailCategory, on: boolean) {
    if (!prefs.subscribed) return
    const res = await prefs.change({
      next: { ...prefs.subscribed, [category]: on },
      // Only the switch that changed: the others on screen may be out of date.
      request: () => postPrefs(ROUTE, { action: "session_set", subscribed: { [category]: on } }),
      reload: () => postPrefs(ROUTE, { action: "session_get" }),
      saved: describeSaved({ category, on }),
      failed: (code, reloaded) => describeSaveError(code, { category, on }, reloaded),
    })
    if (res && !res.ok) setExpired(res.code === "unauthorized")
  }

  return (
    <>
      {/* One live region, mounted from the first render and never replaced. */}
      <p className="sr-only" role="status" aria-live="polite">
        {phase === "loading" ? "Loading your email preferences." : prefs.announcement}
      </p>

      <section
        aria-label="Email preferences"
        aria-busy={phase === "loading" || prefs.busy}
        className="overflow-hidden rounded-2xl border border-aurora-border bg-aurora-glass"
      >
        {phase === "loading" && (
          <p className="px-5 py-4 text-[14px] text-aurora-ink2">Loading your email preferences&hellip;</p>
        )}

        {phase === "ready" && prefs.subscribed && (
          <EmailPreferenceSwitches subscribed={prefs.subscribed} busy={prefs.busy} onToggle={(c, on) => void toggle(c, on)} />
        )}

        {phase === "failed" && (
          <div className="px-5 py-4">
            <p role="alert" className="text-[13.5px] font-medium text-aurora-danger">
              {loadError}
            </p>
            {expired ? (
              <Link
                href="/app/login"
                className="mt-3 inline-flex min-h-[44px] items-center rounded-full bg-aurora-midnight2 px-5 text-[13.5px] font-semibold text-aurora-ink2 transition-colors hover:text-aurora-ink"
              >
                Sign in again
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 min-h-[44px] rounded-full bg-aurora-teal/15 px-5 text-[13.5px] font-bold text-aurora-teal transition-colors hover:bg-aurora-teal/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aurora-teal"
              >
                Try again
              </button>
            )}
          </div>
        )}
      </section>

      {prefs.error && (
        <p role="alert" className="mt-2 rounded-xl bg-aurora-danger-soft px-3.5 py-2.5 text-[13px] font-medium text-aurora-danger">
          {prefs.error}
        </p>
      )}
      {expired && phase === "ready" && (
        <Link
          href="/app/login"
          className="mt-2 inline-flex min-h-[44px] items-center rounded-full bg-aurora-glass px-5 text-[13.5px] font-semibold text-aurora-ink2 transition-colors hover:text-aurora-ink"
        >
          Sign in again
        </Link>
      )}
      <p className="mt-2 px-1 text-[12px] text-drift-muted">{SECURITY_EMAIL_NOTE}</p>
    </>
  )
}
