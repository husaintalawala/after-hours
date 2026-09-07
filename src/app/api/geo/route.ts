import { NextResponse } from "next/server"
import { adsAllowedIn } from "@/lib/adRegion"

// Where is this visitor, and may the ad pixel load for them?
//
// The client cannot answer this itself — a timezone or a browser language is a
// guess, and the wrong guess here means tracking somebody whose law says ask
// first. Vercel resolves the IP at the edge and hands us the country, so the
// answer is made on the server and the client only learns yes or no.
//
// DELIBERATELY NOT MIDDLEWARE. Middleware already returns three different
// responses on this app — one of them carrying refreshed Supabase auth cookies,
// another a rewrite of the static marketing pages — so stamping a cookie onto
// all of them means touching the auth response and attaching Set-Cookie to
// cacheable static HTML. A route the client asks once per session is smaller
// and cannot break either. `/api/*` is excluded from the middleware matcher, so
// this path is untouched by any of that.
//
// The response says nothing about the visitor beyond what they already know
// about themselves, and it is never cached: a shared cache entry would hand one
// visitor's country to the next one.

export const runtime = "edge"
export const dynamic = "force-dynamic"

export function GET(request: Request) {
  // Vercel sets this at the edge. `x-vercel-ip-country` is the documented one;
  // the request geo object is checked too so this keeps working if the platform
  // moves. Absent locally, which is why the pixel does not fire in dev.
  const header = request.headers.get("x-vercel-ip-country")
  const geo = (request as Request & { geo?: { country?: string } }).geo?.country
  const country = header ?? geo ?? null

  return NextResponse.json(
    { country, adsAllowed: adsAllowedIn(country) },
    {
      headers: {
        // Per-visitor and never shared. A cached "adsAllowed: true" served to
        // somebody in Berlin is the exact failure this route exists to prevent.
        "Cache-Control": "no-store, private",
      },
    }
  )
}
