import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { INVITE_COOKIE, isValidInviteToken } from "@/lib/drift/invite"

// Redeem the invite. POSTed from the form on /join/<token>.
//
// A Route Handler for two reasons: it clears the invite cookie (impossible in a
// Server Component, which has a read-only cookie store), and redeeming is a
// state change that should not happen on a GET a mail scanner might prefetch.
//
// Every redirect out of here is 303. A POST redirected with the default 307
// replays the POST at the destination — the trip page would receive a POST and
// 405. 303 is what converts the follow-up to a GET.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const { origin } = new URL(request.url)

  if (!isValidInviteToken(token)) {
    return NextResponse.redirect(`${origin}/join/${encodeURIComponent(token)}`, 303)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Session expired between rendering the page and submitting it: route back
  // through /start so the token is stashed and they land here again after login.
  if (!user) {
    return NextResponse.redirect(`${origin}/join/${token}/start`, 303)
  }

  const { data, error } = await supabase.rpc(
    "redeem_trip_invite" as never,
    { p_token: token } as never
  )

  const response = (() => {
    if (error) {
      // The RPC raises P0002 for every unusable-token case (missing, revoked,
      // expired, used up). Send them back to the landing page, which re-previews
      // the token and renders the specific reason — better than inventing a
      // message here that might not match what the server actually decided.
      return NextResponse.redirect(`${origin}/join/${token}`, 303)
    }
    const tripId = ((data as { trip_id?: string }[] | null) ?? [])[0]?.trip_id
    return NextResponse.redirect(
      tripId ? `${origin}/app/trips/${tripId}` : `${origin}/app`,
      303
    )
  })()

  // Cleared on success AND on failure. A token that the server just refused is
  // never going to work, and leaving it set would make the /app landing bounce
  // the user back to a dead invite on every visit until the cookie expires.
  response.cookies.delete(INVITE_COOKIE)
  return response
}
