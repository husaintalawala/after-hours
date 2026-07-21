"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

// 1:1 web port of the iOS AuthView (Views/AuthView.swift): dark amber-tinted
// glass card, lowercase "drift" wordmark, email → magic link, coral→gold
// gradient Continue, "or continue with" + three cream social squares
// (Google / Apple / X), and the "Check your inbox" state with Open Mail +
// Resend. The iOS card floats over the onboarding globe — the dark backdrop
// here is the globe's placeholder until the web globe ships.
//
// Exact iOS colors: amber #E0563B, amberDark rgb(191,120,10), title cream
// rgb(250,245,235), subtitle rgb(235,224,209)/.85, input white/8, social
// squares rgb(245,240,230), glyphs near-black rgb(20,20,20).

const AMBER = "#E0563B"
const AMBER_DARK = "rgb(191,120,10)"
const TITLE = "rgb(250,245,235)"
const SUBTITLE = "rgba(235,224,209,0.85)"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  // Surface auth-callback failures (?error=...) — a silent bounce back to
  // this page is exactly what reads as "login got stuck".
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const e = p.get("error")
    if (e) setError(decodeURIComponent(e))
  }, [])

  // IMPORTANT: no query params on redirectTo — Supabase matches redirect
  // URLs against the allow-list and a `?next=` variant can fail the match,
  // silently falling back to the Site URL (the "stuck" Google login).
  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : undefined

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || busy) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  async function resend() {
    setResending(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    })
    setResending(false)
    if (error) setError(error.message)
  }

  async function oauth(provider: "google" | "apple" | "twitter") {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    })
    if (error) setError(error.message)
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10 font-drift-body"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 0%, #1a1410 0%, #0c0a08 55%, #060505 100%)",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap"
        rel="stylesheet"
      />

      {/* Amber-tinted dark glass card (iOS AuthCardSurface) */}
      <div
        className="w-full max-w-md rounded-[28px] border px-6 pb-8 pt-4 backdrop-blur-xl"
        style={{
          background: "rgba(24,19,15,0.88)",
          borderColor: "rgba(224,86,59,0.28)",
          boxShadow: "0 12px 48px rgba(0,0,0,0.55)",
          color: TITLE,
        }}
      >
        {sent ? (
          <SentState
            email={email}
            resending={resending}
            onBack={() => setSent(false)}
            onResend={resend}
          />
        ) : (
          <>
            {/* Close — back to the marketing site (iOS: card dismiss) */}
            <div className="flex justify-end">
              <a
                href="/"
                aria-label="Close"
                className="p-2 text-xl leading-none"
                style={{ color: "rgba(250,245,235,0.8)" }}
              >
                ✕
              </a>
            </div>

            <p
              className="text-center font-drift-display text-[46px] leading-none"
              style={{ color: AMBER }}
            >
              drift
            </p>

            <p className="mt-5 text-center text-[22px] font-semibold">
              Log in or sign up
            </p>

            <form onSubmit={sendMagicLink} className="mt-6">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                className="w-full rounded-xl border px-4 py-3.5 text-[16px] outline-none transition-colors placeholder:text-[rgba(250,245,235,0.5)]"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  borderColor: "rgba(255,255,255,0.15)",
                  color: TITLE,
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(224,86,59,0.7)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)")
                }
              />

              {error && (
                <p className="mt-2 text-[12px]" style={{ color: "rgba(255,99,88,0.9)" }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="mt-4 h-[52px] w-full rounded-full text-[17px] font-semibold text-white disabled:opacity-60"
                style={{
                  background: `linear-gradient(135deg, ${AMBER}, ${AMBER_DARK})`,
                }}
              >
                {busy ? "Sending…" : "Continue"}
              </button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.15)" }} />
              <span
                className="text-[11px] font-medium uppercase tracking-wide"
                style={{ color: SUBTITLE }}
              >
                or continue with
              </span>
              <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.15)" }} />
            </div>

            {/* Social squares — cream, like iOS */}
            <div className="grid grid-cols-3 gap-3">
              <SocialButton label="Continue with Google" onClick={() => oauth("google")}>
                <GoogleG />
              </SocialButton>
              <SocialButton label="Continue with Apple" onClick={() => oauth("apple")}>
                <AppleLogo />
              </SocialButton>
              <SocialButton label="Continue with X" onClick={() => oauth("twitter")}>
                <span
                  className="text-[24px] font-black leading-none"
                  style={{ color: "rgb(20,20,20)" }}
                >
                  𝕏
                </span>
              </SocialButton>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

function SentState({
  email,
  resending,
  onBack,
  onResend,
}: {
  email: string
  resending: boolean
  onBack: () => void
  onResend: () => void
}) {
  return (
    <div className="pt-2">
      <button
        onClick={onBack}
        aria-label="Back"
        className="p-2 text-lg"
        style={{ color: "rgba(250,245,235,0.8)" }}
      >
        ‹
      </button>

      <div className="mt-2 text-center">
        <div className="text-[52px]" style={{ color: AMBER }}>
          ✉
        </div>
        <p className="mt-3 font-drift-display text-[24px] font-semibold">
          Check your inbox
        </p>
        <p className="mt-2 whitespace-pre-line text-[14px]" style={{ color: SUBTITLE }}>
          {"We sent a one-tap sign-in link to\n" + email}
        </p>

        <a
          href="https://mail.google.com"
          target="_blank"
          rel="noreferrer"
          className="mt-6 flex h-[52px] w-full items-center justify-center rounded-full text-[17px] font-bold text-white"
          style={{ background: `linear-gradient(135deg, ${AMBER}, ${AMBER_DARK})` }}
        >
          Open Mail
        </a>

        <button
          onClick={onResend}
          disabled={resending}
          className="mt-4 text-[14px] font-medium disabled:opacity-60"
          style={{ color: AMBER }}
        >
          {resending ? "Sending…" : "Resend link"}
        </button>

        <p className="mt-4 text-[12px]" style={{ color: SUBTITLE }}>
          Check your spam folder if you don&apos;t see it.
        </p>
      </div>
    </div>
  )
}

function SocialButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-14 items-center justify-center rounded-2xl transition-transform active:scale-95"
      style={{ background: "rgb(245,240,230)" }}
    >
      {children}
    </button>
  )
}

function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.86c2.26-2.08 3.58-5.15 3.58-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.86-3c-1.07.72-2.44 1.15-4.08 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28v-3.1H1.29a12 12 0 0 0 0 10.76l3.98-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.76c1.76 0 3.34.6 4.59 1.8l3.43-3.43C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.29 6.62l3.98 3.1C6.22 6.87 8.87 4.76 12 4.76z"
      />
    </svg>
  )
}

function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="rgb(20,20,20)">
      <path d="M17.05 12.04c-.03-2.6 2.13-3.85 2.22-3.91-1.21-1.77-3.1-2.01-3.77-2.04-1.6-.16-3.13.94-3.94.94-.81 0-2.07-.92-3.4-.89-1.75.03-3.36 1.02-4.26 2.58-1.82 3.16-.47 7.84 1.31 10.41.87 1.26 1.9 2.67 3.26 2.62 1.31-.05 1.8-.85 3.39-.85 1.58 0 2.03.85 3.41.82 1.41-.02 2.3-1.28 3.16-2.55.99-1.46 1.4-2.87 1.42-2.94-.03-.01-2.73-1.05-2.76-4.16zM14.5 4.6c.72-.87 1.2-2.08 1.07-3.28-1.03.04-2.28.69-3.02 1.56-.66.77-1.24 2-1.09 3.18 1.15.09 2.32-.59 3.04-1.46z" />
    </svg>
  )
}
