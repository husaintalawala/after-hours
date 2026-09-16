/**
 * The email-preferences contract as the web sees it — shared by the one-click
 * unsubscribe route (/api/email/unsubscribe), the signed-link proxy behind the
 * public page (/api/email/preferences), the signed-in proxy behind Settings
 * (/api/drift/email-preferences), and the two screens that read their answers.
 *
 * No imports, like deleteAccount.ts and exportAccount.ts, and for the same
 * reason: what these routes accept is the part worth pinning, and a module
 * Node's own test runner can load directly is one it can be pinned in. See
 * emailPreferences.test.ts.
 *
 * The server half is supabase/functions/email-preferences in the Drift repo,
 * with the token itself signed and verified in _shared/email-prefs.ts. Nothing
 * here verifies a token — the web has no secret and must not have one. The
 * shape checks below only stop obvious garbage from costing an upstream call;
 * the edge function is the only thing that can say a link is genuine.
 */

export interface HeaderReader {
  get(name: string): string | null
}

// ---------------------------------------------------------------- categories

/** The letters a person can turn off. Security and account emails (sign-in
 *  links, deletion codes, the deletion receipt) are never in this list and have
 *  no switch anywhere. Order is the order the screens show them in. */
export const EMAIL_CATEGORIES = ["trip_invites", "activity", "trip_updates", "product"] as const
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number]
export type SubscribedMap = Record<EmailCategory, boolean>

/** Plain English for each switch. Says what actually arrives under it today —
 *  a description that promises letters nobody sends is its own kind of spam. */
export const EMAIL_CATEGORY_COPY: Record<EmailCategory, { label: string; description: string; noun: string }> = {
  trip_invites: {
    label: "Trip invitations",
    description: "When someone invites you to join their trip.",
    noun: "trip invitation emails",
  },
  activity: {
    label: "Bookings and settling up",
    description: "When Drift finds bookings in your inbox, and reminders to settle up with your group.",
    noun: "booking and settle-up emails",
  },
  trip_updates: {
    label: "Changes to your trips",
    description: "Important changes to a trip you’re on, like a new organiser.",
    noun: "trip change emails",
  },
  product: {
    label: "News from Drift",
    description: "Your welcome to Drift.",
    noun: "news emails from Drift",
  },
}

export const SECURITY_EMAIL_NOTE =
  "Security emails — sign-in links, verification codes and notices about your account — can’t be turned off."

export function isSubscribedMap(v: unknown): v is SubscribedMap {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false
  const o = v as Record<string, unknown>
  return EMAIL_CATEGORIES.every((c) => typeof o[c] === "boolean")
}

/**
 * The map to show, or null.
 *
 * All four switches or nothing: a missing key has no safe default. Reading it
 * as "on" shows someone who unsubscribed that they are still subscribed; as
 * "off", it tells them they are safe from letters that will keep coming. Extra
 * keys are dropped rather than refused, so a category the server adds later
 * does not blank this screen before the web learns its name.
 */
export function readSubscribedMap(v: unknown): SubscribedMap | null {
  if (!isSubscribedMap(v)) return null
  const out = {} as SubscribedMap
  for (const c of EMAIL_CATEGORIES) out[c] = v[c]
  return out
}

/**
 * The switches a `set` changes, or null.
 *
 * Only what the person just changed — never the whole map. The screen's copy
 * of the other switches can be out of date (a one-click unsubscribe from Gmail,
 * the app, another tab), and the edge function reads every `true` it is sent as
 * "remove that opt-out", so resending a stale switch would quietly undo an
 * unsubscribe made somewhere else. The edge function leaves any category a
 * request does not mention as it was.
 *
 * Same rule as its parseSubscribed: unknown keys are dropped, a known key must
 * be a real boolean, and a map with no known key is not a request.
 */
export function readSubscribedChanges(v: unknown): Partial<SubscribedMap> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const out: Partial<SubscribedMap> = {}
  for (const c of EMAIL_CATEGORIES) {
    if (!Object.prototype.hasOwnProperty.call(o, c)) continue
    if (typeof o[c] !== "boolean") return null
    out[c] = o[c] as boolean
  }
  return Object.keys(out).length ? out : null
}

export function everyCategory(on: boolean): SubscribedMap {
  const out = {} as SubscribedMap
  for (const c of EMAIL_CATEGORIES) out[c] = on
  return out
}

// ---------------------------------------------------------------- the link

/** A real token is ~200 characters; the edge function refuses anything over
 *  1024, so there is no point forwarding it. */
export const MAX_TOKEN_LENGTH = 1024
const TOKEN_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

/**
 * A token-shaped string, or null.
 *
 * Shape only — base64url payload, a dot, base64url signature. It is also what
 * makes a token safe to put back into a redirect: nothing that passes can
 * carry a slash, a quote or a newline.
 */
export function readToken(v: unknown): string | null {
  const raw = Array.isArray(v) ? v[0] : v
  if (typeof raw !== "string") return null
  const t = raw.trim()
  if (!t || t.length > MAX_TOKEN_LENGTH || !TOKEN_SHAPE.test(t)) return null
  return t
}

/** Where a GET of the one-click link lands. Relative on purpose: the host the
 *  person clicked is the host they stay on. */
export function preferencesPath(token: string | null): string {
  return token ? `/email/preferences?t=${encodeURIComponent(token)}` : "/email/preferences"
}

// ---------------------------------------------------------------- one-click (RFC 8058)

/** The exact body RFC 8058 has a mailbox provider POST, and the body forwarded
 *  upstream whichever of the two permitted encodings it arrived in. */
export const ONE_CLICK_BODY = "List-Unsubscribe=One-Click"
export const ONE_CLICK_CONTENT_TYPE = "application/x-www-form-urlencoded"

/**
 * Whether a POST body is RFC 8058's one-click request.
 *
 * The RFC allows application/x-www-form-urlencoded or multipart/form-data;
 * Gmail and Yahoo send the first, and the second is parsed here rather than
 * refused because a provider that picks it is still within the standard, and
 * an unsubscribe we fail to record is a letter we keep sending someone who
 * asked us to stop. Anything without the List-Unsubscribe=One-Click pair is
 * not a one-click request — no guessing from a bare POST.
 */
export function isOneClickBody(contentType: string | null, rawBody: string): boolean {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase()
  if (type === "multipart/form-data") return multipartHasOneClick(contentType ?? "", rawBody)
  try {
    return new URLSearchParams(rawBody.trim()).getAll("List-Unsubscribe").includes("One-Click")
  } catch {
    return false
  }
}

function multipartHasOneClick(contentType: string, rawBody: string): boolean {
  const m = /;\s*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType)
  const boundary = m?.[1] ?? m?.[2]
  if (!boundary) return false
  for (const part of rawBody.split(`--${boundary}`)) {
    const sep = /\r?\n\r?\n/.exec(part)
    if (!sep) continue
    const head = part.slice(0, sep.index)
    const body = part.slice(sep.index + sep[0].length).replace(/\r?\n$/, "")
    if (/content-disposition:\s*form-data;[^\r\n]*\bname="List-Unsubscribe"/i.test(head) && body === "One-Click") {
      return true
    }
  }
  return false
}

/** The query the edge function reads the token from. The token is forwarded
 *  exactly as it arrived; encoding is a no-op for anything readToken accepts,
 *  and is here so that stays true if the alphabet ever widens. */
export function oneClickUpstreamQuery(token: string): string {
  return `t=${encodeURIComponent(token)}`
}

export type CheckedOneClick =
  | { ok: true; token: string }
  | { ok: false; status: 400; code: "invalid_token" | "bad_request" }

/**
 * Validate a one-click POST.
 *
 * No origin check and no cookies, by design: the caller is a mailbox provider's
 * server acting for the recipient, not a browser on our site. The token is the
 * whole credential, which is what RFC 8058 intends — it is only ever in the
 * recipient's own copy of the letter.
 */
export function checkOneClickRequest(url: string, contentType: string | null, rawBody: string): CheckedOneClick {
  let token: string | null = null
  try {
    token = readToken(new URL(url).searchParams.get("t"))
  } catch {
    token = null
  }
  if (!token) return { ok: false, status: 400, code: "invalid_token" }
  if (!isOneClickBody(contentType, rawBody)) return { ok: false, status: 400, code: "bad_request" }
  return { ok: true, token }
}

/** Plain text, not JSON: nobody reads this but a mailbox provider and, now and
 *  then, a person whose mail app opened the link in a browser. */
export const ONE_CLICK_TEXT = {
  done: "You’re unsubscribed. You can change this any time from Email preferences at the bottom of any Drift email.",
  invalid_token: "This unsubscribe link isn’t valid. Use the Unsubscribe link at the bottom of a Drift email.",
  bad_request: "This address only accepts one-click unsubscribe requests.",
  network: "We couldn’t record your unsubscribe just now. Please try again in a moment.",
} as const

export type MappedOneClick = { status: 200 | 400 | 502; text: string }

/**
 * What the mailbox provider gets back.
 *
 * 200 only when the edge function recorded the opt-out. A 5xx, a gateway page
 * or a function that is not deployed is NOT a success: saying "unsubscribed"
 * about an opt-out nobody wrote down is the one answer this route must never
 * give. The edge function answers a recorded opt-out as 200 plain text, and a
 * refusal it handled as 200 JSON with ok:false.
 *
 * So success has to be RECOGNISED, not inferred from the absence of a refusal:
 * a non-empty text/plain body, or JSON saying ok:true. An HTML page, an empty
 * body, `null`, or a platform error without an `ok` all read as network.
 */
export function mapOneClickUpstream(status: number, text: string, contentType: string | null): MappedOneClick {
  const network: MappedOneClick = { status: 502, text: ONE_CLICK_TEXT.network }
  const done: MappedOneClick = { status: 200, text: ONE_CLICK_TEXT.done }
  if (status < 200 || status >= 300) return network
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase()
  if (type === "text/plain") return text.trim() ? done : network
  let parsed: unknown = undefined
  try {
    parsed = JSON.parse(text)
  } catch {
    return network
  }
  const o = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  if (!o) return network
  if (o.ok === true) return done
  if (o.ok === false) {
    if (o.code === "invalid_token") return { status: 400, text: ONE_CLICK_TEXT.invalid_token }
    if (o.code === "bad_request") return { status: 400, text: ONE_CLICK_TEXT.bad_request }
  }
  return network
}

// ---------------------------------------------------------------- JSON requests

export const TOKEN_ACTIONS = ["get", "set", "unsubscribe_all", "resubscribe_all"] as const
export type TokenAction = (typeof TOKEN_ACTIONS)[number]
export const SESSION_ACTIONS = ["session_get", "session_set"] as const
export type SessionAction = (typeof SESSION_ACTIONS)[number]

type Refusal = { ok: false; status: 400 | 403 | 415; code: "forbidden" | "unsupported_media_type" | "bad_request" | "invalid_token" }

export type CheckedTokenRequest =
  | { ok: true; action: TokenAction; forward: { t: string; action: TokenAction; subscribed?: Partial<SubscribedMap> } }
  | Refusal

export type CheckedSessionRequest =
  | { ok: true; action: SessionAction; forward: { action: SessionAction; subscribed?: Partial<SubscribedMap> } }
  | Refusal

/** Same gate as delete-account and export-account: our own pages only, JSON
 *  only (not CORS-safelisted, so a cross-origin attempt has to preflight), and
 *  an object body. The origin verdict arrives as an argument — the rule itself
 *  is isSameOriginRequest in deleteAccount.ts, one tested copy. */
function readJsonObject(
  headers: HeaderReader,
  rawBody: string,
  sameOrigin: boolean
): { ok: true; body: Record<string, unknown> } | Refusal {
  if (!sameOrigin) return { ok: false, status: 403, code: "forbidden" }
  const type = (headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()
  if (type !== "application/json") return { ok: false, status: 415, code: "unsupported_media_type" }
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return { ok: false, status: 400, code: "bad_request" }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, status: 400, code: "bad_request" }
  }
  return { ok: true, body: parsed as Record<string, unknown> }
}

/**
 * The public page's request: a signed link and one action.
 *
 * The forwarded body is BUILT, never passed through — the token, the action,
 * and for `set` the switches being changed, nothing else. The link is the
 * credential, so there is no session to check; the edge function verifies the
 * signature.
 */
export function checkTokenPrefsRequest(headers: HeaderReader, rawBody: string, sameOrigin: boolean): CheckedTokenRequest {
  const read = readJsonObject(headers, rawBody, sameOrigin)
  if (!read.ok) return read
  const { body } = read
  const action = body.action
  if (typeof action !== "string" || !(TOKEN_ACTIONS as readonly string[]).includes(action)) {
    return { ok: false, status: 400, code: "bad_request" }
  }
  const t = readToken(body.t)
  if (!t) return { ok: false, status: 400, code: "invalid_token" }
  if (action === "set") {
    const subscribed = readSubscribedChanges(body.subscribed)
    if (!subscribed) return { ok: false, status: 400, code: "bad_request" }
    return { ok: true, action, forward: { t, action, subscribed } }
  }
  return { ok: true, action: action as TokenAction, forward: { t, action: action as TokenAction } }
}

/**
 * Settings' request: the signed-in person's own preferences.
 *
 * There is no address or user id in the body to forward — the edge function
 * reads the account from the JWT — so this route cannot be pointed at somebody
 * else's inbox.
 */
export function checkSessionPrefsRequest(
  headers: HeaderReader,
  rawBody: string,
  sameOrigin: boolean
): CheckedSessionRequest {
  const read = readJsonObject(headers, rawBody, sameOrigin)
  if (!read.ok) return read
  const action = read.body.action
  if (action === "session_get") return { ok: true, action, forward: { action } }
  if (action === "session_set") {
    const subscribed = readSubscribedChanges(read.body.subscribed)
    if (!subscribed) return { ok: false, status: 400, code: "bad_request" }
    return { ok: true, action, forward: { action, subscribed } }
  }
  return { ok: false, status: 400, code: "bad_request" }
}

export const PREFS_NETWORK_FAILURE = { status: 502, body: { ok: false, code: "network" } } as const

export type PrefsAnswer = { ok: boolean; code?: string; masked?: string; subscribed?: SubscribedMap }

/**
 * What the browser gets back for an upstream answer.
 *
 * The edge function answers every handled outcome as HTTP 200 JSON with a
 * boolean `ok`. Anything else — a gateway page, a 5xx, a function that is not
 * deployed yet — is not an answer, and becomes `network`: a toggle that shows
 * "saved" over a request nobody processed is a person who thinks they are
 * unsubscribed and is not.
 *
 * Unlike the export route, the answer is REBUILT rather than passed through:
 * masked address, the four switches, a refusal code. Whatever else the server
 * might ever include — an address hash, a stray diagnostic — does not reach a
 * page that is served to anyone holding a link.
 */
export function mapPrefsUpstream(status: number, text: string): { status: number; body: PrefsAnswer } {
  const network = { status: PREFS_NETWORK_FAILURE.status, body: { ...PREFS_NETWORK_FAILURE.body } }
  if (status === 401) return { status: 401, body: { ok: false, code: "unauthorized" } }
  if (status >= 500) return network
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return network
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return network
  const o = parsed as Record<string, unknown>
  if (typeof o.ok !== "boolean") return network
  if (!o.ok) {
    const code = typeof o.code === "string" && /^[a-z_]{1,40}$/.test(o.code) ? o.code : "unknown"
    return { status: status >= 200 && status < 300 ? status : 400, body: { ok: false, code } }
  }
  const body: PrefsAnswer = { ok: true }
  if (typeof o.masked === "string" && o.masked.length <= 320) body.masked = o.masked
  const subscribed = readSubscribedMap(o.subscribed)
  if (subscribed) body.subscribed = subscribed
  return { status, body }
}

// ---------------------------------------------------------------- responses

export interface EmailPrefsResponse {
  ok: boolean
  code: string | null
  masked: string | null
  subscribed: SubscribedMap | null
}

/** Tolerant: anything that is not an object with a verdict reads as network,
 *  never as a state to show. */
export function readEmailPrefsResponse(raw: unknown): EmailPrefsResponse {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
  return {
    ok: o?.ok === true,
    code: o ? (typeof o.code === "string" && o.code.trim() ? o.code.trim() : null) : "network",
    masked: typeof o?.masked === "string" && o.masked.trim() ? o.masked.trim() : null,
    subscribed: readSubscribedMap(o?.subscribed),
  }
}

// ---------------------------------------------------------------- copy

export const INVALID_LINK_COPY =
  "This link isn’t one we recognise — it may have been cut short when it was copied. Use the Email preferences link at the bottom of any Drift email."

export const SESSION_EXPIRED_COPY =
  "Your session has expired, so nothing was changed. Sign in again to manage your email preferences."

/** Why something could not be loaded — a sentence, never a code. */
export function describeLoadError(code: string | null): string {
  if (code === "invalid_token") return INVALID_LINK_COPY
  if (code === "unauthorized") return SESSION_EXPIRED_COPY
  return "We couldn’t load your email preferences just now. Nothing has changed — please try again."
}

/** Refusals that happen before anything is written: the request was turned away
 *  by the proxy, or by the edge function before its first read or write. */
const REFUSED_BEFORE_WRITE = new Set([
  "bad_request",
  "forbidden",
  "unsupported_media_type",
  "invalid_token",
  "unauthorized",
  "no_email",
])

/**
 * Whether a failed save may still have landed.
 *
 * `network` is a timeout or a dropped connection, and the edge function can
 * finish its write after the proxy has stopped waiting. `server` can come from
 * the read that follows a write that worked. Anything unrecognised is treated
 * the same way. For all of these, nobody knows what is saved.
 */
export function saveOutcomeUnknown(code: string | null): boolean {
  return code === null || !REFUSED_BEFORE_WRITE.has(code)
}

/**
 * Why a change did not save.
 *
 * When the refusal came before any write, it says what is still true: the
 * switch has already been put back, so the sentence has to agree with it. When
 * the outcome is unknown it claims no state at all. `reloaded` says whether the
 * screen managed to re-read what is saved after the failure.
 */
export function describeSaveError(
  code: string | null,
  what: { category: EmailCategory; on: boolean } | "all",
  reloaded = false
): string {
  if (code === "invalid_token") return INVALID_LINK_COPY
  if (code === "unauthorized") return SESSION_EXPIRED_COPY
  if (saveOutcomeUnknown(code)) {
    return reloaded
      ? "We couldn’t confirm that change, so the switches now show what’s saved. Please try again if they aren’t how you want them."
      : "We couldn’t confirm that change. Reload this page to see what’s saved, then try again."
  }
  if (what === "all") return "We couldn’t save that, so nothing changed. Please try again."
  // `on` is the state they asked for; the one that stands is the opposite.
  return `We couldn’t save that, so ${EMAIL_CATEGORY_COPY[what.category].noun} are still ${what.on ? "off" : "on"}. Please try again.`
}

/** What the live region says once a change is saved. */
export function describeSaved(what: { category: EmailCategory; on: boolean } | "unsubscribe_all" | "resubscribe_all"): string {
  if (what === "unsubscribe_all") return "Unsubscribed. Drift will only send you security and account emails."
  if (what === "resubscribe_all") return "Resubscribed to every Drift email you can choose."
  const noun = EMAIL_CATEGORY_COPY[what.category].noun
  return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} turned ${what.on ? "on" : "off"}.`
}
