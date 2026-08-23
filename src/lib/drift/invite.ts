// Shared bits of the invite-link flow.
//
// The token has to survive an auth round trip, and it CANNOT ride the redirect.
// `/app/login` builds `redirectTo` with no query params on purpose — Supabase
// matches redirect URLs against an allow-list and a `?next=` variant can fail
// the match, silently falling back to the Site URL (that was the "stuck Google
// login" bug). The magic-link email template also hardcodes `next=/app`, so the
// callback's `next` is decided before we ever see it.
//
// So the token travels in a cookie instead: /join/<token>/start sets it before
// handing off to login, and the /app landing redeems it on the way back. That
// works for magic link and OAuth alike, because it does not depend on anything
// the auth provider round-trips for us.

export const INVITE_COOKIE = "drift_invite"

/// Two hours. Long enough for "open the link, go find the confirmation email,
/// come back", short enough that a stale token isn't still hijacking the /app
/// landing days later on a shared machine.
export const INVITE_COOKIE_MAX_AGE = 60 * 60 * 2

/// 32 lowercase hex characters — a UUIDv4's 122 random bits with the dashes
/// stripped, which is what `create_trip_invite` mints. Validated everywhere a
/// token enters from outside so nothing shaped like a path traversal, an old
/// trip UUID (36 chars, dashes) or arbitrary junk reaches the RPC.
export function isValidInviteToken(v: string | null | undefined): v is string {
  return typeof v === "string" && /^[0-9a-f]{32}$/.test(v)
}
