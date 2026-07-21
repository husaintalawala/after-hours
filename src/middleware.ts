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
  if (isAppPath(pathname, "/app") || isAppPath(pathname, "/auth")) {
    return await updateSession(req);
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
  // Run on everything except Next internals and API routes.
  matcher: ["/((?!_next/|api/).*)"],
};
