import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Serve the preserved Side Quest homepage on rashu.after-hours.app and the
// Drift marketing site (static files in /public/drift) on drift.after-hours.app.
// Clean URLs: "/" -> /drift/index.html, "/privacy" -> /drift/privacy.html,
// "/styles.css" -> /drift/styles.css.

/** Directories under /public that belong to the LOGGED-IN APP, not to the
 *  marketing site — exempt from the rewrite below. Add one here the moment you
 *  add one to /public, or its files will 404 as HTML. */
const APP_ASSET_DIRS = ["/cta/", "/brand/", "/fonts/"];
export async function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  const pathname = req.nextUrl.pathname;

  // Keep the former Drift host as a compatibility entry point. A temporary
  // redirect preserves invite tokens, guide slugs, deep paths and query strings
  // while the new domain is verified. Do not change the After Hours apex.
  // Native app association files must answer directly on the OLD host for
  // already-shipped iOS/Android apps. Auth callbacks also stay here while
  // outstanding OAuth PKCE and emailed sign-in links finish on their origin.
  // POST routes are excluded so legacy invite and unsubscribe submissions are
  // never replayed across hosts.
  if (
    host === "drift.after-hours.app" &&
    (req.method === "GET" || req.method === "HEAD") &&
    pathname !== "/.well-known/apple-app-site-association" &&
    pathname !== "/.well-known/assetlinks.json" &&
    pathname !== "/auth" &&
    !pathname.startsWith("/auth/")
  ) {
    const destination = new URL(req.nextUrl.pathname + req.nextUrl.search, "https://usedrift.ai");
    return NextResponse.redirect(destination, 307);
  }

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

  // /email/preferences is where the Unsubscribe and Email preferences links in
  // every optional Drift email land. Same shape of problem as /i: a root path
  // with no extension, on the host the links point at, so the marketing rewrite
  // would 404 every one of them — an unsubscribe link that does not work.
  // NextResponse.next(), not updateSession: the page is signed out by design and
  // reads no cookies.
  if (pathname === "/email" || pathname.startsWith("/email/")) {
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
  //
  // AND THE DIRECTORIES BELOW THEM. The rewrite rewrites EVERYTHING on this
  // host, and an extension only saves a path from having `.html` glued on — it
  // still gets the `/drift` prefix. So /cta/create-trip.png was asked of the
  // marketing site as /drift/cta/create-trip.png and came back as a 404 page
  // with `content-type: text/html`, which a browser renders as a broken image
  // rather than an error anybody would notice in a log. Every asset the logged
  // -in app serves out of /public needs to be listed here or it will disappear
  // exactly this quietly.
  if (
    pathname === "/drift-logo.png" ||
    pathname === "/drift-icon.svg" ||
    pathname === "/favicon.svg" ||
    APP_ASSET_DIRS.some((dir) => pathname.startsWith(dir))
  ) {
    return NextResponse.next();
  }

  // Keep the original sabbatical page and all of its assets in this project.
  // The public hostname changes; the old page's implementation does not.
  if (host === "rashu.after-hours.app" && pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/side-quest";
    return NextResponse.rewrite(url);
  }

  // --- Legacy Drift marketing landing ---
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
