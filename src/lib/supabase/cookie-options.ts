import type { CookieOptions } from "@supabase/ssr"

// Shared cookie attributes for the Supabase auth cookies, applied identically
// by every writer (browser client on client-side refresh, server client in the
// /auth/callback exchange, middleware on session refresh). @supabase/ssr merges
// these onto each auth cookie it sets.
//
// Why this exists: the live auth cookies were being written WITHOUT `Secure`.
// A non-Secure cookie on an HTTPS origin is a real deviation — Safari/iOS ITP
// restricts the lifetime of non-Secure, script-written cookies, which reads as
// "logged out on every refresh". Marking them Secure (in production) + pinning
// consistent maxAge/sameSite/path keeps the session durable across refresh on
// every browser. `secure` is gated to production so http://localhost dev still
// works (Secure cookies are dropped over http).
export const AUTH_COOKIE_OPTIONS: CookieOptions = {
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  // 400 days — the browser cap for persistent cookies; matches what @supabase/ssr
  // was already emitting so nothing shortens on the switch to explicit options.
  maxAge: 60 * 60 * 24 * 400,
}
