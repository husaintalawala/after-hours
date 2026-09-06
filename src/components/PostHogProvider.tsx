"use client"

import { Suspense, useEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { captureAppOpened, initAnalytics, trackPageview } from "@/lib/analytics"

// App Router is a SPA after the first load, so posthog's automatic pageview
// capture is off (see analytics.ts) and we fire $pageview on every client
// navigation here. useSearchParams forces client rendering of its subtree, so
// it lives in its own <Suspense> island — otherwise it deopts the whole app to
// client-side rendering and breaks static generation at build time.
function Pageview() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  useEffect(() => {
    if (!pathname) return
    let url = window.location.origin + pathname
    const qs = searchParams?.toString()
    if (qs) url += "?" + qs
    trackPageview(url)
  }, [pathname, searchParams])
  return null
}

export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initAnalytics()
    // After init, so the event is queued rather than dropped while the posthog
    // chunk loads. Fires for signed-out visitors too — an invite landing page is
    // an app open, and it is the same person once they sign in.
    captureAppOpened()
  }, [])
  // No <PHProvider> wrapper: nothing in the app uses posthog-js/react's hooks,
  // and importing it here would statically pull posthog-js into the shared
  // bundle — the exact cost initAnalytics()'s dynamic import avoids.
  return (
    <>
      <Suspense fallback={null}>
        <Pageview />
      </Suspense>
      {children}
    </>
  )
}
