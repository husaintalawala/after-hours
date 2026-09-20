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
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      // Un-gates auth.signInWithPasskey / registerPasskey / auth.passkey.*,
      // which THROW without it — assertPasskeyExperimentalEnabled is the first
      // statement of every one of them, outside their try/catch. It sits on
      // this shared client because it has to: createBrowserClient caches one
      // instance per browser tab, so a second passkey-only client would just
      // hand this one back with its options ignored. Sharing is harmless — the
      // flag's only effect is that those methods stop throwing, and whether
      // passkeys are OFFERED is decided in lib/passkeys.ts, not here. Browser
      // only: server.ts and middleware.ts build their own clients and don't get
      // it, since WebAuthn cannot run outside a browser.
      auth: { experimental: { passkey: true } },
    }
  )
}
