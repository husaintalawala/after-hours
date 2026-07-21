import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "@/lib/database.types"

// Browser Supabase client for Client Components. Reads the public anon key
// (RLS-scoped; same project as the Drift iOS app). Session lives in cookies
// written by @supabase/ssr so Server Components see the same auth state.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
