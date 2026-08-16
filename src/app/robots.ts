import type { MetadataRoute } from "next"

/**
 * The marketing site is indexable; the app is not.
 *
 * /app/login is a door rather than a landing page, and everything behind it is
 * someone's trip — so the whole subtree is disallowed here and additionally
 * carries robots: { index: false } in src/app/app/layout.tsx. Two mechanisms
 * on purpose: robots.txt asks crawlers not to fetch, the meta tag stops a page
 * being indexed if it is reached some other way (an inbound link, a shared
 * URL). Neither alone is sufficient.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app/", "/api/"] }],
    host: "https://drift.after-hours.app",
  }
}
