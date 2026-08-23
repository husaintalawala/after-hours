import { NextResponse, type NextRequest } from "next/server"
import { INVITE_COOKIE } from "@/lib/drift/invite"

// "Not now" — drop the pending invite and go to the app.
//
// Exists because the /app landing redirects to /join whenever the invite cookie
// is set. Without a way to clear it, someone who decides not to join would be
// bounced back to the invite on every visit to their own home screen until the
// cookie expired. The invite itself is untouched: the link still works if they
// change their mind, this only stops the app nagging them about it.
export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url)
  const response = NextResponse.redirect(`${origin}/app`, 303)
  response.cookies.delete(INVITE_COOKIE)
  return response
}
