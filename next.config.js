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
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  env: {
    // Expose the Vercel project var MAPBOX_PUBLIC_TOKEN to client code
    // (pk.* public token — same one the iOS binary ships).
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.MAPBOX_PUBLIC_TOKEN,
  },
}
module.exports = nextConfig
