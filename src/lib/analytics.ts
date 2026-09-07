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
  if (typeof window === "undefined") return
  // Independent of PostHog: either can be configured without the other, so the
  // pixel must not sit behind PostHog's early return below.
  initMetaPixel()
  if (initStarted) return
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
        // Unhandled errors and promise rejections into PostHog's Error
        // tracking. Web captured NO client-side errors before this — Vercel's
        // logs only ever saw the server half, so a component that threw in the
        // browser failed silently and invisibly. Same SDK already on the page:
        // no second vendor, no second key. sanitize_properties above still
        // applies, so a capability URL cannot ride along in a stack frame.
        capture_exceptions: true,
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
  metaCapture(event)
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

// ── Meta pixel ───────────────────────────────────────────────────────────────
// The ad side of the funnel. PostHog answers "what are people doing"; the pixel
// answers "which ad caused it", which is the one question a paid campaign
// cannot run without — Meta optimises delivery toward a conversion it can see.
//
// OFF UNTIL CONFIGURED. No NEXT_PUBLIC_META_PIXEL_ID, no script, no requests,
// exactly like the PostHog key above. Nothing changes for anyone until the ID
// is set in Vercel.
//
// SCOPED TO DRIFT. This repo also serves the Side Quest portfolio on
// after-hours.app, and loading an ad tracker on a personal site because it
// shares a Next app would be wrong. Only drift.* hosts and the Drift path
// carve-out (which serves on every host, localhost included) get the pixel.
//
// NO IDENTIFYING DATA, same rule as the rest of this module. Advanced matching
// is explicitly disabled and no email, name or user id is ever passed — the
// pixel sees a URL and its own cookie, nothing we hand it.
//
// GEOGRAPHY-GATED. An ad pixel is not strictly necessary for the site to work,
// so the EEA and the UK require consent before it loads and this app has no
// consent banner. Rather than track those visitors anyway, the pixel simply does
// not load for them: /api/geo resolves the country at the edge and answers yes or
// no, and the answer FAILS CLOSED — unknown means no. See src/lib/adRegion.ts.
//
// That is a geography gate, not consent. It keeps the pixel away from people
// whose law requires asking; it does not ask anybody. Serving ads to the EEA/UK
// needs a real banner first.
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID

/** Our events → Meta STANDARD events, which are the ones a campaign can
 *  optimise toward. Signup is the conversion that matters for acquisition.
 *  Everything else below is sent as a custom event instead of being forced into
 *  a standard name that means something else. */
const META_STANDARD: Record<string, string> = {
  [AnalyticsEvent.Signup]: "CompleteRegistration",
}

/** Sent to Meta under their own names, for custom conversions. Deliberately
 *  short: every extra event is another thing leaving the browser, and an
 *  optimiser given six goals has none. */
const META_CUSTOM = new Set<string>([
  AnalyticsEvent.CreateTrip,
  AnalyticsEvent.TripActivated,
])

type FbqFn = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void
  queue: unknown[]
  loaded?: boolean
  version?: string
  push?: unknown
}

type FbWindow = Window & { fbq?: FbqFn; _fbq?: FbqFn }

let metaStarted = false
/** True once geo said no, so metaCapture stops asking whether fbq exists. */
let metaBlocked = false

/** True on the Drift halves of this app — see SCOPED TO DRIFT above. */
function isDriftSurface(): boolean {
  if (typeof window === "undefined") return false
  if (window.location.hostname.toLowerCase().startsWith("drift.")) return true
  return /^\/(app|auth|trip|join|i)(\/|$)/.test(window.location.pathname)
}

function fbq(...args: unknown[]): void {
  ;(window as FbWindow).fbq?.(...args)
}

/** Only a DENIAL is cached, never a permission — see adsAllowedHere. */
const GEO_DENIED_KEY = "drift_ads_denied"

async function adsAllowedHere(): Promise<boolean> {
  // ONLY THE "NO" IS CACHED, and that asymmetry is deliberate.
  //
  // Caching the "yes" was wrong three ways at once. It outlived the IP that
  // produced it, so a visitor who loaded a page through a US VPN and then turned
  // it off kept the pixel for the rest of the tab. sessionStorage survives
  // session restore and tab duplication, so the decision could follow a laptop
  // onto a plane and land in Frankfurt still saying yes. And it sat in a store
  // any script on the origin can write, so a single XSS could switch tracking on
  // permanently by planting one character.
  //
  // Caching only the denial removes all three: a stale "no" merely under-tracks,
  // and the plantable direction is now the safe one. The permission is re-asked
  // per document load, which is what it cost anyway — module state already stops
  // it being re-asked per client navigation.
  try {
    if (sessionStorage.getItem(GEO_DENIED_KEY) === "1") return false
  } catch {
    /* private mode — fall through and just ask */
  }
  try {
    const res = await fetch("/api/geo", { cache: "no-store" })
    if (!res.ok) return false
    const body = (await res.json()) as { adsAllowed?: unknown }
    // Strict: only a real boolean true opens the gate. A missing field, a
    // string "true", or an HTML error page parsed into something else all fail.
    const allowed = body.adsAllowed === true
    if (!allowed) {
      try {
        sessionStorage.setItem(GEO_DENIED_KEY, "1")
      } catch {
        /* noop */
      }
    }
    return allowed
  } catch {
    // Network failure, blocked request, malformed answer — all of it means we do
    // not know where this visitor is, and unknown means no. Not cached: a
    // transient failure should not disable the pixel for the whole session.
    return false
  }
}

function initMetaPixel(): void {
  if (metaStarted || typeof window === "undefined") return
  if (!META_PIXEL_ID || !isDriftSurface()) return
  // Claim the slot before the await so two calls in the same tick cannot both
  // load the pixel.
  metaStarted = true
  void adsAllowedHere()
    .then((allowed) => {
      if (allowed) loadMetaPixel()
      else metaBlocked = true
    })
    // adsAllowedHere() catches its own failures and resolves false, so this
    // cannot fire today. It is here so the safety property does not depend on
    // that staying true: if the gate ever rejects, the answer is still no.
    .catch(() => {
      metaBlocked = true
    })
}

function loadMetaPixel(): void {
  try {
    const w = window as FbWindow
    if (!w.fbq) {
      // Meta's loader, written out rather than eval'd from their minified
      // snippet: same behaviour, and it type-checks.
      const q: FbqFn = function (...args: unknown[]) {
        if (q.callMethod) q.callMethod(...args)
        else q.queue.push(args)
      } as FbqFn
      q.queue = []
      q.loaded = true
      q.version = "2.0"
      q.push = q
      w.fbq = q
      w._fbq = q
      const tag = document.createElement("script")
      tag.async = true
      tag.src = "https://connect.facebook.net/en_US/fbevents.js"
      document.head.appendChild(tag)
    }
    // Before init: autoConfig off stops Meta collecting button text and form
    // field names on its own, which is how a pixel picks up data nobody chose
    // to send it.
    fbq("set", "autoConfig", false, META_PIXEL_ID)
    fbq("init", META_PIXEL_ID)
    fbq("track", "PageView")
  } catch {
    /* analytics must never break the app */
  }
}

/** Mirror one funnel event to the pixel, if it is one Meta should hear about. */
function metaCapture(event: string): void {
  // `metaStarted` is claimed before the geo answer arrives, so it is not proof
  // the pixel loaded — the presence of fbq is. An event fired during the lookup
  // is dropped rather than queued: a conversion Meta hears about a second late
  // is worth less than the certainty that nothing leaks before the gate answers.
  if (!metaStarted || metaBlocked) return
  if (!(window as FbWindow).fbq) return
  try {
    const standard = META_STANDARD[event]
    if (standard) fbq("track", standard)
    else if (META_CUSTOM.has(event)) fbq("trackCustom", event)
  } catch {
    /* noop */
  }
}

export function trackPageview(url: string): void {
  // Not queued: a pageview for a route the user has already navigated away from
  // is noise, and initAnalytics() captures the entry route itself.
  try {
    // The App Router is a SPA after first load, so the pixel's own automatic
    // PageView fires once and never again. Client navigations need this.
    if (metaStarted && !metaBlocked && (window as FbWindow).fbq) fbq("track", "PageView")
    ph?.capture("$pageview", { $current_url: url })
  } catch {
    /* noop */
  }
}
