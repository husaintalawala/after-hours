"use client"

import { useEffect } from "react"
import { AnalyticsEvent, capture, identifyUser } from "@/lib/analytics"

// Ties anonymous marketing/login events to the signed-in person (so the
// landing→login→signup funnel connects) and marks the authenticated app entry.
//
// login_success fires once per browser session: we can't observe the exact
// post-auth redirect without touching the (sensitive, just-shipped) callback,
// and a session-scoped "authenticated app entry" is the right funnel terminus —
// PostHog matches it to a person's prior login_attempt regardless of timing.
export default function PostHogAuthBridge({
  userId,
  method,
  isNew = false,
}: {
  /** The Supabase auth user id, and nothing else — see identifyUser below. */
  userId: string
  /** Auth provider ("email", "google", "apple"): the signup event's method. */
  method?: string | null
  /** Auth user created moments ago — this app entry is a signup, not a return. */
  isNew?: boolean
}) {
  useEffect(() => {
    // The Supabase user id is the distinct_id on BOTH platforms, so one account
    // is one person in PostHog whether they came from the phone or the browser
    // — cohorts and retention count people, not devices.
    //
    // No person properties. This used to send { email }, which put an address on
    // every identified profile; the funnel needs none of it, and this app has
    // already leaked once. Opaque ids and counts only.
    identifyUser(userId)
    try {
      const k = "ph_session_started"
      if (!sessionStorage.getItem(k)) {
        sessionStorage.setItem(k, "1")
        capture(AnalyticsEvent.LoginSuccess, { is_new_user: isNew })
        // signup is a distinct funnel step, so fire both: every signup is also
        // a login_success, and the funnel narrows from one to the other.
        if (isNew) capture(AnalyticsEvent.Signup, { method: method || "unknown" })
      }
    } catch {
      /* sessionStorage can throw in private mode — analytics is best-effort */
    }
  }, [userId, method, isNew])

  // invite_accepted. Redemption happens in a Route Handler (POST /join/<t>/accept)
  // where there is no browser to capture from, so it hands the outcome forward as
  // ?joined=1 on the trip it dropped the person into — the redirect only carries
  // that after redeem_trip_invite actually succeeded. Read from location, not
  // useSearchParams: this component sits in a layout, and the hook would drag the
  // whole subtree into client rendering. Stripped immediately so a reload can't
  // count a second join.
  useEffect(() => {
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.get("joined") !== "1") return
      capture(AnalyticsEvent.InviteAccepted)
      url.searchParams.delete("joined")
      window.history.replaceState(null, "", url.pathname + url.search + url.hash)
    } catch {
      /* analytics must never break the app */
    }
  }, [])
  return null
}
