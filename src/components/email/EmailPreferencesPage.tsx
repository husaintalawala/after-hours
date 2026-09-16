"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import EmailPreferenceSwitches from "./EmailPreferenceSwitches"
import { postPrefs, useEmailPreferences } from "./useEmailPreferences"
import {
  describeLoadError,
  describeSaved,
  describeSaveError,
  EMAIL_CATEGORIES,
  everyCategory,
  INVALID_LINK_COPY,
  readToken,
  SECURITY_EMAIL_NOTE,
  type EmailCategory,
  type EmailPrefsResponse,
} from "@/lib/drift/emailPreferences"

// The page every optional Drift email's footer links to — "Unsubscribe" and
// "Email preferences" both land here. No sign-in: the signed link in the URL is
// what identifies the address, because making someone log in to stop an email
// is exactly what anti-spam law forbids.
//
// THE LINK LEAVES THE ADDRESS BAR as soon as the page has it. It is a key — it
// can change what Drift sends that person — and a URL is the least private
// place to keep one: history, screenshots, and every analytics script on the
// page stamps the current URL onto what it sends. It moves to sessionStorage,
// so a reload in the same tab still works and nothing outlives the tab.

const ROUTE = "/api/email/preferences"
const TOKEN_KEY = "drift.emailPrefsToken"
const PRIVACY_URL = "https://after-hours.app/drift/privacy.html"
const TERMS_URL = "https://after-hours.app/drift/terms.html"

type Phase = "loading" | "ready" | "invalid" | "missing" | "unavailable"

export default function EmailPreferencesPage({
  token: linkToken,
  linkMalformed,
  initial,
}: {
  /** The token from the URL, already shape-checked; null when there was none. */
  token: string | null
  /** The URL carried a `t` that is not token-shaped — a link cut short. */
  linkMalformed: boolean
  /** The server's first look, when it had a verdict worth rendering. */
  initial: EmailPrefsResponse | null
}) {
  const ready = !!(initial?.ok && initial.subscribed)
  const [token, setToken] = useState<string | null>(linkToken)
  const [masked, setMasked] = useState<string | null>(initial?.masked ?? null)
  const [phase, setPhase] = useState<Phase>(
    linkMalformed || initial?.code === "invalid_token" ? "invalid" : ready ? "ready" : "loading"
  )
  const [loadError, setLoadError] = useState<string | null>(null)
  const prefs = useEmailPreferences(ready ? initial!.subscribed : null)

  useEffect(() => {
    if (linkToken || linkMalformed) {
      window.history.replaceState(null, "", window.location.pathname)
    }
    if (linkMalformed || initial?.code === "invalid_token") {
      forgetToken()
      return
    }
    let t = linkToken
    try {
      if (t) sessionStorage.setItem(TOKEN_KEY, t)
      else t = readToken(sessionStorage.getItem(TOKEN_KEY))
    } catch {
      /* storage blocked — the link in hand still works for this visit */
    }
    if (!t) {
      setPhase("missing")
      return
    }
    setToken(t)
    if (!ready) void load(t)
    // Once, on arrival: this effect is what moves the link out of the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load(t: string) {
    setPhase("loading")
    setLoadError(null)
    const res = await postPrefs(ROUTE, { t, action: "get" })
    if (res.ok && res.subscribed) {
      prefs.setSubscribed(res.subscribed)
      setMasked(res.masked)
      setPhase("ready")
    } else if (res.code === "invalid_token") {
      forgetToken()
      setPhase("invalid")
    } else {
      setLoadError(describeLoadError(res.code))
      setPhase("unavailable")
    }
  }

  function toggle(category: EmailCategory, on: boolean) {
    if (!token || !prefs.subscribed) return
    void prefs.change({
      next: { ...prefs.subscribed, [category]: on },
      // Only the switch that changed: the others on screen may be out of date.
      request: () => postPrefs(ROUTE, { t: token, action: "set", subscribed: { [category]: on } }),
      reload: () => postPrefs(ROUTE, { t: token, action: "get" }),
      saved: describeSaved({ category, on }),
      failed: (code, reloaded) => describeSaveError(code, { category, on }, reloaded),
    })
  }

  function setAll(on: boolean) {
    if (!token) return
    const action = on ? "resubscribe_all" : "unsubscribe_all"
    void prefs.change({
      next: everyCategory(on),
      request: () => postPrefs(ROUTE, { t: token, action }),
      reload: () => postPrefs(ROUTE, { t: token, action: "get" }),
      saved: describeSaved(action),
      failed: (code, reloaded) => describeSaveError(code, "all", reloaded),
    })
  }

  const subscribed = prefs.subscribed
  const anyOn = !!subscribed && EMAIL_CATEGORIES.some((c) => subscribed[c])

  return (
    <>
      <a href="/" className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-aurora-teal">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/drift-logo.png" alt="" width={40} height={40} className="h-10 w-10 rounded-xl" />
        <span className="font-drift-display text-[20px] font-semibold">Drift</span>
      </a>

      <h1 className="mt-8 font-drift-display text-[32px] font-bold leading-tight">Email preferences</h1>

      {/* One live region, mounted from the first render and never replaced — a
          region inserted together with its text is generally not announced.
          Failures are left to the alert below, which announces itself. */}
      <p className="sr-only" role="status" aria-live="polite">
        {phase === "loading" ? "Loading your email preferences." : prefs.announcement}
      </p>

      {phase === "loading" && (
        <p className="mt-4 text-[15px] text-aurora-ink2">Loading your email preferences&hellip;</p>
      )}

      {phase === "ready" && subscribed && (
        <>
          <p className="mt-3 text-[15px] text-aurora-ink2">
            Choose which emails Drift sends
            {masked ? (
              <>
                {" "}
                to <span className="font-semibold text-aurora-ink">{masked}</span>
              </>
            ) : (
              " you"
            )}
            . Changes apply to every email from now on.
          </p>

          <section
            aria-label="Emails you can turn off"
            aria-busy={prefs.busy}
            className="mt-6 overflow-hidden rounded-2xl border border-aurora-border bg-aurora-glass"
          >
            <EmailPreferenceSwitches subscribed={subscribed} busy={prefs.busy} onToggle={toggle} />
          </section>

          {/* One button whose job flips, not two that come and go: the pressed
              control stays where it is, so keyboard focus is not dropped. */}
          <div className="mt-5">
            <button
              type="button"
              aria-disabled={prefs.busy || undefined}
              onClick={() => {
                if (!prefs.busy) setAll(!anyOn)
              }}
              className={`min-h-[44px] rounded-full px-5 py-2.5 text-[14px] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aurora-teal aria-disabled:cursor-wait ${
                anyOn
                  ? "bg-aurora-teal/15 text-aurora-teal hover:bg-aurora-teal/25"
                  : "bg-aurora-glass text-aurora-ink2 hover:text-aurora-ink"
              }`}
            >
              {anyOn ? "Unsubscribe from all" : "Resubscribe to all"}
            </button>
            {/* Visible only — the region above does the announcing. */}
            <p className="mt-3 min-h-[20px] text-[13.5px] text-aurora-ink2">
              {prefs.busy ? "Saving…" : prefs.announcement}
            </p>
          </div>

          {prefs.error && <ErrorNote>{prefs.error}</ErrorNote>}

          <p className="mt-6 rounded-xl bg-aurora-midnight2 px-4 py-3 text-[13px] text-aurora-ink3">
            {SECURITY_EMAIL_NOTE}
          </p>
        </>
      )}

      {phase === "invalid" && (
        <>
          <ErrorNote>{INVALID_LINK_COPY}</ErrorNote>
          <SignInHint />
        </>
      )}

      {phase === "missing" && (
        <>
          <p className="mt-4 text-[15px] text-aurora-ink2">
            This page opens from a link in a Drift email. Use Unsubscribe or Email preferences at the bottom of
            any Drift email and you&rsquo;ll land back here with your choices.
          </p>
          <SignInHint />
        </>
      )}

      {phase === "unavailable" && (
        <>
          <ErrorNote>{loadError}</ErrorNote>
          <button
            type="button"
            onClick={() => token && void load(token)}
            className="mt-4 min-h-[44px] rounded-full bg-aurora-teal/15 px-5 py-2.5 text-[14px] font-bold text-aurora-teal transition-colors hover:bg-aurora-teal/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aurora-teal"
          >
            Try again
          </button>
        </>
      )}

      <nav aria-label="Legal" className="mt-10 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-aurora-ink3">
        <a href={PRIVACY_URL} className="inline-flex min-h-[44px] items-center hover:text-aurora-ink2 hover:underline">
          Privacy
        </a>
        <a href={TERMS_URL} className="inline-flex min-h-[44px] items-center hover:text-aurora-ink2 hover:underline">
          Terms
        </a>
      </nav>
    </>
  )
}

function forgetToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* nothing stored, or storage blocked */
  }
}

function SignInHint() {
  return (
    <p className="mt-5 text-[14px] text-aurora-ink2">
      Have a Drift account?{" "}
      <Link href="/app/settings" className="font-semibold text-aurora-teal hover:underline">
        Sign in and open Settings
      </Link>{" "}
      to choose your emails there.
    </p>
  )
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-4 rounded-xl bg-aurora-danger-soft px-3.5 py-2.5 text-[13.5px] font-medium text-aurora-danger">
      {children}
    </p>
  )
}
