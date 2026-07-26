import { NextResponse, type NextRequest } from "next/server"
import { createServerClient, type CookieOptions } from "@supabase/ssr"
import type { EmailOtpType } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options"

// Auth landing endpoint for BOTH sign-in flows:
//
//  • OAuth (Google / Apple / X): ?code=...  → exchangeCodeForSession (PKCE).
//    The code verifier was written to a cookie in THIS browser during
//    signInWithOAuth, and OAuth always completes in the same browser, so the
//    verifier is present — the PKCE exchange works.
//
//  • Magic link / email OTP: ?token_hash=...&type=...  → verifyOtp.
//    This path must NOT use the PKCE `code` flow. That flow stores the code
//    verifier in a cookie in the browser that INITIATED sign-in; when the user
//    opens the email on a different device/browser (phone vs. the desktop they
//    typed their email on), the verifier isn't there and exchangeCodeForSession
//    throws "PKCE code verifier not found in storage", blocking ALL email
//    sign-in. verifyOtp({ token_hash }) needs no client verifier → cross-device
//    safe. Requires the email templates to link here with token_hash (see below).
//
// >>> REQUIRED Supabase dashboard change (Auth → Email Templates) <<<
//   Magic Link template link:
//     {{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink&next=/app
//   Confirm signup template link:
//     {{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup&next=/app
//   (Default templates use {{ .ConfirmationURL }}, which is the PKCE code flow
//    that breaks cross-device — replace them with the token_hash links above.)
//
// Session cookies are written directly onto the redirect `response` so the
// Set-Cookie headers ship with the redirect (the "login every refresh" fix).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const next = searchParams.get("next") ?? "/app"

  // Supabase signals provider/flow errors as query params on the redirect.
  const upstreamError =
    searchParams.get("error_description") ?? searchParams.get("error")
  if (upstreamError) {
    return NextResponse.redirect(
      `${origin}/app/login?error=${encodeURIComponent(upstreamError)}`
    )
  }

  const hasOtp = !!(tokenHash && type)
  if (!code && !hasOtp) {
    return NextResponse.redirect(
      `${origin}/app/login?error=${encodeURIComponent("Sign-in link was incomplete — request a new one.")}`
    )
  }

  // The response we return on success — session cookies are written onto IT via
  // setAll below, so they persist to the browser with the redirect.
  const response = NextResponse.redirect(`${origin}${next}`)
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Persist the login cookies with the same Secure/SameSite/maxAge every
      // other writer uses, so the very first session cookie is durable (Safari/
      // iOS ITP restricts non-Secure, script-written cookies).
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Email/magic-link (token_hash) is verifier-free and works cross-device;
  // OAuth falls back to the PKCE code exchange (same-browser, verifier present).
  const { error } = hasOtp
    ? await supabase.auth.verifyOtp({ type: type!, token_hash: tokenHash! })
    : await supabase.auth.exchangeCodeForSession(code!)

  if (error) {
    return NextResponse.redirect(
      `${origin}/app/login?error=${encodeURIComponent(error.message)}`
    )
  }
  return response
}
