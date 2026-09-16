import { NextResponse } from "next/server"
import { getDriftUpstream } from "@/lib/drift/server"
// The origin rule is one rule, shared rather than copied — see exportAccount.ts.
import { isSameOriginRequest } from "@/lib/drift/deleteAccount"
import {
  checkExportAccountRequest,
  EXPORT_NETWORK_FAILURE,
  mapExportUpstream,
} from "@/lib/drift/exportAccount"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/** Comfortably above the edge function's own ~20s assembly box and below
 *  maxDuration, so a slow upstream becomes our JSON `network` answer instead of
 *  Vercel's HTML 504 — which the page cannot read as anything. */
const UPSTREAM_TIMEOUT_MS = 30_000

// Proxy to the export-account edge function (the portability half of account
// deletion). Same browser gate as delete-account: same-origin only, JSON only,
// and a forwarded body rebuilt field by field. The function identifies the
// account from the JWT alone, so this route cannot be pointed at somebody
// else's data. The rules live in lib/drift/exportAccount.ts, where they are
// tested.
//
// Every mode needs a session: unlike delete-account's `status`, there is no
// answer here that is safe to give without one.
export async function POST(req: Request) {
  // Decided before the body is read, so another origin's payload is never
  // buffered; passed on to the checker, which refuses without it.
  const sameOrigin = isSameOriginRequest(req.headers)
  if (!sameOrigin) return json({ ok: false, code: "forbidden" }, 403)
  const checked = checkExportAccountRequest(req.headers, await req.text(), sameOrigin)
  if (!checked.ok) return json({ ok: false, code: checked.code }, checked.status)

  const up = await getDriftUpstream()
  if (!up) return json({ ok: false, code: "unauthorized" }, 401)

  try {
    const upstream = await fetch(`${up.functionsBase}/export-account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${up.token}`,
        apikey: up.anonKey,
      },
      body: JSON.stringify(checked.forward),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    })
    const mapped = mapExportUpstream(upstream.status, await upstream.text())
    if (!mapped.ok) return json(mapped.body, mapped.status)
    // The document is passed through as the text it arrived as: re-serializing
    // a multi-megabyte export to change nothing about it is pure cost.
    //
    // Handed over as a STREAM, not as a fixed-length body: Vercel caps a
    // buffered function response at 4.5 MB and replaces anything larger with
    // its own HTML 500, so the account big enough to need an export would be
    // the one that could never get one — and would fail with a page this
    // screen cannot read as any kind of answer. The cap does not apply to a
    // streamed response. The parse above already proved this is an answer.
    return new NextResponse(new Blob([mapped.text]).stream(), {
      status: mapped.status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    })
  } catch {
    // Timeout or connection failure. Nothing was exported and nothing was
    // changed, so the page can simply offer to try again.
    return json({ ...EXPORT_NETWORK_FAILURE.body }, EXPORT_NETWORK_FAILURE.status)
  }
}

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } })
}
