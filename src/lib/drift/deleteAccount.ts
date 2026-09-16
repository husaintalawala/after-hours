/**
 * The delete-account contract as the web sees it — shared by the proxy route
 * (what it will forward), the flow at /app/settings/delete-account (how it
 * reads the edge function's answers) and /app/account-deleted (the receipt).
 *
 * No imports, on purpose: the route's request rules are the part worth pinning,
 * and a module Node's own test runner can load directly is one they can be
 * pinned in. See deleteAccount.test.ts.
 *
 * The server half is supabase/functions/delete-account in the Drift repo
 * (account deletion v2). The readers below are TOLERANT of missing keys for the
 * same reason the iOS models are: a strict decode of one field the server
 * stopped sending blanks the whole screen, and on this screen a blank reads as
 * "nothing will be deleted".
 */

// ---------------------------------------------------------------- request

export const DELETE_MODES = ["preview", "send_code", "delete", "status"] as const
export type DeleteMode = (typeof DELETE_MODES)[number]

export interface HeaderReader {
  get(name: string): string | null
}

export type CheckedDeleteRequest =
  | { ok: true; mode: DeleteMode; forward: Record<string, string> }
  | { ok: false; status: 400 | 403 | 415; code: "forbidden" | "unsupported_media_type" | "bad_request" }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SIX_DIGITS = /^\d{6}$/
const PHRASE = /^[\s\S]{1,32}$/

/**
 * Only our own pages may drive this route.
 *
 * The auth cookies are SameSite=Lax, which stops a cross-SITE form post but not
 * a same-site one — and every host under after-hours.app is the same site. So
 * the browser's own provenance headers decide: Sec-Fetch-Site, when sent, must
 * say same-origin, and Origin must be present and name this host. Neither can
 * be forged by a page in someone's browser; a script that tries to set them
 * turns the request into a CORS preflight that this route never answers.
 *
 * A missing Sec-Fetch-Site is tolerated (Safari before 16.4 never sends it); a
 * missing Origin is not — every browser sends one on a POST.
 */
export function isSameOriginRequest(headers: HeaderReader): boolean {
  const site = headers.get("sec-fetch-site")
  if (site !== null && site !== "same-origin") return false
  const origin = headers.get("origin")
  if (!origin) return false
  let originHost: string
  try {
    originHost = new URL(origin).host.toLowerCase()
  } catch {
    return false // includes the literal "null" a sandboxed frame sends
  }
  const hosts = [headers.get("host"), headers.get("x-forwarded-host")]
    .flatMap((h) => (h ?? "").split(","))
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  return hosts.includes(originHost)
}

/** undefined = not sent; false = sent and malformed. */
function optional(v: unknown, shape: RegExp): string | undefined | false {
  if (v === undefined) return undefined
  return typeof v === "string" && shape.test(v) ? v : false
}

/**
 * Validate a browser request and build the body to forward.
 *
 * The forwarded body is BUILT, never passed through. The old route invented
 * `confirm:"DELETE"` for every caller, which turned the edge function's guard
 * into decoration; now a confirmation reaches the server only if the person
 * typed one. `platform` is always set here rather than trusted from the
 * browser — "ios" is what unlocks Apple verification, and the web has no Apple
 * credential to offer.
 */
export function checkDeleteAccountRequest(headers: HeaderReader, rawBody: string): CheckedDeleteRequest {
  if (!isSameOriginRequest(headers)) return { ok: false, status: 403, code: "forbidden" }

  // JSON only: it is not a CORS-safelisted type, so a cross-origin attempt has
  // to preflight — a second wall behind the origin check.
  const type = (headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()
  if (type !== "application/json") return { ok: false, status: 415, code: "unsupported_media_type" }

  const bad = { ok: false, status: 400, code: "bad_request" } as const
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return bad
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return bad
  const body = parsed as Record<string, unknown>

  const mode = body.mode
  if (typeof mode !== "string" || !(DELETE_MODES as readonly string[]).includes(mode)) return bad
  const code = optional(body.code, SIX_DIGITS)
  const deletionId = optional(body.deletion_id, UUID)
  const confirm = optional(body.confirm, PHRASE)
  if (code === false || deletionId === false || confirm === false) return bad

  if (mode === "status") {
    // The one mode that needs no session: the id is unguessable and the answer
    // is a single status word, so a tab whose account is already gone can
    // still find out how its deletion ended.
    if (!deletionId) return bad
    return { ok: true, mode, forward: { mode, deletion_id: deletionId } }
  }

  const forward: Record<string, string> = { mode, platform: "web" }
  if (mode === "delete") {
    if (deletionId) forward.deletion_id = deletionId
    if (code) forward.code = code
    if (confirm) forward.confirm = confirm
  }
  return { ok: true, mode: mode as DeleteMode, forward }
}

export const NETWORK_FAILURE = { status: 502, body: { ok: false, code: "network" } } as const

/**
 * What the browser gets back for an upstream answer.
 *
 * The edge function answers every handled outcome as HTTP 200 JSON with a
 * boolean `ok`. Anything else — an HTML gateway page, a 5xx, a body with no
 * verdict — is NOT a verdict, and must not be shown as one: the old route
 * passed a Vercel 504 straight through and the page said "not deleted" about an
 * account the function was still deleting. It becomes `network`, which the
 * flow answers by asking the server what actually happened.
 */
export function mapUpstreamResponse(
  status: number,
  text: string
): { status: number; body: Record<string, unknown> } {
  if (status === 401) return { status: 401, body: { ok: false, code: "unauthorized" } }
  if (status >= 500) return { status: NETWORK_FAILURE.status, body: { ...NETWORK_FAILURE.body } }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { status: NETWORK_FAILURE.status, body: { ...NETWORK_FAILURE.body } }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { status: NETWORK_FAILURE.status, body: { ...NETWORK_FAILURE.body } }
  }
  if (typeof (parsed as { ok?: unknown }).ok !== "boolean") {
    return { status: NETWORK_FAILURE.status, body: { ...NETWORK_FAILURE.body } }
  }
  return { status, body: parsed as Record<string, unknown> }
}

// ---------------------------------------------------------------- responses

export type Verification = "apple" | "email_code" | "confirm_phrase"
const VERIFICATIONS: readonly string[] = ["apple", "email_code", "confirm_phrase"]

export interface DeletionHandover {
  tripId: string | null
  title: string
  toName: string
}

export interface DeletionPreview {
  tripsDeleted: number
  handovers: DeletionHandover[]
  photos: number
  files: number
  chats: number
  comments: number
  bookingsImported: number
  expensesKeptForGroup: number
  settlementsKeptForGroup: number
  googleConnected: boolean
  plaidItems: number
  identities: string[]
  hasEmail: boolean
}

export interface DeletionSummary {
  tripsDeleted: number
  handovers: DeletionHandover[]
  photos: number
  files: number
  chats: number
  bookingsImported: number
  expensesKeptForGroup: number
  settlementsKeptForGroup: number
  cardsDisconnected: number
}

export interface DeletionFollowup {
  code: string
  url: string
}

export interface DeleteResponse {
  ok: boolean
  code: string | null
  error: string | null
  deletionId: string | null
  status: string | null
  verification: Verification | null
  emailHint: string | null
  resendAfterS: number | null
  retryAfterS: number | null
  preview: DeletionPreview | null
  summary: DeletionSummary | null
  followups: DeletionFollowup[]
  finishing: string[]
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)
const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0)
const seconds = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.ceil(v) : null)

function readHandovers(v: unknown): DeletionHandover[] {
  return asArray(v)
    .map(asObject)
    .filter((h): h is Record<string, unknown> => !!h)
    .map((h) => ({
      tripId: text(h.trip_id),
      title: text(h.title) ?? "A trip",
      toName: text(h.to_name) ?? "a co-traveller",
    }))
}

function readPreview(v: Record<string, unknown>): DeletionPreview {
  return {
    tripsDeleted: count(v.trips_deleted),
    handovers: readHandovers(v.handovers),
    photos: count(v.photos),
    files: count(v.files),
    chats: count(v.chats),
    comments: count(v.comments),
    bookingsImported: count(v.bookings_imported),
    expensesKeptForGroup: count(v.expenses_kept_for_group),
    settlementsKeptForGroup: count(v.settlements_kept_for_group),
    googleConnected: v.google_connected === true,
    plaidItems: count(v.plaid_items),
    identities: asArray(v.identities).filter((i): i is string => typeof i === "string"),
    hasEmail: v.has_email === true,
  }
}

function readSummary(v: Record<string, unknown>): DeletionSummary {
  return {
    tripsDeleted: count(v.trips_deleted),
    handovers: readHandovers(v.handovers),
    photos: count(v.photos),
    files: count(v.files),
    chats: count(v.chats),
    bookingsImported: count(v.bookings_imported),
    expensesKeptForGroup: count(v.expenses_kept_for_group),
    settlementsKeptForGroup: count(v.settlements_kept_for_group),
    cardsDisconnected: count(v.cards_disconnected),
  }
}

/** https links only. The receipt round-trips through sessionStorage, which any
 *  script on the origin can write, and a `javascript:` href there would run on
 *  click. */
function readFollowups(v: unknown): DeletionFollowup[] {
  const out: DeletionFollowup[] = []
  for (const item of asArray(v)) {
    const o = asObject(item)
    const code = text(o?.code)
    const url = text(o?.url)
    if (!code || !url) continue
    try {
      if (new URL(url).protocol === "https:") out.push({ code, url })
    } catch {
      /* not a URL — dropped */
    }
  }
  return out
}

export function readDeleteResponse(raw: unknown): DeleteResponse {
  const o = asObject(raw)
  const preview = asObject(o?.preview)
  const summary = asObject(o?.summary)
  return {
    ok: o?.ok === true,
    // No object at all means no answer reached us — never a verdict.
    code: o ? text(o.code) : "network",
    error: text(o?.error),
    deletionId: text(o?.deletion_id),
    status: text(o?.status),
    verification:
      typeof o?.verification === "string" && VERIFICATIONS.includes(o.verification)
        ? (o.verification as Verification)
        : null,
    emailHint: text(o?.email_hint),
    resendAfterS: seconds(o?.resend_after_s),
    retryAfterS: seconds(o?.retry_after_s),
    preview: preview ? readPreview(preview) : null,
    summary: summary ? readSummary(summary) : null,
    followups: readFollowups(o?.followups),
    finishing: asArray(o?.finishing).filter((f): f is string => typeof f === "string"),
  }
}

// ---------------------------------------------------------------- receipt

/**
 * sessionStorage, not the URL: the receipt names trips and co-travellers, and a
 * query string lands in history, in server logs and in PostHog's $current_url.
 * Written AFTER clearUserClientState empties sessionStorage, read once and
 * removed by /app/account-deleted.
 */
export const RECEIPT_STORAGE_KEY = "drift.deletionReceipt"

export type GoogleOutcome = "revoked" | "not_revoked" | "none"

/** Stored shape: the server's raw answer plus what the browser did afterwards,
 *  so one reader serves both the live response and the receipt. */
export interface StoredReceipt {
  response: unknown
  google: GoogleOutcome
}

export interface DeletionReceipt {
  status: string | null
  summary: DeletionSummary | null
  followups: DeletionFollowup[]
  finishing: string[]
  google: GoogleOutcome
}

export function readReceipt(raw: unknown): DeletionReceipt {
  const o = asObject(raw)
  const r = readDeleteResponse(o?.response ?? null)
  const google = o?.google === "revoked" || o?.google === "not_revoked" ? o.google : "none"
  return { status: r.status, summary: r.summary, followups: r.followups, finishing: r.finishing, google }
}

// ---------------------------------------------------------------- copy

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** "3 trips", "42 photos" … — zero rows are left out rather than listed. */
export function describeRemoved(c: {
  tripsDeleted: number
  photos: number
  files: number
  chats: number
  bookingsImported: number
  comments?: number
}): string[] {
  return [
    c.tripsDeleted ? plural(c.tripsDeleted, "trip") : null,
    c.photos ? plural(c.photos, "photo") : null,
    c.files ? plural(c.files, "file") : null,
    c.chats ? plural(c.chats, "chat message") : null,
    c.comments ? plural(c.comments, "comment") : null,
    c.bookingsImported ? plural(c.bookingsImported, "imported booking") : null,
  ].filter((x): x is string => !!x)
}

export function describeKept(c: { expensesKeptForGroup: number; settlementsKeptForGroup: number }): string | null {
  const parts = [
    c.expensesKeptForGroup ? plural(c.expensesKeptForGroup, "expense") : null,
    c.settlementsKeptForGroup ? plural(c.settlementsKeptForGroup, "settle-up") : null,
  ].filter((x): x is string => !!x)
  if (!parts.length) return null
  return `${parts.join(" and ")} on shared trips stay, shown as “Former traveller”, so everyone’s balances stay right.`
}

/**
 * What the retry job is still finishing, one line per kind of work. `finishing`
 * names the work (finishingFrom in the edge function's logic.ts: media, login,
 * cards, analytics), and it is not always photos — a Plaid removal that failed
 * must not be reported as one. An `incomplete` status that names nothing (the
 * status-poll path carries no list) still gets a line.
 */
export function describeFinishing(status: string | null, finishing: string[]): string[] {
  const other =
    finishing.some((f) => f !== "media" && f !== "cards") || (status === "incomplete" && finishing.length === 0)
  return [
    finishing.includes("media") ? "A few photos are still being removed" : null,
    finishing.includes("cards") ? "Your bank cards are still being disconnected" : null,
    other ? "A few last pieces are still being removed" : null,
  ].filter((x): x is string => !!x)
}
