import type { Metadata, Viewport } from "next"
import { Analytics } from "@vercel/analytics/react"
import { SpeedInsights } from "@vercel/speed-insights/next"
import PostHogProvider from "@/components/PostHogProvider"
import MarketingTags from "@/components/MarketingTags"
import "@/styles/globals.css"

export const metadata: Metadata = {
  title: "Side Quest | 89 Days Around the World",
  description: "89 days, 10 countries, 40,000+ miles.",
  icons: { icon: "/drift-icon.svg", shortcut: "/drift-icon.svg", apple: "/drift-icon.svg" },
  other: {
    "impact-site-verification": "d801b9d7-f165-4297-814c-bd75223d116b",
  },
}

// Global viewport — applies to every route under this root layout. Pinch-zoom is
// intentionally left enabled (no maximumScale/userScalable) for accessibility;
// the iOS refresh/focus zoom is prevented by the >=16px input rule in globals.css.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&family=Inter:wght@300;400;500&family=Playfair+Display:ital,wght@0,300;0,400;0,500;1,300;1,400&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-black text-[#f5f5f7] antialiased">
        {/* PostHog (event-level funnel) wraps every React route. Static
            marketing pages load PostHog via /api/ph instead. No-ops until
            NEXT_PUBLIC_POSTHOG_KEY is set in Vercel env. */}
        {/* Travelpayouts (Drive) site verification + affiliate tracking —
            project t=551440. Was an inline <head> script; now route-scoped so
            it stays off the invite landing. See MarketingTags for the numbers. */}
        <MarketingTags />
        <PostHogProvider>{children}</PostHogProvider>
        {/* Vercel Web Analytics (pageviews/visitors/top-pages) + Speed Insights.
            Covers every React route; the static marketing landing has its own
            /_vercel/insights script tag. Requires enabling Analytics in the
            Vercel dashboard (Project → Analytics). */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
