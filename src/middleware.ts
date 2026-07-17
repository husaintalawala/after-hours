import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Serve the Drift marketing site (static files in /public/drift) on the
// drift.after-hours.app subdomain, while after-hours.app itself is untouched.
// Clean URLs: "/" -> /drift/index.html, "/privacy" -> /drift/privacy.html,
// "/styles.css" -> /drift/styles.css.
export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();
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
