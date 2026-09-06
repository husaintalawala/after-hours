// ── PostHog event-level funnel layer (sits on top of Vercel Web Analytics) ──
//
// Vercel Analytics answers "how much traffic / which pages"; PostHog answers
// "WHERE does the funnel leak" — the tweet drove reach but ~0 signups, so we
// need step-by-step drop-off. These are the canonical funnel event names; keep
// them stable so the PostHog funnel Husain builds keeps working.
//
//   landing (static marketing, /api/ph)  ── $pageview
//     → landing_cta_click                 (tap "Log in" / open the web app)
//   login page (/app/login)              ── $pageview
//     → login_attempt   { method }        (magic-link submit / OAuth click)
//     → login_success                     (authenticated app entry, 1×/session)
//   activation
//     → create_trip / add_to_itinerary / start_chat
//
// The distinct_id persists across the marketing→app hop (same domain, same
// posthog cookie), so the whole landing→signup→activation path is one funnel.
// SHARED WITH iOS. Every name and property key below is also emitted by the
// iOS app, byte for byte — one taxonomy, one funnel. Where a name already had
// recorded history on web it WINS and iOS adopts it, which is why the
// activation events read create_trip / add_to_itinerary / start_chat rather
// than the tidier trip_created / place_added_to_trip / chat_message_sent:
// renaming an event with history splits the funnel in PostHog. Do not rename
// these, and do not add a variant on one platform only.
export const AnalyticsEvent = {
  // Fired by the /api/ph loader on the static landing (keep the string in sync).
  MarketingLandingView: "marketing_landing_view",
  LandingCtaClick: "landing_cta_click",
  LoginAttempt: "login_attempt",
  LoginSuccess: "login_success",
  // A first-ever session for this auth user — the funnel's signup step, which
  // magic-link can't distinguish from a return login any other way.
  Signup: "signup",
  CreateTrip: "create_trip",
  AddToItinerary: "add_to_itinerary",
  StartChat: "start_chat",
  // ---- Launch funnel (new; no prior history, so these names are the shared ones) ----
  /** Once per browser session. { is_first_open, platform, days_since_first_open } */
  AppOpened: "app_opened",
  /** The transition to a real itinerary: the FIRST time a trip reaches 3 stops. */
  TripActivated: "trip_activated",
  /** The invite loop's two halves — mint, and redeem. */
  InviteLinkCreated: "invite_link_created",
  InviteAccepted: "invite_accepted",
  ExpenseAdded: "expense_added",
} as const

type Props = Record<string, unknown>

// Minimal surface of posthog-js used here.
type PostHogLike = {
  capture: (event: string, props?: Props) => void
  identify: (id: string, props?: Props) => void
}

// IMPORTANT: this module must NOT `import posthog from "posthog-js"`. Every
// instrumented component imports capture() from here, so a static import pulls
// the ~75 kB library into each of those route bundles — measured at +74 kB on
// /app/trips/[id] (207 kB → 281 kB), which is the page this repo has already
// spent work trimming. initAnalytics() imports it dynamically instead: one lazy
// chunk after hydration, nothing added to any route's first load.
//
// Until that chunk lands (and until the Vercel env vars are set) the whole thing
// is a silent no-op, so callers never need to check. Events fired in the gap are
// queued rather than dropped — login_attempt can fire seconds after paint.
// An invite URL is a bearer capability: whoever holds /join/<token> can join
// that trip. posthog-js stamps $current_url, $pathname and $referrer onto EVERY
// event it sends, so an invite landing page files a working invite token in a
// third-party analytics store — on the one page whose whole audience is people
// who are not signed in yet. The path shape is kept (the funnel still sees "an
// invite landing"); only the token itself is dropped.
const CAPABILITY_PATH = /\/join\/[^/?#]+/g

function redactCapabilityUrls(props: Props): Props {
  for (const k of Object.keys(props)) {
    const v = props[k]
    if (typeof v === "string" && v.includes("/join/")) {
      props[k] = v.replace(CAPABILITY_PATH, "/join/[token]")
    }
  }
  return props
}

let ph: PostHogLike | null = null
let initStarted = false
const queue: Array<[string, Props | undefined]> = []
let pendingIdentity: [string, Props | undefined] | null = null

export function initAnalytics(): void {
  if (initStarted || typeof window === "undefined") return
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) return // not configured yet (no key in Vercel env) → stay a no-op
  initStarted = true
  import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
        capture_pageview: false, // manual $pageview on App Router client navigation
        capture_pageleave: true,
        autocapture: true,
        person_profiles: "identified_only",
        sanitize_properties: redactCapabilityUrls,
      })
      ph = posthog as unknown as PostHogLike
      if (pendingIdentity) {
        ph.identify(pendingIdentity[0], pendingIdentity[1])
        pendingIdentity = null
      }
      for (const [event, props] of queue.splice(0)) ph.capture(event, props)
      // The entry route's pageview: PostHogProvider's effect already ran and
      // no-op'd before this chunk arrived.
      ph.capture("$pageview", { $current_url: window.location.href })
    })
    .catch(() => {
      /* analytics must never break the app */
    })
}

export function capture(event: string, props?: Props): void {
  if (typeof window === "undefined") return
  try {
    if (ph) ph.capture(event, props)
    else if (initStarted && queue.length < 50) queue.push([event, props])
  } catch {
    /* analytics must never break the app */
  }
}

export function identifyUser(id: string, props?: Props): void {
  if (typeof window === "undefined") return
  try {
    if (ph) ph.identify(id, props)
    else if (initStarted) pendingIdentity = [id, props]
  } catch {
    /* noop */
  }
}

// ── app_opened ───────────────────────────────────────────────────────────────
// The web half of the iOS launch event, so "opened the app" is one number
// across both platforms. Once per browser session (a SPA navigation is not a
// new open), and first-seen is a localStorage date so a returning stranger is
// distinguishable from a brand new one BEFORE they ever sign in — which is the
// whole point: the anonymous distinct_id carries this through signup.
const OPENED_SESSION_KEY = "drift_app_opened"
const FIRST_SEEN_KEY = "drift_first_seen"
const DAY_MS = 86_400_000

export function captureAppOpened(): void {
  if (typeof window === "undefined") return
  try {
    if (sessionStorage.getItem(OPENED_SESSION_KEY)) return
    sessionStorage.setItem(OPENED_SESSION_KEY, "1")
    const now = Date.now()
    const stored = Number(localStorage.getItem(FIRST_SEEN_KEY))
    const first = Number.isFinite(stored) && stored > 0 ? stored : null
    if (first === null) localStorage.setItem(FIRST_SEEN_KEY, String(now))
    capture(AnalyticsEvent.AppOpened, {
      is_first_open: first === null,
      platform: "web",
      days_since_first_open: first === null ? 0 : Math.max(0, Math.floor((now - first) / DAY_MS)),
    })
  } catch {
    /* storage throws in private mode — analytics is best-effort */
  }
}

export function trackPageview(url: string): void {
  // Not queued: a pageview for a route the user has already navigated away from
  // is noise, and initAnalytics() captures the entry route itself.
  try {
    ph?.capture("$pageview", { $current_url: url })
  } catch {
    /* noop */
  }
}
