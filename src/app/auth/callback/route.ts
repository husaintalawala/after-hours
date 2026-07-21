import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// PKCE code-exchange endpoint for magic-link + OAuth (Google/Apple). Supabase
// redirects here with ?code=...; we swap it for a session (cookie written via
// the server client's setAll), then forward to /app. Allow-listed in Supabase
// dashboard -> Auth -> URL Configuration -> Redirect URLs:
//   http://localhost:3000/auth/callback  and  https://drift.after-hours.app/auth/callback
//
// Failures are forwarded to the login page as ?error=<detail> — a silent
// bounce back to login is indistinguishable from "sign-in got stuck".
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/app"

  // Supabase signals provider/flow errors as query params on the redirect.
  const upstreamError =
    searchParams.get("error_description") ?? searchParams.get("error")
  if (upstreamError) {
    return NextResponse.redirect(
      `${origin}/app/login?error=${encodeURIComponent(upstreamError)}`
    )
  }

  if (code) {
    const supabase = createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
    return NextResponse.redirect(
      `${origin}/app/login?error=${encodeURIComponent(error.message)}`
    )
  }

  return NextResponse.redirect(
    `${origin}/app/login?error=${encodeURIComponent("Sign-in link was missing its code — try again.")}`
  )
}
