import { NextResponse } from "next/server"
import { getDriftUpstream } from "@/lib/drift/server"
import { postEmailPreferences } from "@/lib/drift/emailPreferencesServer"
// The origin rule is one rule, shared rather than copied — see exportAccount.ts.
import { isSameOriginRequest } from "@/lib/drift/deleteAccount"
import { checkSessionPrefsRequest, mapPrefsUpstream, PREFS_NETWORK_FAILURE } from "@/lib/drift/emailPreferences"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

/** Under maxDuration, so a slow upstream becomes our JSON `network` answer
 *  instead of Vercel's HTML 504 — which the page cannot read as anything. */
const UPSTREAM_TIMEOUT_MS = 15_000

// Proxy behind Settings › Email: the signed-in person's own email preferences.
// Same browser gate as delete-account and export-account — same-origin only,
// JSON only, a forwarded body rebuilt field by field — and the same identity
// rule: the edge function reads the account from the JWT, so there is no
// address or user id in the body that could point this at someone else.
export async function POST(req: Request) {
  const sameOrigin = isSameOriginRequest(req.headers)
  if (!sameOrigin) return json({ ok: false, code: "forbidden" }, 403)
  const checked = checkSessionPrefsRequest(req.headers, await req.text(), sameOrigin)
  if (!checked.ok) return json({ ok: false, code: checked.code }, checked.status)

  const up = await getDriftUpstream()
  if (!up) return json({ ok: false, code: "unauthorized" }, 401)

  try {
    const upstream = await postEmailPreferences({
      body: JSON.stringify(checked.forward),
      contentType: "application/json",
      bearer: up.token,
      timeoutMs: UPSTREAM_TIMEOUT_MS,
    })
    const mapped = mapPrefsUpstream(upstream.status, upstream.text)
    return json(mapped.body, mapped.status)
  } catch {
    return json({ ...PREFS_NETWORK_FAILURE.body }, PREFS_NETWORK_FAILURE.status)
  }
}

function json(body: object, status: number) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } })
}
