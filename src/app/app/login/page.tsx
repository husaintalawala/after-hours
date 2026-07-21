"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"

// Logged-out entry to the Drift web app. Passwordless, mirroring the iOS
// AuthView: email magic-link + Continue with Google. Apple/phone can follow.
// Lives at /app/login, OUTSIDE the (protected) route group's auth gate.
export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()
  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback?next=/app`
      : undefined

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  async function signInWithGoogle() {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    })
    if (error) setError(error.message)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-drift-ink font-drift-body">
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap"
        rel="stylesheet"
      />
      <div className="w-full max-w-sm">
        <h1 className="font-drift-display text-4xl font-medium tracking-tight">
          Drift
        </h1>
        <p className="mt-2 text-drift-muted">
          Sign in to plan trips, split costs, and chat with Drift.
        </p>

        {sent ? (
          <div className="mt-8 rounded-2xl bg-drift-coral-50 p-5 text-drift-coral-deep">
            Check <span className="font-medium">{email}</span> for a sign-in
            link.
          </div>
        ) : (
          <>
            <form onSubmit={sendMagicLink} className="mt-8 space-y-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-drift-divider bg-drift-alt-bg px-4 py-3 outline-none focus:border-drift-coral"
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-drift-coral py-3 font-medium text-white disabled:opacity-60"
              >
                {busy ? "Sending…" : "Email me a sign-in link"}
              </button>
            </form>

            <div className="my-5 flex items-center gap-3 text-xs text-drift-text-tertiary">
              <span className="h-px flex-1 bg-drift-divider" />
              or
              <span className="h-px flex-1 bg-drift-divider" />
            </div>

            <button
              onClick={signInWithGoogle}
              className="w-full rounded-xl border border-drift-divider bg-white py-3 font-medium text-drift-ink"
            >
              Continue with Google
            </button>
          </>
        )}

        {error && (
          <p className="mt-4 text-sm text-drift-coral-deep">{error}</p>
        )}
      </div>
    </main>
  )
}
