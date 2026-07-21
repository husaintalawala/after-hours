const nextConfig = {
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  env: {
    // Expose the Vercel project var MAPBOX_PUBLIC_TOKEN to client code
    // (pk.* public token — same one the iOS binary ships).
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.MAPBOX_PUBLIC_TOKEN,
  },
}
module.exports = nextConfig
