import { postEmailPreferences } from "@/lib/drift/emailPreferencesServer"
import {
  checkOneClickRequest,
  mapOneClickUpstream,
  ONE_CLICK_BODY,
  ONE_CLICK_CONTENT_TYPE,
  ONE_CLICK_TEXT,
  oneClickUpstreamQuery,
  preferencesPath,
  readToken,
} from "@/lib/drift/emailPreferences"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

/** Well under maxDuration, and short: a mailbox provider waits on this answer,
 *  and a slow one is better reported as a failure it can retry than as a hang. */
const UPSTREAM_TIMEOUT_MS = 10_000

// The List-Unsubscribe address in every optional Drift email (RFC 8058).
//
// POST is the one-click unsubscribe itself. Gmail, Yahoo and others send it from
// their own servers when someone presses "Unsubscribe" beside the sender's name:
// no browser, no cookies, no redirect followed — so none is used. The token in
// the query names the address and the kind of letter; the edge function
// verifies it and records the opt-out. The rules live in
// lib/drift/emailPreferences.ts, where they are tested.
//
// GET is a person (or a link scanner) opening the same address. It changes
// nothing — a scanner pre-fetching links must never unsubscribe anybody, which
// is exactly why RFC 8058 moved the action to POST — and sends them to the
// preferences page instead.
export async function POST(req: Request) {
  const checked = checkOneClickRequest(req.url, req.headers.get("content-type"), await req.text())
  if (!checked.ok) return text(ONE_CLICK_TEXT[checked.code], checked.status)

  try {
    const upstream = await postEmailPreferences({
      query: oneClickUpstreamQuery(checked.token),
      // Canonical form whichever permitted encoding arrived: the edge function
      // then has one body shape to parse, not two.
      body: ONE_CLICK_BODY,
      contentType: ONE_CLICK_CONTENT_TYPE,
      timeoutMs: UPSTREAM_TIMEOUT_MS,
    })
    const mapped = mapOneClickUpstream(upstream.status, upstream.text, upstream.contentType)
    return text(mapped.text, mapped.status)
  } catch {
    // Timeout or connection failure. Nothing is known to be recorded, so this is
    // never reported as done.
    return text(ONE_CLICK_TEXT.network, 502)
  }
}

export async function GET(req: Request) {
  const token = readToken(new URL(req.url).searchParams.get("t"))
  return new Response(null, {
    status: 303,
    headers: { location: preferencesPath(token), "cache-control": "no-store" },
  })
}

function text(body: string, status: number) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  })
}
