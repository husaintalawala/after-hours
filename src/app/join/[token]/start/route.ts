import { NextResponse, type NextRequest } from "next/server"
import {
  INVITE_COOKIE,
  INVITE_COOKIE_MAX_AGE,
  isValidInviteToken,
} from "@/lib/drift/invite"

// "Sign in to join" — stash the token, then hand off to the normal login.
//
// A Route Handler rather than a link straight to /app/login because a cookie has
// to be written, and a Server Component cannot write one (Next 15 throws:
// cookies are read-only there). This is the only place the invite is recorded
// for the trip through auth and back.
//
// SameSite=Lax is the load-bearing attribute. The user leaves for Google or for
// their mail client and returns via a cross-site top-level GET navigation —
// which Lax cookies are sent on, and Strict cookies are not. Strict here would
// mean the invite silently vanishes for every OAuth and magic-link joiner,
// which is the exact failure this flow exists to remove.
//
// httpOnly because nothing in the browser needs to read it, and the token is a
// capability: whoever holds it can join the trip.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const { origin } = new URL(request.url)

  const response = NextResponse.redirect(`${origin}/app/login`)
  if (!isValidInviteToken(token)) {
    // Junk token: still send them to login rather than a dead end, but do not
    // write it — the /app landing would just bounce off it forever.
    return response
  }

  response.cookies.set(INVITE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: INVITE_COOKIE_MAX_AGE,
  })
  return response
}
