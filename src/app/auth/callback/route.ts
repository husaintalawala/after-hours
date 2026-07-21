import { NextResponse, type NextRequest } from "next/server"
import { createServerClient, type CookieOptions } from "@supabase/ssr"
import type { Database } from "@/lib/database.types"
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options"

// PKCE code-exchange endpoint for magic-link + OAuth (Google/Apple). Supabase
// redirects here with ?code=...; we swap it for a session and write the auth
// cookies DIRECTLY onto the redirect response, then forward to /app.
//
// Why the explicit-response cookies (the "login every refresh" fix): the prior
// version used the next/headers server client and then returned a *separate*
// NextResponse.redirect(). Set-Cookie written via next/headers does not
// reliably attach to a manually-constructed redirect response — so the session
// cookie was never persisted to the browser, every SSR render saw no cookie,
// and the app bounced back to login on each refresh. Binding the Supabase
// cookie writes to THIS `response` guarantees the Set-Cookie headers ship with
// the redirect. Errors are forwarded to login as ?error=<detail>.
//
// Redirect URLs allow-listed in Supabase → Auth → URL Configuration:
//   http://localhost:3000/auth/callback  and  https://drift.after-hours.app/auth/callback
export async function GET(request: NextRequest) {
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

  if (!code) {
    return NextResponse.redirect(
      `${origin}/app/login?error=${encodeURIComponent("Sign-in link was missing its code — try again.")}`
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

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(
      `${origin}/app/login?error=${encodeURIComponent(error.message)}`
    )
  }
  return response
}
