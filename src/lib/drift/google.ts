// Client-side Google Identity Services (GIS) token flow — used by the imports
// surface to get a short-lived Google access token for the Gmail scan and the
// Google Calendar pull. This is the browser "token model" (no client secret;
// the public web client ID is safe to embed, same as the Mapbox token). The
// token is handed to our edge functions, which do the actual reading.
//
// Web OAuth client: "drift web" (Google Auth Platform → Clients). Restricted
// scope gmail.readonly is added on the consent screen; until Google verifies
// the app, only test users on the consent screen can complete the flow — the
// callers fall back to Forward/Paste on error.

const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  "1031244228172-8euee14pr8q699lts1kkocsdj8tlk62n.apps.googleusercontent.com"

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly"

/* eslint-disable @typescript-eslint/no-explicit-any */
let gsiLoad: Promise<void> | null = null
function loadGsi(): Promise<void> {
  if (gsiLoad) return gsiLoad
  gsiLoad = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"))
    if ((window as any).google?.accounts?.oauth2) return resolve()
    const s = document.createElement("script")
    s.src = "https://accounts.google.com/gsi/client"
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error("Couldn't reach Google sign-in. Check your connection."))
    document.head.appendChild(s)
  })
  return gsiLoad
}

// How the token request is allowed to interrupt the user.
//   ""             — prompt only the first time (Google's docs); used by scans.
//   "none"         — never show an account chooser or consent screen; Google
//                    errors instead. The only safe mode for Disconnect, where
//                    showing a CONNECT screen would be the opposite action.
// login_hint skips account selection when it matches a signed-in account.
export interface TokenRequestOptions {
  prompt?: "" | "none" | "consent" | "select_account"
  login_hint?: string
}

// Request a Google access token for `scope`. Resolves with the token, or
// rejects with a friendly message (cancelled / blocked / unverified app).
export async function requestGoogleAccessToken(
  scope: string,
  opts: TokenRequestOptions = {}
): Promise<string> {
  await loadGsi()
  return new Promise<string>((resolve, reject) => {
    const client = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope,
      // Only send the keys the caller set — passing prompt: undefined is not
      // the same as omitting it, and the default (select_account) is what the
      // scan paths want.
      ...(opts.prompt !== undefined ? { prompt: opts.prompt } : {}),
      ...(opts.login_hint ? { login_hint: opts.login_hint } : {}),
      callback: (resp: any) => {
        if (resp?.access_token) resolve(resp.access_token)
        else
          reject(
            new Error(
              resp?.error_description || resp?.error || "Google sign-in didn't complete."
            )
          )
      },
      error_callback: (err: any) =>
        reject(new Error(err?.message || "Google sign-in was cancelled.")),
    })
    client.requestAccessToken()
  })
}

// Pull the calendar events that fall inside a TRIP's date window and render
// each as a plain-text block in the SAME shape as the .ics parser, so
// parse-text treats them identically.
//
// Scoped + filtered on purpose, mirroring iOS (GoogleCalendarImportService
// .candidates): an unscoped "next 50 upcoming events" sweep hands the parser
// dentist appointments and standups from months outside the trip, and every
// booking it manages to extract lands on whichever trip the user happened to
// be looking at. Two gates keep that out:
//   1. time window — trip start − 1d … trip end + 2d (same margins as iOS,
//      which covers a red-eye out the night before and a late return leg).
//   2. travel-keyword filter — see looksLikeTravel below.
export interface TripDateWindow {
  /** Trip start, ISO or yyyy-MM-dd. null / the 1970 sentinel = dateless trip. */
  start: string | null
  end: string | null
}

const MAX_CALENDAR_EVENTS = 50

export async function fetchTripCalendarTexts(
  accessToken: string,
  trip: TripDateWindow
): Promise<string[]> {
  const { timeMin, timeMax } = calendarWindow(trip)
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  })
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) throw new Error("Couldn't read your Google Calendar.")
  const json = (await res.json()) as { items?: any[] }
  return (json.items ?? [])
    .filter((e) => (e?.status ?? "confirmed") !== "cancelled")
    .map(renderCalendarEvent)
    .filter((t): t is string => !!t)
    .filter(looksLikeTravel)
    .slice(0, MAX_CALENDAR_EVENTS)
}

// Trip window → Google's timeMin/timeMax. A dateless trip (null, or the 1970
// sentinel the trip page uses) has no window to scope to, so fall back to the
// next 90 days rather than sweeping the user's whole calendar history.
//
// NOTE: a trip whose dates are in the past is NOT clamped to "now" — Google
// keeps past events, and importing bookings for a trip already under way (or
// just finished) is a real case that a now-floor would silently return zero
// results for. That's the bug class this whole path is climbing out of.
function calendarWindow(trip: TripDateWindow): { timeMin: string; timeMax: string } {
  const start = parseTripDate(trip.start)
  const end = parseTripDate(trip.end) ?? start
  if (!start || !end) {
    const now = new Date()
    return {
      timeMin: now.toISOString(),
      timeMax: new Date(now.getTime() + 90 * 864e5).toISOString(),
    }
  }
  return {
    timeMin: new Date(start.getTime() - 1 * 864e5).toISOString(),
    timeMax: new Date(end.getTime() + 2 * 864e5).toISOString(),
  }
}

// "2026-08-12" or a full ISO timestamp → Date. The trip page stores dateless
// trips as a 1970 sentinel, which must read as "no date", not as 1970.
function parseTripDate(value: string | null | undefined): Date | null {
  if (!value || value.startsWith("1970")) return null
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value)
  return Number.isNaN(d.getTime()) ? null : d
}

// Travel-keyword filter — a direct port of iOS's
// CalendarImportService.looksLikeTravelText. Conservative on the
// false-positive side: better to miss a borderline event than to file
// "Dentist appointment" as a flight.
//
// Divergence from iOS, deliberate: iOS falls back to "show the first 50
// events" when nothing matches, because there a human then picks from a list.
// The web path posts straight into parse-text with no picker, so an empty
// match here returns empty and the caller says so — it never widens into an
// unfiltered sweep.
const TRAVEL_STRONG = [
  "flight", "boarding", "boarding pass", "departure", "arrival",
  "check-in", "checkin", "check in", "check-out", "checkout",
  "hotel", "airbnb", "booking", "reservation", "confirmation",
  "itinerary", "pnr", "ticket",
  "rental car", "car rental",
  "train", "bus", "ferry",
  "tour", "transfer", "voucher", "receipt",
]
const TRAVEL_AIRLINES = [
  "tap portugal", "icelandair", "delta", "united airlines",
  "american airlines", "lufthansa", "british airways", "klm",
  "air france", "emirates", "qatar", "ryanair", "easyjet",
  "iberia", "vueling", "wizz", "play airlines", "fly play",
  "southwest airlines", "southwest",
]
const FLIGHT_CODE =
  /\b(aa|ac|af|as|ba|b6|dl|ek|fi|f9|ib|kl|lh|nk|og|qr|tp|ua|wn|w6|vy)\s?\d{2,4}\b/

function looksLikeTravel(text: string): boolean {
  const bag = text.toLowerCase()
  if (!bag) return false
  if (TRAVEL_STRONG.some((k) => bag.includes(k))) return true
  if (FLIGHT_CODE.test(bag)) return true
  return TRAVEL_AIRLINES.some((k) => bag.includes(k))
}

function renderCalendarEvent(e: any): string | null {
  const summary: string | undefined = e?.summary
  const location: string | undefined = e?.location
  const description: string | undefined = e?.description
  const start: string | undefined = e?.start?.dateTime || e?.start?.date
  const end: string | undefined = e?.end?.dateTime || e?.end?.date
  if (!summary && !location && !description) return null
  const parts: string[] = []
  if (summary) parts.push(summary)
  if (start) parts.push(`When: ${fmtDate(start)}${end ? ` to ${fmtDate(end)}` : ""}`)
  if (location) parts.push(`Where: ${location}`)
  if (description) parts.push(description)
  return parts.join("\n")
}

// ISO ("2026-07-14T09:00:00-04:00") or date-only ("2026-07-14") → "2026-07-14 09:00".
function fmtDate(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso)
  if (!m) return iso
  return m[2] ? `${m[1]} ${m[2]}:${m[3]}` : m[1]
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Disconnect
// ---------------------------------------------------------------------------

/**
 * Google's OAuth revocation endpoint. Takes an access token and drops EVERY
 * scope the user granted this client — one call kills gmail.readonly and
 * calendar.readonly together, which is exactly the "Disconnect Google"
 * semantic.
 *
 * It is CORS-enabled and must be called WITHOUT credentials: the response
 * carries no Access-Control-Allow-Credentials, so `credentials: "include"`
 * turns it into a hard CORS failure. fetch's default (same-origin) is correct
 * — do not "fix" this by adding credentials. Google's own gsi/client does the
 * same thing and logs "Making revoke request without credentials."
 *
 * A URLSearchParams body keeps this a CORS-simple request (no preflight).
 */
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke"

export type RevokeOutcome =
  | { ok: true }
  /** No token could be minted silently — we will not escalate to a UI prompt. */
  | { ok: false; reason: "needs_google_signin" }
  /** A token was obtained but Google refused or was unreachable. */
  | { ok: false; reason: "network" }

/** A silent token attempt must not be able to hang the Disconnect button. */
const SILENT_TOKEN_TIMEOUT_MS = 10_000

/**
 * Disconnect Drift from the user's Google account.
 *
 * Revocation is TOKEN-BOUND: there is no Google API that drops a grant given
 * only a client ID and an email. Since Drift stores no tokens, the only way to
 * revoke is to mint one at Disconnect time and immediately spend it revoking
 * itself — the same lifecycle as a scan, just with a different destination.
 *
 * Every token request is `prompt: "none"`, so Google either returns a token
 * silently or errors. It can never render an account chooser or a consent
 * screen, which is the failure that made the first attempt at this button open
 * a CONNECT flow. When no scope yields a token we return needs_google_signin
 * and the UI links out to the user's Google account settings — we deliberately
 * do NOT retry interactively.
 *
 * Do not reach for google.accounts.id.revoke here: it revokes ID-token sharing
 * only ("cannot be used to manage OAuth2.0 authorization scopes" — Google), and
 * Drift issues no ID token, so it has nothing to act on. On Chromium it now
 * routes to the FedCM IdentityCredential.disconnect() API, which needs a
 * federated sign-in connection this app never establishes; that is why it hung
 * and then timed out.
 */
export async function revokeGoogleAccess(
  email: string,
  scopes: string[] = [GMAIL_SCOPE, CALENDAR_SCOPE]
): Promise<RevokeOutcome> {
  const token = await silentAccessToken(scopes, email)
  if (!token) return { ok: false, reason: "needs_google_signin" }

  try {
    const res = await fetch(REVOKE_ENDPOINT, {
      method: "POST",
      body: new URLSearchParams({ token }),
    })
    if (res.ok) return { ok: true }
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    // invalid_token = the token was already expired or revoked. We minted it
    // seconds ago, so this means the grant is gone either way — Google's own
    // guidance is to regard the grant as revoked.
    if (body?.error === "invalid_token") return { ok: true }
    return { ok: false, reason: "network" }
  } catch {
    return { ok: false, reason: "network" }
  }
}

/**
 * First scope that still yields a token without any UI. We do not know which
 * scopes the user actually granted (Gmail, Calendar, or both), and asking for
 * an ungranted scope with prompt:"none" simply errors — so try each in turn.
 * One success is enough: revoking any token drops all of them.
 */
async function silentAccessToken(scopes: string[], email: string): Promise<string | null> {
  for (const scope of scopes) {
    try {
      return await withTimeout(
        requestGoogleAccessToken(scope, {
          prompt: "none",
          ...(email ? { login_hint: email } : {}),
        }),
        SILENT_TOKEN_TIMEOUT_MS
      )
    } catch {
      // Scope not granted, no active Google session in this browser, or the
      // popup was blocked. Try the next scope; if none work the caller links
      // the user out to Google rather than prompting them to sign in.
    }
  }
  return null
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ])
}
