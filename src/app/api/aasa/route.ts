import { NextResponse } from "next/server"

// Apple App Site Association — served at /.well-known/apple-app-site-association
// via a rewrite in next.config.js.
//
// WHY A ROUTE HANDLER AND NOT A STATIC FILE. The obvious move is dropping the
// file in public/.well-known/, and it is wrong twice over. The file must be
// EXTENSIONLESS, so Vercel serves it as application/octet-stream, and
// next.config's blanket header block sets `X-Content-Type-Options: nosniff` on
// every path — so nothing downstream will reinterpret it. A route handler is the
// only way to state the content type outright. Next also does not route
// dot-prefixed directories, so `src/app/.well-known/...` is not an option;
// hence the rewrite.
//
// WHY THIS IS WORTH BEING CAREFUL ABOUT. Apple's CDN negative-caches a bad
// fetch — wrong content type, a redirect, a 404 — for roughly 24 hours. This is
// not a thing you iterate on. The requirements it has to meet, all of which the
// response below satisfies: HTTPS, no redirects on the path, content type
// application/json, and reachable without authentication.
//
// The appID is <TeamID>.<BundleID>. Team KFXBP6CAM9 and bundle
// husaintalawala.Drift, from the Xcode project — note the bundle id has NO
// `com.` prefix. Drift's Info.plist does contain the string
// `com.husaintalawala.drift`, but that is a CFBundleURLName label for the
// custom scheme and is NOT the bundle identifier. Using it here would produce a
// file that looks right and never associates.
//
// `components` is scoped to /join/* deliberately. A bare "*" would make iOS
// claim every path on this host, so the marketing site and the whole /app area
// would try to open in the app for anyone who has it installed.

const AASA = {
  applinks: {
    details: [
      {
        appIDs: ["KFXBP6CAM9.husaintalawala.Drift"],
        components: [
          { "/": "/join/*", comment: "trip invite links" },
        ],
      },
    ],
  },
}

export function GET() {
  return new NextResponse(JSON.stringify(AASA), {
    status: 200,
    headers: {
      "content-type": "application/json",
      // Apple refetches periodically; an hour keeps a correction from taking a
      // day to propagate without hammering the route.
      "cache-control": "public, max-age=3600",
    },
  })
}
