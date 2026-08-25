import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Serve the Drift marketing site (static files in /public/drift) on the
// drift.after-hours.app subdomain, while after-hours.app itself is untouched.
// Clean URLs: "/" -> /drift/index.html, "/privacy" -> /drift/privacy.html,
// "/styles.css" -> /drift/styles.css.
export async function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  const pathname = req.nextUrl.pathname;

  // --- Drift logged-in web app (additive; owned by the app workstream) ---
  // /app and /auth are real Next.js routes behind a Supabase auth gate.
  // They must bypass the static /public/drift rewrite below. This runs on
  // ALL hosts (localhost during dev, drift.after-hours.app in prod) so the
  // auth-session cookie is refreshed on every app request.
  const isAppPath = (p: string, base: string) =>
    p === base || p.startsWith(base + "/");
  // /trip/[id] is the PUBLIC share page (anon-key fetch, no auth gate) — the
  // marketing outro's "wander through a live trip" links there, and share
  // links use it too. Without this carve-out the marketing rewrite turns it
  // into /drift/trip/<id>.html, which does not exist → 404.
  // Apple's association file must be served verbatim from this exact path, with
  // no redirect. The matcher below DOES match it (only _next/, api/ and _vercel/
  // are excluded), and because the path has no trailing extension the marketing
  // rewrite would ask for /drift/.well-known/apple-app-site-association.html —
  // a 404. Apple then negative-caches that for ~24h, so getting this wrong is a
  // day-long mistake rather than a quick fix. Bail out before any of that; the
  // rewrite onto the route handler lives in next.config.js. No session work:
  // Apple fetches it unauthenticated and must always be able to.
  if (pathname === "/.well-known/apple-app-site-association") {
    return NextResponse.next();
  }

  // /i/<slug> is the PUBLIC guide — a curated trip, whole, for somebody with no
  // account. It is a root path with no file extension, so the marketing rewrite
  // at the bottom would ask for /drift/i/<slug>.html and 404 every share link
  // ever sent, on the one host they are sent from. Carved out ABOVE it.
  //
  // NextResponse.next(), not updateSession: this page reads no cookies and
  // renders identically signed in or out, so there is no session to refresh —
  // and share links are hit by crawlers and link unfurlers, none of which
  // should be spending an auth round trip.
  if (pathname === "/i" || pathname.startsWith("/i/")) {
    return NextResponse.next();
  }

  // /join/<token> is the invite landing page. Public — the whole point is that a
  // signed-out stranger can see the trip before deciding to sign up — but it
  // runs through updateSession because the page branches on whether there is
  // already a session, and its route handlers read and write auth cookies.
  if (
    isAppPath(pathname, "/app") ||
    isAppPath(pathname, "/auth") ||
    isAppPath(pathname, "/trip") ||
    isAppPath(pathname, "/join")
  ) {
    return await updateSession(req);
  }

  // App-owned brand assets live at the root (referenced by the app header +
  // favicon metadata). They must be served from Next's /public, not swallowed
  // by the marketing rewrite below — otherwise the logo shows a broken image
  // and the tab has no favicon on drift.after-hours.app.
  if (
    pathname === "/drift-logo.png" ||
    pathname === "/drift-icon.svg" ||
    pathname === "/favicon.svg"
  ) {
    return NextResponse.next();
  }

  // --- Marketing landing (owned by the marketing workstream) — unchanged ---
  if (host !== "drift.after-hours.app") return NextResponse.next();

  const url = req.nextUrl.clone();
  let path = url.pathname;
  if (path === "/") path = "/index.html";
  else if (!/\.[a-zA-Z0-9]+$/.test(path)) path = path.replace(/\/+$/, "") + ".html";
  url.pathname = "/drift" + path;
  return NextResponse.rewrite(url);
}

export const config = {
  // Run on everything except Next internals, API routes, and the Vercel
  // Analytics/Speed-Insights endpoints (/_vercel/insights/*) — the latter must
  // reach Vercel's handler, not get swallowed by the marketing rewrite.
  matcher: ["/((?!_next/|api/|_vercel/).*)"],
};
