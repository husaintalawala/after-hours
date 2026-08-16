"use client"

import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { AnalyticsEvent, capture } from "@/lib/analytics"

// Login card in the Aurora identity — matches the logged-in app (Deep Midnight
// ground, teal action accent), NOT the old amber/coral marketing palette. Cool
// navy backdrop, midnight glass card with a faint teal edge, teal "drift"
// wordmark, email → magic link, teal-gradient Continue (deep-teal ink), "or
// continue with" + three cream social squares (Google / Apple / X), and the
// "Check your inbox" state with Open Mail + Resend.
//
// Aurora tokens: teal #37D6C4, teal-end #22B7D4, teal-ink #04231F (on teal),
// midnight #08131D / midnight2 #0B1A25 / glass #16222F, ink #F4F8F9, ink2
// #C6D0D9. Social squares stay cream (brand-neutral for Google/Apple/X).

const TEAL = "#37D6C4"        // Aurora action accent (brand)
const TEAL_END = "#22B7D4"    // CTA gradient bottom stop
const TITLE = "#F4F8F9"       // near-white ink
const SUBTITLE = "rgba(198,208,217,0.9)" // aurora ink2 (#C6D0D9)

// Demo accounts sign in with a password instead of a magic link — the App
// Review account (Apple's reviewer can't open the emailed code) and the
// marketing capture account (a recording session never stalls on an inbox).
// Mirrors the iOS AuthView allow-list. Typing one of these exact emails reveals
// a password field; every real user stays passwordless (magic-link + OAuth).
// Passwords are typed here, never stored in the client.
const PASSWORD_DEMO_EMAILS = [
  "driftappreview001@gmail.com", // App Review
  "h.talawala+maya@gmail.com", // marketing / demo capture
]
const isDemoEmail = (v: string) =>
  PASSWORD_DEMO_EMAILS.some((x) => x.toLowerCase() === v.trim().toLowerCase())

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false) // demo-account path
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const turnstileRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  const supabase = createClient()

  // Cloudflare Turnstile — the site key is public. Captcha is now ENFORCED in
  // Supabase (Auth → Attack Protection), so a submit without a token is a hard
  // 400 (`captcha_failed`) rather than a no-op: the submit and resend buttons
  // below stay disabled until the widget hands back a token.
  const TURNSTILE_SITE_KEY =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "0x4AAAAAAD-cdaIM6leMfipc"

  useEffect(() => {
    const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
    function render() {
      const w = (window as { turnstile?: any }).turnstile
      if (!w || !turnstileRef.current || widgetIdRef.current) return
      widgetIdRef.current = w.render(turnstileRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: "dark",
        callback: (t: string) => setCaptchaToken(t),
        "expired-callback": () => setCaptchaToken(null),
        "error-callback": () => setCaptchaToken(null),
      })
    }
    if ((window as { turnstile?: any }).turnstile) { render(); return }
    if (!document.querySelector(`script[src^="${SRC.split("?")[0]}"]`)) {
      const s = document.createElement("script")
      s.src = SRC; s.async = true; s.defer = true
      document.head.appendChild(s)
    }
    const iv = setInterval(() => {
      if ((window as { turnstile?: any }).turnstile) { render(); clearInterval(iv) }
    }, 250)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function resetCaptcha() {
    const w = (window as { turnstile?: any }).turnstile
    if (w && widgetIdRef.current) { w.reset(widgetIdRef.current); setCaptchaToken(null) }
  }

  /// Guards every captcha-gated auth call. Deliberately NOT a `disabled` on the
  /// buttons: the widget 403s on any origin outside its allow-list (localhost,
  /// for one) and can be blocked by an extension or a corporate proxy, and a
  /// permanently greyed-out button with no explanation is a worse dead end than
  /// a message you can act on. Sending anyway is not an option — Supabase now
  /// rejects a tokenless request outright with a message about captcha
  /// protection that means nothing to the person reading it.
  function missingCaptcha() {
    if (captchaToken) return false
    setError("Still verifying you're human — give it a second and try again.")
    return true
  }

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
    // Demo accounts use a password, not a magic link: first submit reveals the
    // field, second submit signs in. Real users never hit this branch.
    if (isDemoEmail(email)) {
      if (!showPassword) {
        setShowPassword(true)
        setError(null)
        return
      }
      return signInWithPassword()
    }
    if (missingCaptcha()) return
    setBusy(true)
    setError(null)
    capture(AnalyticsEvent.LoginAttempt, { method: "magic_link" })
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo, captchaToken: captchaToken ?? undefined },
    })
    resetCaptcha() // Turnstile tokens are single-use
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  // Demo-account password sign-in (iOS AuthView parity). No password is stored
  // in the client — the operator types it. Full-page nav on success so the SSR
  // protected layout picks up the freshly-set session cookie.
  async function signInWithPassword() {
    if (!password || busy) return
    if (missingCaptcha()) return
    setBusy(true)
    setError(null)
    capture(AnalyticsEvent.LoginAttempt, { method: "password" })
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
      options: { captchaToken: captchaToken ?? undefined },
    })
    resetCaptcha()
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    window.location.assign("/app")
  }

  async function resend() {
    if (missingCaptcha()) return
    setResending(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo, captchaToken: captchaToken ?? undefined },
    })
    resetCaptcha()
    setResending(false)
    if (error) setError(error.message)
  }

  async function oauth(provider: "google" | "apple" | "twitter") {
    setError(null)
    // Fire before signInWithOAuth navigates away (posthog beacons on unload).
    capture(AnalyticsEvent.LoginAttempt, { method: provider })
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
          "radial-gradient(120% 90% at 50% 0%, #0B1A25 0%, #08131D 55%, #050B10 100%)",
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
          background: "rgba(16,34,47,0.92)",
          borderColor: "rgba(55,214,196,0.22)",
          boxShadow: "0 12px 48px rgba(0,0,0,0.55)",
          color: TITLE,
        }}
      >
        {sent ? (
          <SentState
            email={email}
            resending={resending}
            error={error}
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
              style={{ color: TEAL }}
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
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (showPassword && !isDemoEmail(e.target.value)) setShowPassword(false)
                }}
                placeholder="Email address"
                className="w-full rounded-xl border px-4 py-3.5 text-[16px] outline-none transition-colors placeholder:text-[rgba(250,245,235,0.5)]"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  borderColor: "rgba(255,255,255,0.15)",
                  color: TITLE,
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(55,214,196,0.7)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)")
                }
              />

              {/* Demo accounts only: password field, revealed after the first
                  Continue. Real users never see this. */}
              {showPassword && (
                <input
                  type="password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="mt-3 w-full rounded-xl border px-4 py-3.5 text-[16px] outline-none transition-colors placeholder:text-[rgba(198,208,217,0.5)]"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    borderColor: "rgba(255,255,255,0.15)",
                    color: TITLE,
                  }}
                  onFocus={(e) =>
                    (e.currentTarget.style.borderColor = "rgba(55,214,196,0.7)")
                  }
                  onBlur={(e) =>
                    (e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)")
                  }
                />
              )}

              {error && (
                <p className="mt-2 text-[12px]" style={{ color: "rgba(255,99,88,0.9)" }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="mt-4 h-[52px] w-full rounded-full text-[17px] font-semibold text-aurora-teal-ink disabled:opacity-60"
                style={{
                  background: `linear-gradient(135deg, ${TEAL}, ${TEAL_END})`,
                }}
              >
                {showPassword
                  ? busy
                    ? "Signing in…"
                    : "Sign in"
                  : busy
                    ? "Sending…"
                    : "Continue"}
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

            {/* The only way to reach us for someone who can't get in — the
                rest of the app is behind this screen. Mirrors iOS AuthView. */}
            <div className="mt-6 text-center">
              <a
                href="/app/contact"
                className="text-[12px] underline decoration-dotted underline-offset-4 transition-colors hover:text-aurora-ink"
                style={{ color: SUBTITLE }}
              >
                Can&apos;t get in? Tell us what happened
              </a>
            </div>
          </>
        )}

        {/* Outside the sent/unsent ternary on purpose. This lived inside the
            form, so switching to "check your inbox" unmounted the widget —
            and Resend then had no widget and no token, which Supabase now
            rejects outright. Keeping it mounted in both states means the
            reset after a send always produces a fresh token to resend with. */}
        <div ref={turnstileRef} className="mt-4 flex justify-center empty:mt-0" />
      </div>
    </main>
  )
}

function SentState({
  email,
  resending,
  error,
  onBack,
  onResend,
}: {
  email: string
  resending: boolean
  error: string | null
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
        <div className="text-[52px]" style={{ color: TEAL }}>
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
          className="mt-6 flex h-[52px] w-full items-center justify-center rounded-full text-[17px] font-bold text-aurora-teal-ink"
          style={{ background: `linear-gradient(135deg, ${TEAL}, ${TEAL_END})` }}
        >
          Open Mail
        </a>

        <button
          onClick={onResend}
          disabled={resending}
          className="mt-4 text-[14px] font-medium disabled:opacity-60"
          style={{ color: TEAL }}
        >
          {resending ? "Sending…" : "Resend link"}
        </button>

        {/* Resend can fail (captcha not ready, rate limit) and this screen had
            nowhere to say so — the click just did nothing. */}
        {error && (
          <p className="mt-3 text-[12px]" style={{ color: "rgba(255,99,88,0.9)" }}>
            {error}
          </p>
        )}

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
