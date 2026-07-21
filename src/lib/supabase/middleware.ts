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
export async function updateSession(request: NextRequest) {
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
