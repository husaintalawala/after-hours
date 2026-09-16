"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import BackLink from "@/components/app/BackLink"
import { createClient } from "@/lib/supabase/client"
import { CALENDAR_SCOPE, GMAIL_SCOPE, requestGoogleAccessToken } from "@/lib/drift/google"
import { signOutAndForget } from "@/lib/drift/signOut"
import {
  describeKept,
  describeRemoved,
  plural,
  readDeleteResponse,
  RECEIPT_STORAGE_KEY,
  type DeleteResponse,
  type DeletionPreview,
  type GoogleOutcome,
  type StoredReceipt,
  type Verification,
} from "@/lib/drift/deleteAccount"

// The three steps of deleting an account, matching iOS DeleteAccountView:
//
//   review   — what happens, built from the server's own preview of THIS
//              account: what is deleted, which shared trips go to whom, what
//              the travel group keeps, what gets disconnected.
//   verify   — prove it is you: a 6-digit code emailed to the account address
//              (the email doubles as the security notice), or typing DELETE
//              for an account with no email to send one to.
//   progress — one request, staged copy, nothing to click: a full-viewport
//              layer over the app's nav, a guard on in-app links (a client-side
//              Link never fires beforeunload) and a beforeunload guard. Leaving
//              mid-request used to strand people between "not deleted" and
//              "gone".
//
// Every uncertain ending is RECONCILED before anything is said. A timeout or a
// lost response is not "your account was not deleted" — the server may have
// finished — so the page asks the ledger (status by deletion id) or, failing
// that, whether the auth server still knows this user.

type Step = "loading" | "review" | "verify" | "progress"

const STAGES = [
  "Disconnecting bank cards and sign-in providers…",
  "Handing shared trips to your travel group…",
  "Removing your trips, photos and messages…",
  "Finishing up…",
]
const STAGE_MS = 5000
const POLL_MS = 3000
const POLL_TRIES = 40

async function post(body: Record<string, string>): Promise<{ raw: unknown; res: DeleteResponse }> {
  let raw: unknown = null
  try {
    const r = await fetch("/api/drift/delete-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    raw = await r.json().catch(() => null)
  } catch {
    raw = null
  }
  // readDeleteResponse turns "no answer" into code:"network".
  return { raw, res: readDeleteResponse(raw) }
}

function formatWait(s: number): string {
  return s >= 60 ? plural(Math.ceil(s / 60), "minute") : `${s}s`
}

const GOOGLE_TOKEN_TIMEOUT_MS = 10_000

/**
 * The token the Google revoke will spend — started from the Delete click.
 *
 * Google Identity Services opens a popup even for prompt:"none", and browsers
 * allow a popup only for a few seconds after a gesture. The revoke has to wait
 * for the delete (up to a minute, or two of status polling), so minting then —
 * as revokeGoogleAccess does for the Disconnect button — is always blocked.
 * A token lives an hour, so one minted on the click outlives the delete; a
 * delete that fails just drops it. Same rules as revokeGoogleAccess otherwise:
 * never a prompt, first scope that answers wins, and revoking any one token
 * drops the whole grant.
 */
async function mintGoogleRevokeToken(email: string | null): Promise<string | null> {
  for (const scope of [GMAIL_SCOPE, CALENDAR_SCOPE]) {
    try {
      return await Promise.race([
        requestGoogleAccessToken(scope, { prompt: "none", ...(email ? { login_hint: email } : {}) }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), GOOGLE_TOKEN_TIMEOUT_MS)),
      ])
    } catch {
      /* not granted, no Google session in this browser, or the popup was blocked */
    }
  }
  return null
}

/** Spend the token revoking itself: a plain fetch, no popup. No credentials —
 *  see the note on REVOKE_ENDPOINT in lib/drift/google.ts. */
async function revokeGoogleToken(token: string): Promise<boolean> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      body: new URLSearchParams({ token }),
    })
    if (res.ok) return true
    // invalid_token: already revoked or expired — the grant is gone either way.
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    return body?.error === "invalid_token"
  } catch {
    return false
  }
}

export default function DeleteAccountFlow({
  email,
  googleConnected,
}: {
  /** login_hint for the silent Google revoke. */
  email: string | null
  /** Decided by the page BEFORE anything is deleted — see its comment. */
  googleConnected: boolean
}) {
  const [step, setStep] = useState<Step>("loading")
  const [preview, setPreview] = useState<DeletionPreview | null>(null)
  const [verification, setVerification] = useState<Verification | null>(null)
  const [emailHint, setEmailHint] = useState<string | null>(null)
  const [deletionId, setDeletionId] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [phrase, setPhrase] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(0)
  const [stage, setStage] = useState(0)
  const [stageOverride, setStageOverride] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  // Set just before the hard navigation away, so the unload guard lets it go.
  const leaving = useRef(false)
  // Started on the Delete click, spent after the delete — see mintGoogleRevokeToken.
  const googleToken = useRef<Promise<string | null> | null>(null)

  async function loadPreview() {
    setError(null)
    const { res } = await post({ mode: "preview" })
    if (!res.ok || !res.preview) {
      setError(res.error ?? "We couldn’t load your account details. Nothing has been deleted — please try again.")
      return
    }
    setPreview(res.preview)
    setVerification(res.verification)
    setEmailHint(res.emailHint)
    setStep("review")
  }

  useEffect(() => {
    void loadPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Each step replaces the page's content, so focus follows the heading —
  // otherwise a screen reader is left on a button that no longer exists.
  useEffect(() => {
    if (step !== "loading") headingRef.current?.focus()
  }, [step])

  // Resend countdown.
  useEffect(() => {
    if (resendAt <= now) return
    const t = setTimeout(() => setNow(Date.now()), 1000)
    return () => clearTimeout(t)
  }, [resendAt, now])

  useEffect(() => {
    if (step !== "progress") return
    setStage(0)
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), STAGE_MS)
    const guard = (e: BeforeUnloadEvent) => {
      if (leaving.current) return
      e.preventDefault()
      e.returnValue = ""
    }
    // The overlay covers the nav for a pointer; this catches a keyboard user
    // who tabs to a nav link behind it. Capture phase on document runs before
    // React's root listener, and Next's Link skips an event already
    // defaultPrevented. Leaving would unmount the flow mid-request: a success
    // would later yank the tab away, a failure's message would be lost.
    const blockLinks = (e: MouseEvent) => {
      if (leaving.current) return
      if (e.target instanceof Element && e.target.closest("a[href]")) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener("beforeunload", guard)
    document.addEventListener("click", blockLinks, true)
    return () => {
      clearInterval(t)
      window.removeEventListener("beforeunload", guard)
      document.removeEventListener("click", blockLinks, true)
    }
  }, [step])

  async function sendCode() {
    setSending(true)
    setSent(false)
    setError(null)
    const { res } = await post({ mode: "send_code" })
    setSending(false)
    const t = Date.now()
    setNow(t)
    if (res.ok) {
      if (res.deletionId) setDeletionId(res.deletionId)
      if (res.emailHint) setEmailHint(res.emailHint)
      setCode("")
      setSent(true)
      setResendAt(t + (res.resendAfterS ?? 30) * 1000)
      return
    }
    if (res.code === "rate_limited") {
      const wait = res.retryAfterS ?? 60
      setResendAt(t + wait * 1000)
      // Usually the ordinary 30 s gap (a reload re-sends on Continue), not
      // abuse. A code from an earlier send still works: the server checks it
      // against this account's open deletion, not an id this page holds.
      setError(
        `${res.error ?? "Please wait a moment before asking for another code."} If you already have a code, you can still use it.`
      )
      return
    }
    setError(res.error ?? "We couldn’t send the code. Check your connection and try again.")
  }

  function toVerify() {
    setError(null)
    setStep("verify")
    if (verification === "email_code" && !deletionId) void sendCode()
  }

  function backToVerify(message: string) {
    setStageOverride(null)
    setStep("verify")
    setError(message)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    // Before any await, while this click still allows Google's popup.
    googleToken.current = wantsGoogle ? mintGoogleRevokeToken(email) : null
    setError(null)
    setStep("progress")

    const body: Record<string, string> = { mode: "delete" }
    if (deletionId) body.deletion_id = deletionId
    if (verification === "email_code") body.code = code
    else body.confirm = phrase.trim()

    const { raw, res } = await post(body)
    if (res.ok) return finish(raw)

    const id = res.deletionId ?? deletionId
    switch (res.code) {
      case "in_progress":
      case "network":
      case "unauthorized":
        return reconcile(id)
      case "code_expired":
      case "too_many_attempts":
        setCode("")
        setResendAt(0)
        return backToVerify(
          res.error ??
            (res.code === "code_expired"
              ? "That code has expired. Send a new one."
              : "Too many tries with that code. Send a new one.")
        )
      case "verification_failed":
        return backToVerify(
          res.error ??
            (verification === "email_code"
              ? "That code isn’t right. Check the email and try again."
              : "Type DELETE exactly as shown to confirm.")
        )
      default:
        return backToVerify(res.error ?? "Something went wrong on our side. Please try again.")
    }
  }

  /** The request ended without a verdict. Find out what really happened. */
  async function reconcile(id: string | null) {
    if (id) return watch(id)
    // No ledger id (the DELETE-phrase path never had one): ask the auth server
    // whether this user still exists. user_not_found / session_not_found are
    // what an account whose deletion ran looks like from here.
    try {
      const { data, error: authError } = await createClient().auth.getUser()
      if (data.user) {
        return backToVerify("We couldn’t reach the server, and your account is still here. Please try again.")
      }
      const gone =
        authError?.code === "user_not_found" ||
        authError?.code === "session_not_found" ||
        authError?.status === 403 ||
        authError?.status === 404
      if (gone) return finish(null)
    } catch {
      /* fall through to "can't tell" */
    }
    backToVerify(
      "We couldn’t reach the server, so we can’t tell yet whether your account was deleted. Check your connection and try again."
    )
  }

  async function watch(id: string) {
    // `verifying` means the delete never took the lock: the server flips the
    // row to `running` before it touches anything. Seen on two answers in a row
    // — long enough for a request still in flight to get there — nothing was
    // deleted and nothing is on its way, so don't spin for two minutes and then
    // point at a receipt that will never come.
    let verifyingSeen = 0
    for (let i = 0; i < POLL_TRIES; i++) {
      await new Promise((r) => setTimeout(r, POLL_MS))
      const { raw, res } = await post({ mode: "status", deletion_id: id })
      if (!res.ok) continue
      if (res.status === "verifying") {
        if (++verifyingSeen >= 2) {
          return backToVerify("Your deletion didn’t start, and nothing was deleted. Check your connection and try again.")
        }
        continue
      }
      verifyingSeen = 0
      // incomplete / needs_attention: the account is gone and the retry job is
      // finishing the rest — the same ending as completed, as far as this person
      // is concerned.
      if (res.status === "completed" || res.status === "incomplete" || res.status === "needs_attention") {
        return finish(raw)
      }
      if (res.status === "failed") {
        return backToVerify("Something went wrong on our side and nothing was deleted. Please try again.")
      }
    }
    backToVerify("We couldn’t confirm the deletion yet. Check your email for a receipt, or try again in a minute.")
  }

  /** Deleted. Revoke Google, forget this browser, hand over the receipt. */
  async function finish(raw: unknown) {
    // Revoked after the server delete, never before: if the delete had failed,
    // the account would still exist with its Google connection silently cut.
    // The token was minted on the Delete click (mintGoogleRevokeToken) from the
    // Google session, not the Drift one, so it still works once the account is
    // gone. No token means not_revoked, and the receipt links out to Google.
    let google: GoogleOutcome = "none"
    if (wantsGoogle) {
      setStageOverride("Disconnecting Google…")
      const token = await (googleToken.current ?? Promise.resolve(null))
      google = token && (await revokeGoogleToken(token)) ? "revoked" : "not_revoked"
    }
    googleToken.current = null
    setStageOverride("Signing you out…")
    leaving.current = true
    const receipt: StoredReceipt = { response: raw, google }
    await signOutAndForget("/app/account-deleted", () => {
      try {
        sessionStorage.setItem(RECEIPT_STORAGE_KEY, JSON.stringify(receipt))
      } catch {
        /* the page still says the account is deleted, just without the detail */
      }
    })
  }

  const wantsGoogle = googleConnected || !!preview?.googleConnected
  // A code needs no deletion id: the server checks it against this account's
  // open deletion, so a reload or a rate-limited resend cannot lock out a code
  // that is already in the inbox.
  const canSubmit =
    verification === "email_code"
      ? /^\d{6}$/.test(code)
      : verification === "confirm_phrase"
        ? phrase.trim() === "DELETE"
        : false
  const waitS = Math.max(0, Math.ceil((resendAt - now) / 1000))
  const title =
    step === "verify" ? "Confirm it’s you" : step === "progress" ? "Deleting your account" : "Delete account"

  const removed = preview ? describeRemoved(preview) : []
  const kept = preview ? describeKept(preview) : null
  const connections = preview
    ? [
        googleConnected || preview.googleConnected ? "Google" : null,
        preview.plaidItems ? `${plural(preview.plaidItems, "bank card")} linked through Plaid` : null,
        preview.identities.includes("apple")
          ? "Sign in with Apple — you’ll get a link to finish removing Drift at Apple"
          : null,
      ].filter((x): x is string => !!x)
    : []

  return (
    // During progress the same tree becomes a full-viewport layer above AppRail
    // and AppNav (z-40/50) and every sheet (≤ z-[95]): "nothing to click" has
    // to include the app's own nav. One wrapper either way, so the heading
    // keeps its node and focus.
    <div
      className={step === "progress" ? "fixed inset-0 z-[100] overflow-y-auto bg-aurora-midnight" : undefined}
      role={step === "progress" ? "dialog" : undefined}
      aria-modal={step === "progress" ? true : undefined}
      aria-labelledby={step === "progress" ? "delete-account-title" : undefined}
    >
      <div className="mx-auto w-full max-w-xl px-5 pb-32 pt-8 lg:pt-12">
        {step !== "progress" && <BackLink href="/app/settings" label="Settings" className="mb-5" />}
        <h1
          id="delete-account-title"
          ref={headingRef}
          tabIndex={-1}
          className="font-drift-display text-[28px] font-bold outline-none"
        >
          {title}
        </h1>

        {step === "loading" &&
          (error ? (
            <>
              <ErrorNote>{error}</ErrorNote>
              <button
                type="button"
                onClick={() => void loadPreview()}
                className="mt-4 rounded-full bg-aurora-glass px-5 py-2.5 text-[13.5px] font-semibold text-aurora-ink2 transition-colors hover:text-aurora-ink"
              >
                Try again
              </button>
            </>
          ) : (
            <p role="status" className="mt-4 text-[14.5px] text-aurora-ink2">
              Checking what&rsquo;s on your account&hellip;
            </p>
          ))}

        {step === "review" && preview && (
          <>
            <p className="mt-3 text-[14.5px] text-aurora-ink2">
              Deleting your account is immediate and permanent. Here is exactly what happens.
            </p>

            <Section title="Deleted for good">
              <ul className="space-y-1.5 text-[14px] text-aurora-ink">
                <li>Your profile and sign-in</li>
                {removed.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </Section>

            {preview.handovers.length > 0 && (
              <Section title="Trips you share">
                <ul className="space-y-1.5 text-[14px] text-aurora-ink">
                  {preview.handovers.map((h, i) => (
                    <li key={h.tripId ?? i}>
                      <span className="font-semibold">{h.title}</span> goes to {h.toName}
                    </li>
                  ))}
                </ul>
                <p className="mt-2.5 text-[12.5px] text-aurora-ink3">
                  They become the organiser and keep the trip. Your photos, files and messages on it are removed.
                </p>
              </Section>
            )}

            {kept && (
              <Section title="Kept for your travel group">
                <p className="text-[14px] text-aurora-ink">{kept}</p>
              </Section>
            )}

            {connections.length > 0 && (
              <Section title={"Connections we’ll disconnect"}>
                <ul className="space-y-1.5 text-[14px] text-aurora-ink">
                  {connections.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </Section>
            )}

            <div className="mt-6 flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={toVerify}
                className="rounded-full bg-red-500/10 px-5 py-2.5 text-[13.5px] font-bold text-red-400 transition-colors hover:bg-red-500/20"
              >
                Continue
              </button>
              <Link
                href="/app/settings"
                className="rounded-full bg-aurora-glass px-5 py-2.5 text-[13.5px] font-semibold text-aurora-ink2 transition-colors hover:text-aurora-ink"
              >
                Keep my account
              </Link>
            </div>
          </>
        )}

        {step === "verify" && (
          <form onSubmit={submit} noValidate className="mt-3">
            {verification === "email_code" && (
              <>
                <p className="text-[14.5px] text-aurora-ink2">
                  {emailHint ? (
                    <>
                      We emailed a 6-digit code to <span className="font-semibold text-aurora-ink">{emailHint}</span>.
                    </>
                  ) : (
                    "We’re emailing a 6-digit code to your account address."
                  )}{" "}
                  It expires in 10 minutes.
                </p>
                <label
                  htmlFor="deletion-code"
                  className="mt-5 block text-[11.5px] font-bold uppercase tracking-wider text-aurora-ink3"
                >
                  Code
                </label>
                <input
                  id="deletion-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  aria-invalid={!!error}
                  aria-describedby={error ? "deletion-error" : undefined}
                  className="mt-1.5 w-44 rounded-xl border border-aurora-border bg-aurora-glass px-4 py-3 text-center font-mono text-[22px] tracking-[0.3em] text-aurora-ink outline-none focus:border-aurora-teal"
                />
                <p className="mt-2.5 min-h-[20px] text-[12.5px] text-aurora-ink3">
                  {/* Only the send is announced. The countdown re-renders every
                      second and would queue thirty announcements, and the button
                      does not belong inside a live region. */}
                  <span role="status">{sending ? "Sending a code…" : sent && waitS > 0 ? "Code sent. " : ""}</span>
                  {sending ? null : waitS > 0 ? (
                    `You can send another code in ${formatWait(waitS)}.`
                  ) : (
                    <button
                      type="button"
                      onClick={() => void sendCode()}
                      className="font-semibold text-aurora-teal hover:underline"
                    >
                      Send a new code
                    </button>
                  )}
                </p>
              </>
            )}

            {verification === "confirm_phrase" && (
              <>
                <p className="text-[14.5px] text-aurora-ink2">
                  There&rsquo;s no email address on this account to send a code to, so confirm by typing DELETE.
                </p>
                <label
                  htmlFor="deletion-phrase"
                  className="mt-5 block text-[11.5px] font-bold uppercase tracking-wider text-aurora-ink3"
                >
                  Type DELETE to confirm
                </label>
                <input
                  id="deletion-phrase"
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-invalid={!!error}
                  aria-describedby={error ? "deletion-error" : undefined}
                  className="mt-1.5 w-full max-w-xs rounded-xl border border-aurora-border bg-aurora-glass px-4 py-3 text-[15px] font-semibold tracking-wider text-aurora-ink outline-none focus:border-aurora-teal"
                />
              </>
            )}

            {verification !== "email_code" && verification !== "confirm_phrase" && (
              <p className="text-[14.5px] text-aurora-ink2">
                This account can&rsquo;t be confirmed here. Delete it from the Drift iOS app, or{" "}
                <Link href="/app/contact" className="font-semibold text-aurora-teal hover:underline">
                  contact us
                </Link>
                .
              </p>
            )}

            {error && <ErrorNote id="deletion-error">{error}</ErrorNote>}

            <div className="mt-6 flex flex-wrap gap-2.5">
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-full bg-red-500/10 px-5 py-2.5 text-[13.5px] font-bold text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-40"
              >
                Delete my account
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setStep("review")
                }}
                className="rounded-full bg-aurora-glass px-5 py-2.5 text-[13.5px] font-semibold text-aurora-ink2 transition-colors hover:text-aurora-ink"
              >
                Back
              </button>
            </div>
          </form>
        )}

        {step === "progress" && (
          <div className="mt-6 rounded-2xl border border-aurora-border bg-aurora-glass p-6">
            <div
              aria-hidden
              className="h-6 w-6 animate-spin rounded-full border-2 border-aurora-border border-t-aurora-teal motion-reduce:animate-none"
            />
            <p role="status" aria-live="polite" className="mt-4 text-[15px] font-semibold text-aurora-ink">
              {stageOverride ?? STAGES[stage]}
            </p>
            <p className="mt-1.5 text-[13px] text-aurora-ink3">
              Keep this page open &mdash; it usually takes under a minute.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 rounded-2xl border border-aurora-border bg-aurora-glass p-5">
      <h2 className="mb-2.5 text-[11.5px] font-bold uppercase tracking-wider text-aurora-ink3">{title}</h2>
      {children}
    </section>
  )
}

function ErrorNote({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-4 rounded-xl bg-red-500/10 px-3.5 py-2.5 text-[13px] font-medium text-red-400">
      {children}
    </p>
  )
}
