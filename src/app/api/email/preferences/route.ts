import { NextResponse } from "next/server"
import { postEmailPreferences } from "@/lib/drift/emailPreferencesServer"
// The origin rule is one rule, shared rather than copied — see exportAccount.ts.
import { isSameOriginRequest } from "@/lib/drift/deleteAccount"
import { checkTokenPrefsRequest, mapPrefsUpstream, PREFS_NETWORK_FAILURE } from "@/lib/drift/emailPreferences"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

/** Under maxDuration, so a slow upstream becomes our JSON `network` answer
 *  instead of Vercel's HTML 504 — which the page cannot read as anything. */
const UPSTREAM_TIMEOUT_MS = 15_000

// Proxy behind the public page at /email/preferences, the one every Drift
// email's footer links to. The signed link is the credential — no session, no
// cookies — because a person must be able to opt out without signing in.
//
// The browser gate is the delete-account one all the same: our own page only,
// JSON only, and a forwarded body rebuilt field by field. The link can only
// ever change the preferences of the address it was sent to, and the edge
// function is what checks its signature. The rules live in
// lib/drift/emailPreferences.ts, where they are tested.
export async function POST(req: Request) {
  // Decided before the body is read, so another origin's payload is never
  // buffered; passed on to the checker, which refuses without it.
  const sameOrigin = isSameOriginRequest(req.headers)
  if (!sameOrigin) return json({ ok: false, code: "forbidden" }, 403)
  const checked = checkTokenPrefsRequest(req.headers, await req.text(), sameOrigin)
  if (!checked.ok) return json({ ok: false, code: checked.code }, checked.status)

  try {
    const upstream = await postEmailPreferences({
      body: JSON.stringify(checked.forward),
      contentType: "application/json",
      timeoutMs: UPSTREAM_TIMEOUT_MS,
    })
    const mapped = mapPrefsUpstream(upstream.status, upstream.text)
    return json(mapped.body, mapped.status)
  } catch {
    // Timeout or connection failure: the change may or may not have landed, so
    // the page puts the switch back and says so, rather than claiming either.
    return json({ ...PREFS_NETWORK_FAILURE.body }, PREFS_NETWORK_FAILURE.status)
  }
}

function json(body: object, status: number) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } })
}
