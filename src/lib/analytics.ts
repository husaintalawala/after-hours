import posthog from "posthog-js"

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
} as const

// Guarded by a module flag rather than posthog's internals: until the Vercel env
// vars are set the whole thing is a silent no-op, so callers never need to check.
let initialized = false

export function initAnalytics(): void {
  if (initialized || typeof window === "undefined") return
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) return // not configured yet (no key in Vercel env) → stay a no-op
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    capture_pageview: false, // manual $pageview on App Router client navigation
    capture_pageleave: true,
    autocapture: true,
    person_profiles: "identified_only",
  })
  initialized = true
}

export function capture(event: string, props?: Record<string, unknown>): void {
  if (!initialized) return
  try {
    posthog.capture(event, props)
  } catch {
    /* analytics must never break the app */
  }
}

export function identifyUser(id: string, props?: Record<string, unknown>): void {
  if (!initialized) return
  try {
    posthog.identify(id, props)
  } catch {
    /* noop */
  }
}

export function trackPageview(url: string): void {
  if (!initialized) return
  try {
    posthog.capture("$pageview", { $current_url: url })
  } catch {
    /* noop */
  }
}

export { posthog }
