import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// PKCE code-exchange endpoint for magic-link + OAuth (Google/Apple). Supabase
// redirects here with ?code=...; we swap it for a session (cookie written via
// the server client's setAll), then forward to ?next. Must be allow-listed in
// Supabase dashboard -> Auth -> URL Configuration -> Redirect URLs:
//   http://localhost:3000/auth/callback  and  https://drift.after-hours.app/auth/callback
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/app"

  if (code) {
    const supabase = createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/app/login?error=auth_callback`)
}
