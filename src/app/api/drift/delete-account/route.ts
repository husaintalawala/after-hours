import { NextResponse } from "next/server"
import { getDriftUpstream } from "@/lib/drift/server"
import {
  checkDeleteAccountRequest,
  isSameOriginRequest,
  mapUpstreamResponse,
  NETWORK_FAILURE,
} from "@/lib/drift/deleteAccount"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

/** Under maxDuration, so a slow upstream becomes our JSON `network` answer
 *  instead of Vercel's HTML 504 — which the page cannot read as anything. */
const UPSTREAM_TIMEOUT_MS = 110_000

// Proxy to the delete-account edge function (account deletion v2).
//
// The edge function identifies the account from the JWT alone — there is no
// user id in the body — so this route cannot be pointed at somebody else's
// account. What it adds is the browser half of the gate, which the old
// body-less POST() never had: same-origin only, JSON only, and a body that is
// rebuilt field by field so nothing the person did not type reaches the
// server. All of those rules live in lib/drift/deleteAccount.ts, where they are
// tested.
export async function POST(req: Request) {
  // Origin first, on its own: the helper checks it too, but only after this
  // route has already buffered whatever body another origin chose to send.
  if (!isSameOriginRequest(req.headers)) return json({ ok: false, code: "forbidden" }, 403)
  const checked = checkDeleteAccountRequest(req.headers, await req.text())
  if (!checked.ok) return json({ ok: false, code: checked.code }, checked.status)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  let functionsBase = `${url}/functions/v1`
  let anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  let bearer = anonKey

  // `status` is answerable without a session: it is how a tab whose account was
  // deleted during a timed-out request finds out that it was. Every other mode
  // acts on the caller's own account and needs their JWT.
  if (checked.mode !== "status") {
    const up = await getDriftUpstream()
    if (!up) return json({ ok: false, code: "unauthorized" }, 401)
    functionsBase = up.functionsBase
    anonKey = up.anonKey
    bearer = up.token
  }

  try {
    const upstream = await fetch(`${functionsBase}/delete-account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
        apikey: anonKey,
      },
      body: JSON.stringify(checked.forward),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    })
    const mapped = mapUpstreamResponse(upstream.status, await upstream.text())
    return json(mapped.body, mapped.status)
  } catch {
    // Timeout or connection failure. The function may still be running — or
    // may have finished — so this is `network`, never "not deleted".
    return json({ ...NETWORK_FAILURE.body }, NETWORK_FAILURE.status)
  }
}

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } })
}
