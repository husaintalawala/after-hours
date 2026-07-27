"use client"

import { useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import type { EmailOtpType } from "@supabase/supabase-js"

// Client-side verify for email magic-link / OTP. The email links to
// /auth/callback, which bounces the token_hash here — verification happens in
// the browser so mail-scanner prefetches (which don't run JS) can't consume the
// single-use token before the real tap. verifyOtp needs no PKCE verifier, so it
// works cross-device; the browser Supabase client persists the session into the
// same Secure cookies the SSR layer reads, then we do a full navigation to /app.
export default function AuthConfirmPage() {
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return // React 18 StrictMode double-invoke guard (token is single-use)
    ran.current = true

    const params = new URLSearchParams(window.location.search)
    const tokenHash = params.get("token_hash")
    const type = params.get("type") as EmailOtpType | null
    const rawNext = params.get("next")
    const next =
      rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/app"

    const fail = (msg: string) =>
      window.location.replace(`/app/login?error=${encodeURIComponent(msg)}`)

    if (!tokenHash || !type) {
      fail("Sign-in link was incomplete — request a new one.")
      return
    }

    createClient()
      .auth.verifyOtp({ type, token_hash: tokenHash })
      .then(({ error }) => {
        if (error) fail(error.message)
        else window.location.replace(next)
      })
      .catch(() => fail("Couldn't complete sign-in — request a new link."))
  }, [])

  return (
    <main
      className="flex min-h-screen items-center justify-center px-6"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 0%, #1a1410 0%, #0c0a08 55%, #060505 100%)",
      }}
    >
      <div className="flex flex-col items-center gap-4" style={{ color: "rgb(250,245,235)" }}>
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-white/25"
          style={{ borderTopColor: "#E0563B" }}
        />
        <p className="text-[15px]" style={{ color: "rgba(235,224,209,0.85)" }}>
          Signing you in…
        </p>
      </div>
    </main>
  )
}
