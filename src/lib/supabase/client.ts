import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "@/lib/database.types"
import { AUTH_COOKIE_OPTIONS } from "./cookie-options"

// Browser Supabase client for Client Components. Reads the public anon key
// (RLS-scoped; same project as the Drift iOS app). Session lives in cookies
// written by @supabase/ssr so Server Components see the same auth state.
// cookieOptions must match the server/middleware writers exactly (Secure,
// SameSite, path, maxAge) so a client-side token refresh doesn't rewrite the
// auth cookie with weaker attributes.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: AUTH_COOKIE_OPTIONS }
  )
}
