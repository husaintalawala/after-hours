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
// Deliberately scoped narrowly rather than "everywhere except the marketing
// site": the tag is also a Travelpayouts site-verification mechanism, and the
// project is still under their review, so silently removing it from broad
// swathes of the app risks the affiliate approval. /app carries the same cost
// and is the obvious next candidate — but that is a separate call to make with
// eyes open, not a side effect of a performance fix.
const EXCLUDED_PREFIXES = ["/join"]

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
