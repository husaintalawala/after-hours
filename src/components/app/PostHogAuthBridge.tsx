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
  email,
}: {
  userId: string
  email?: string | null
}) {
  useEffect(() => {
    identifyUser(userId, email ? { email } : undefined)
    try {
      const k = "ph_session_started"
      if (!sessionStorage.getItem(k)) {
        sessionStorage.setItem(k, "1")
        capture(AnalyticsEvent.LoginSuccess)
      }
    } catch {
      /* sessionStorage can throw in private mode — analytics is best-effort */
    }
  }, [userId, email])
  return null
}
