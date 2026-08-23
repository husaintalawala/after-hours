const nextConfig = {
  images: {
    // Vercel-native optimization (resize + WebP/AVIF + edge cache) is allowed
    // ONLY for Mapbox static maps and user-uploaded photos on our CloudFront
    // CDN. Google Place Photos (streamed via the maps-photo proxy) are NEVER
    // listed here and never rendered through next/image — Google Places ToS
    // §3.2.3 forbids re-hosting/caching Place Photo bytes. The host allow-list
    // in OptimizedImg is the second guard: any non-listed URL falls back to a
    // plain, unoptimized, uncached <img>.
    remotePatterns: [
      { protocol: "https", hostname: "api.mapbox.com" },
      { protocol: "https", hostname: "d309w7wk5bnk1z.cloudfront.net" },
    ],
  },
  experimental: {
    // The itinerary PDF reads its brand TTFs off disk at render time. Nothing
    // imports those files, so tracing wouldn't ship them with the function and
    // the export would silently fall back to Helvetica in production.
    // Both keys on purpose — the app-router entry is keyed "…/route", and the
    // bare path is what the docs show. Verified against the emitted
    // .next/server/app/api/drift/itinerary-pdf/route.js.nft.json.
    outputFileTracingIncludes: {
      "/api/drift/itinerary-pdf": ["./src/lib/pdf/fonts/**"],
      "/api/drift/itinerary-pdf/route": ["./src/lib/pdf/fonts/**"],
    },
  },
  // Security response headers. There were none at all — confirmed by curling
  // production — so every one of these was absent in the live response.
  //
  // Deliberately NOT adding a blocking Content-Security-Policy here: this app
  // loads Mapbox, Google Maps, PostHog and a third-party affiliate script, and
  // a CSP written without measuring which origins those actually pull would
  // break the site. That one is tracked separately and wants Report-Only data
  // first, not a guess shipped days before a review.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Vercel terminates TLS; this stops a downgrade on a subsequent visit.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // Stops MIME sniffing turning an upload into executable script.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Clickjacking. Nothing in this app is meant to be framed.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          // Don't leak trip ids / place ids in the Referer to third parties.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Only the capabilities the web app actually uses. geolocation is
          // left enabled for self — the discover flow uses it.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)" },
        ],
      },
    ]
  },
  // Apple requires the association file at this exact extensionless path. Next
  // will not route a dot-prefixed directory, and a static public/ file cannot
  // carry a content type past the blanket nosniff header above — so the path is
  // rewritten onto a route handler that sets it explicitly. See
  // src/app/api/aasa/route.ts. `beforeFiles` so nothing in public/ or the
  // marketing tree can shadow it.
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/.well-known/apple-app-site-association",
          destination: "/api/aasa",
        },
      ],
      afterFiles: [],
      fallback: [],
    }
  },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  env: {
    // Expose the Vercel project var MAPBOX_PUBLIC_TOKEN to client code
    // (pk.* public token — same one the iOS binary ships).
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.MAPBOX_PUBLIC_TOKEN,
  },
}
module.exports = nextConfig
