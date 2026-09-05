import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import type { Database } from "@/lib/database.types"
import { AUTH_COOKIE_OPTIONS } from "./cookie-options"

// Refreshes the Supabase auth session cookie on each request and returns the
// (possibly updated) response. Called from src/middleware.ts ONLY for the
// logged-in app paths (/app, /auth) — the marketing landing is untouched.
//
// IMPORTANT (per @supabase/ssr docs): do not run logic between createServerClient
// and getUser(), and always return the `response` object with its cookies intact,
// or the browser and server can desync and log users out at random.

/** How close to expiry the access token has to be before we spend a round trip
 *  refreshing it. Comfortably longer than any single request, short enough that
 *  a token never actually reaches a server expired. */
const REFRESH_WINDOW_SECONDS = 120

/**
 * Seconds of life left on the access token in this request's cookies, or null
 * when that cannot be determined for certain.
 *
 * NULL IS THE SAFE ANSWER and every failure returns it: a malformed cookie, a
 * chunked cookie we did not reassemble, an unfamiliar encoding, a token with no
 * `exp`. The caller then does exactly what it always did. Nothing here can log
 * anybody out; the worst case is being as slow as before.
 *
 * The session cookie is `sb-<ref>-auth-token`, and @supabase/ssr splits a large
 * one into `.0`, `.1`, … chunks that must be concatenated IN ORDER. Its value is
 * JSON, optionally prefixed `base64-`.
 */
function accessTokenLifetime(request: NextRequest): number | null {
  try {
    const chunks = request.cookies
      .getAll()
      .filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
      .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }))
    if (chunks.length === 0) return null

    let raw = chunks.map((c) => c.value).join("")
    if (raw.startsWith("base64-")) {
      raw = atob(raw.slice(7).replace(/-/g, "+").replace(/_/g, "/"))
    }
    const session = JSON.parse(raw) as { access_token?: unknown }
    const token = session.access_token
    if (typeof token !== "string") return null

    const payload = token.split(".")[1]
    if (!payload) return null
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    const claims = JSON.parse(json) as { exp?: unknown }
    if (typeof claims.exp !== "number") return null

    return claims.exp - Math.floor(Date.now() / 1000)
  } catch {
    return null
  }
}

export async function updateSession(request: NextRequest) {
  // THE FAST PATH, AND THE REASON THIS FUNCTION HAS ONE.
  //
  // `getUser()` is a live round trip to Supabase's auth server — that is the
  // documented point of it, as against `getSession()`, which reads the cookie.
  // Middleware runs before Next renders a byte, so that round trip sat in front
  // of EVERY navigation and every `<Link>` prefetch into the app: not just the
  // page's own data, but the loading.tsx skeleton whose whole job is to paint
  // instantly. The nav rail alone mounts six always-visible links, so arriving
  // anywhere fired six more of them, each competing with the tap the user was
  // about to make.
  //
  // An access token lives an hour. Refreshing it on every request bought
  // nothing for the ~99% that arrive with fifty minutes left on it, so now we
  // only pay when the token is actually near expiry — or when we cannot read it
  // and have to assume the worst.
  //
  // The middleware still RUNS on prefetches, deliberately: skipping it there
  // would let a prefetched response be built without the headers this returns.
  // Only the round trip is conditional.
  const lifetime = accessTokenLifetime(request)
  if (lifetime !== null && lifetime > REFRESH_WINDOW_SECONDS) {
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Touch the user so an expired access token gets refreshed and the new
  // cookie is written onto `response`.
  await supabase.auth.getUser()

  return response
}
