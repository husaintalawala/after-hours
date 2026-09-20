// Whether Drift offers passkeys at all, and how to read a WebAuthn refusal.
// Two call sites — the login page and the settings section — and they must
// agree, which is why this is shared rather than duplicated.
//
// Passkeys are OFF and stay off until BOTH of these hold:
//
// 1. NEXT_PUBLIC_PASSKEYS_ENABLED — the server-side gate, declared `false` in
//    .env.production. Passkeys are not switched on in the Supabase project yet:
//    the dashboard toggle is off and the relying-party settings are unset, so
//    every passkey call fails on the server no matter what the browser can do.
//    Turn the project on, set the relying party, flip the var. Same shape as
//    activityAvailable() in lib/activity-scope.ts.
//
//    A build-time flag rather than a live capability probe, deliberately. The
//    only probe the SDK offers is to start a ceremony, and on the login page
//    that spends a single-use Turnstile token to discover the feature is off —
//    leaving the next attempt, magic link included, on a dead token — after
//    already raising a system prompt we cannot honour.
//
// 2. WebAuthn in this browser. Only window.PublicKeyCredential is checked, NOT
//    isUserVerifyingPlatformAuthenticatorAvailable(): a desktop with no Touch
//    ID can still sign in and enrol by scanning a QR code with a phone, and
//    gating on a LOCAL authenticator would hide a route that works. The SDK
//    re-checks this itself (browserSupportsWebAuthn) and returns a clean error;
//    this check is the UI decision, not the safety net.
//
// isConditionalMediationAvailable() is deliberately absent. That check gates
// autofill-driven sign-in, and auth-js's signInWithPasskey() runs the whole
// ceremony itself — its options are { captchaToken, signal } and there is no
// way to ask it for conditional mediation. Conditional UI would mean dropping
// to auth.passkey.startAuthentication()/verifyAuthentication(), hand-rolling
// the ceremony and its base64url serialisation, and adding
// autocomplete="username webauthn" to the email field. There is no autofill
// route here to gate, so there is nothing missing.
//
// Reads window, so call it from an effect, never during render.
export function passkeysOffered(): boolean {
  return (
    process.env.NEXT_PUBLIC_PASSKEYS_ENABLED === "true" &&
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential === "function"
  )
}

/**
 * True when the authenticator gave us nothing — which the browser reports as a
 * single `NotAllowedError` whether you cancelled the sheet, had no matching
 * passkey, or let it time out. auth-js wraps it as a WebAuthnError with code
 * ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY and name copied off the cause (see
 * identifyAuthenticationError / the WebAuthnError constructor), so the NAME is
 * what identifies it — not ERROR_CEREMONY_ABORTED, which auth-js raises only
 * for its own abort signal when a second ceremony pre-empts a pending one.
 * Both are checked; both mean the same thing to the person at the screen.
 *
 * Read off the object rather than via the SDK's isWebAuthnError, which lives in
 * auth-js's webauthn.errors module and is re-exported by neither
 * @supabase/auth-js's index nor @supabase/supabase-js.
 *
 * Callers must NOT treat this as silence. We cannot tell "changed my mind" from
 * "no passkey here", so both call sites answer with a calm, non-red line.
 */
export function passkeyCancelled(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const e = error as { code?: string; name?: string }
  return e.name === "NotAllowedError" || e.code === "ERROR_CEREMONY_ABORTED"
}
