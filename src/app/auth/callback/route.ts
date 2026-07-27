import { NextResponse, type NextRequest } from "next/server"
import { createServerClient, type CookieOptions } from "@supabase/ssr"
import type { Database } from "@/lib/database.types"
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options"

// Auth landing endpoint for BOTH sign-in flows:
//
//  • OAuth (Google / Apple / X): ?code=...  → exchangeCodeForSession (PKCE),
//    server-side here. The verifier cookie was written in THIS browser during
//    signInWithOAuth and OAuth always completes same-browser, so it's present.
//    OAuth redirects are never pre-fetched by mail clients → server-side is safe.
//
//  • Magic link / email OTP: ?token_hash=...&type=...  → handed to the CLIENT
//    page /auth/confirm, which runs verifyOtp in the browser. Email links get
//    pre-fetched by mail scanners (Gmail / Outlook / Apple Mail Privacy
//    Protection); a scanner that GETs this URL would otherwise consume the
//    single-use token server-side and leave the real tap with "otp_expired /
//    One-time token not found". Scanners don't run JS, so verifying client-side
//    means only a real browser burns the token. verifyOtp needs no PKCE verifier
//    → cross-device safe. (No email-template change: templates still link here.)
//
// Session cookies for the OAuth path are written directly onto the redirect
// `response` so the Set-Cookie headers ship with it (the "login every refresh" fix).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type")
  // Only same-origin relative paths — never an absolute or protocol-relative
  // URL smuggled in via the email link (open-redirect guard).
  const rawNext = searchParams.get("next")
  const next =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/app"

  // Supabase signals provider/flow errors as query params on the redirect.
  const upstreamError =
    searchParams.get("error_description") ?? searchParams.get("error")
  if (upstreamError) {
    return NextResponse.redirect(
      `${origin}/app/login?error=${encodeURIComponent(upstreamError)}`
    )
  }

  // Email OTP → verify in the browser (prefetch-proof). Hand the params to
  // /auth/confirm; NO token is consumed here, so a scanner's GET is harmless.
  if (tokenHash && type) {
    const url = new URL(`${origin}/auth/confirm`)
    url.searchParams.set("token_hash", tokenHash)
    url.searchParams.set("type", type)
    url.searchParams.set("next", next)
    return NextResponse.redirect(url)
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/app/login?error=${encodeURIComponent("Sign-in link was incomplete — request a new one.")}`
    )
  }

  // OAuth PKCE — server-side exchange (unchanged), cookies onto the redirect.
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

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(
      `${origin}/app/login?error=${encodeURIComponent(error.message)}`
    )
  }
  return response
}
