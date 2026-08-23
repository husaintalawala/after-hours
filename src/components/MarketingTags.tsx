"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

// The Travelpayouts affiliate + site-verification tag, moved out of the root
// layout's <head> so it can be kept OFF pages where it has no business running.
//
// WHY THIS EXISTS. Measured on the production invite landing page: TTFB was
// 187ms and DOMContentLoaded was 4013ms. The gap was almost entirely this tag's
// cascade — tpembars.com pulls in travelpayouts.com/check_auth (2715ms on its
// own), securepubads.g.doubleclick.net/gampad/ads, pagead2.googlesyndication.com,
// static.doubleclick.net/instream/ad_status.js and sentry.avs.io (Aviasales'
// error reporting, not ours). 48 requests on a page whose entire job is showing
// one trip to one stranger. The root layout paints bg-black, so all of that
// reads as several seconds of blank screen.
//
// /join is where an invited stranger forms their first impression of Drift, and
// there is not a single affiliate link on it. Loading an ad network there costs
// conversion and buys nothing.
//
// /app and /auth are excluded for the same reason, measured on /app/login:
// 29 ad-stack requests totalling 4998ms of network time on a page with 51
// resources. DOMContentLoaded is fine there (173ms) because the cascade loads
// after it — but 29 third-party requests still compete with the app's own for
// connections and main thread, which is what "the site feels slow" is made of.
//
// Nothing behind the login has an affiliate link on it, and no crawler sees it
// (the /app tree is robots: noindex by its own layout), so the tag was pure
// cost there.
//
// WHAT IS DELIBERATELY LEFT: /trip/<id>, the public share page. That one is
// crawlable and is a plausible place for booking intent, so it keeps the tag.
//
// ⚠️ SEPARATE ISSUE, NOT FIXED HERE: the static marketing site — the actual
// homepage at drift.after-hours.app/, which middleware rewrites to
// public/drift/index.html — has NEVER carried this tag. Grep it: zero
// occurrences. So Travelpayouts' verification crawler, which would look at the
// homepage, has been finding nothing all along, while the tag burned two
// seconds a page inside the logged-in app. Fixing that is an affiliate
// decision, not a performance one.
const EXCLUDED_PREFIXES = ["/join", "/app", "/auth"]

export default function MarketingTags() {
  const pathname = usePathname()
  const excluded = EXCLUDED_PREFIXES.some(
    (p) => pathname === p || pathname?.startsWith(p + "/")
  )

  useEffect(() => {
    if (excluded) return
    // Same injection the inline <head> script did, now gated. Guarded against
    // double-insertion across client-side navigations.
    if (document.querySelector('script[data-tp-tag="1"]')) return
    const s = document.createElement("script")
    s.async = true
    s.src = "https://tpembars.com/NTUxNDQw.js?t=551440"
    s.dataset.tpTag = "1"
    document.head.appendChild(s)
  }, [excluded])

  return null
}
