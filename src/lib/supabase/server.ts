import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "@/lib/database.types"

// Server Supabase client for Server Components, Route Handlers, and Server
// Actions. Bridges auth cookies via next/headers. In a Server Component the
// cookie store is read-only, so setAll is wrapped in try/catch — the
// middleware (see src/middleware.ts) is what actually refreshes the session
// cookie on each request.
export function createClient() {
  const cookieStore = cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
