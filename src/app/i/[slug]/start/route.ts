import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  GUIDE_COOKIE,
  GUIDE_COOKIE_MAX_AGE,
  isGuideSlug,
} from "@/lib/drift/inspire"

// "Make this trip mine" — the one door out of the public guide.
//
// THE DESTINATION HAS TO SURVIVE A SIGN-IN. The guide is read by strangers, and
// the tailor screen it leads to lives inside /app/(protected), whose layout
// redirects a signed-out visitor to /app/login. That redirect carries no return
// path, so somebody who read the whole guide, clicked the button and signed in
// landed on the app home with no idea which trip they had been promised.
//
// A Route Handler rather than a plain link because a cookie has to be written
// and a Server Component cannot write one (Next 15: cookies are read-only
// there). The cookie is the mechanism the invite flow already proved — see
// GUIDE_COOKIE for why the destination cannot ride `?next=` through Supabase's
// redirect allow-list — and it works identically for magic link and OAuth.
//
// SameSite=Lax is load-bearing: the user leaves for Google or for their mail
// client and returns on a cross-site top-level GET, which Lax cookies are sent
// on and Strict cookies are not.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const { origin } = new URL(request.url)

  // Junk slug: nothing to look up and nothing worth writing down. The shelf is
  // a better landing than a 404 for a link that was probably mistyped.
  if (!isGuideSlug(slug)) {
    const dead = NextResponse.redirect(`${origin}/app/inspire`)
    dead.cookies.delete(GUIDE_COOKIE)
    return dead
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("inspire_trips")
    .select("trip_id")
    .eq("slug" as never, slug as never)
    .eq("is_active", true)
    .maybeSingle()
    .returns<{ trip_id: string } | null>()

  // Back to the guide itself, which answers a missing row with its own 404 —
  // one place decides what a dead slug looks like. The cookie goes with it:
  // there is no trip to come back to, and a destination that cannot be reached
  // would otherwise keep hijacking the /app landing for two hours.
  if (error || !data?.trip_id) {
    if (error) console.error("[i/[slug]/start] lookup failed", slug, error)
    const dead = NextResponse.redirect(`${origin}/i/${slug}`)
    dead.cookies.delete(GUIDE_COOKIE)
    return dead
  }

  const response = NextResponse.redirect(`${origin}/app/inspire/${data.trip_id}`)

  // Signed in already: the redirect lands on the pattern directly, so there is
  // nothing to remember — and clearing here is what stops a stale cookie from
  // bouncing every later visit to /app back into this trip.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (session?.user) {
    response.cookies.delete(GUIDE_COOKIE)
    return response
  }

  // Signed out: the protected layout is about to send them to login. Write down
  // where they were going first — the /app landing brings them back.
  response.cookies.set(GUIDE_COOKIE, slug, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUIDE_COOKIE_MAX_AGE,
  })
  return response
}
