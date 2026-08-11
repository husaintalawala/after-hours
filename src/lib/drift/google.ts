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

// Request a Google access token for `scope`. Resolves with the token, or
// rejects with a friendly message (cancelled / blocked / unverified app).
export async function requestGoogleAccessToken(scope: string): Promise<string> {
  await loadGsi()
  return new Promise<string>((resolve, reject) => {
    const client = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope,
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

/**
 * Disconnect Drift from the user's Google account.
 *
 * Uses google.accounts.id.revoke, which takes an EMAIL HINT and revokes the
 * grant without any UI.
 *
 * The first version asked for an access token first and revoked that. It could
 * not work: initTokenClient always shows the account chooser, so pressing
 * "Disconnect" opened a CONNECT screen — the opposite of the action. There is
 * no silent way to obtain a token here, so the token-based revoke is the wrong
 * primitive for this button entirely.
 *
 * Resolves true when Google reports the grant revoked.
 */
export async function revokeGoogleAccess(email: string): Promise<boolean> {
  if (!email) return false
  await loadGsi()
  return new Promise<boolean>((resolve) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).google.accounts.id.revoke(email, (resp: { successful?: boolean }) => {
        resolve(resp?.successful !== false)
      })
    } catch {
      resolve(false)
    }
  })
}
