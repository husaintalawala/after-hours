import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "@/lib/database.types"
import { AUTH_COOKIE_OPTIONS } from "./cookie-options"

// Server Supabase client for Server Components, Route Handlers, and Server
// Actions. Bridges auth cookies via next/headers. In a Server Component the
// cookie store is read-only, so setAll is wrapped in try/catch — the
// middleware (see src/middleware.ts) is what actually refreshes the session
// cookie on each request.
// Next 15 made cookies() async, so this is async too and every caller awaits
// it. The cookie store is resolved once here rather than inside getAll/setAll,
// which are synchronous callbacks that cannot await.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — safe to ignore; the
            // middleware refreshes the session cookie.
          }
        },
      },
    }
  )
}
