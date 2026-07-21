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

// Pull upcoming primary-calendar events and render each as a plain-text block
// in the SAME shape as the .ics parser, so parse-text treats them identically.
export async function fetchUpcomingCalendarTexts(accessToken: string): Promise<string[]> {
  const params = new URLSearchParams({
    timeMin: new Date().toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  })
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) throw new Error("Couldn't read your Google Calendar.")
  const json = (await res.json()) as { items?: any[] }
  return (json.items ?? [])
    .map(renderCalendarEvent)
    .filter((t): t is string => !!t)
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
