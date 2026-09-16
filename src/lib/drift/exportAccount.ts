/**
 * The export-account contract as the web sees it — shared by the proxy route
 * (what it will forward, and what counts as an answer) and the flow at
 * /app/settings/export-data (how the file is named, built and saved).
 *
 * No imports, like deleteAccount.ts and for the same reason: this is the part
 * worth pinning, and a module Node's own test runner can load directly is one
 * it can be pinned in. That is also why the same-origin verdict arrives as an
 * argument — the rule itself is isSameOriginRequest in deleteAccount.ts, one
 * tested copy, called by the route.
 *
 * The server half is supabase/functions/export-account in the Drift repo. The
 * readers below are TOLERANT of missing keys, like the delete-account ones: a
 * strict decode of one field the server stopped sending blanks the screen, and
 * on this screen a blank reads as "there is nothing in your account".
 *
 * The exported DOCUMENT is never inspected beyond "is it an object". It is the
 * person's own data on its way to their disk; reshaping it here would silently
 * drop whatever section the server added last.
 */

export interface HeaderReader {
  get(name: string): string | null
}

// ---------------------------------------------------------------- request

export const EXPORT_MODES = ["preview", "export"] as const
export type ExportMode = (typeof EXPORT_MODES)[number]

export type CheckedExportRequest =
  | { ok: true; mode: ExportMode; forward: { mode: ExportMode } }
  | { ok: false; status: 400 | 403 | 415; code: "forbidden" | "unsupported_media_type" | "bad_request" }

/**
 * Validate a browser request and build the body to forward.
 *
 * Same gate as delete-account: our own pages only, JSON only — not a
 * CORS-safelisted type, so a cross-origin attempt has to preflight — and a body
 * that is BUILT rather than passed through. The edge function reads the account
 * from the JWT, so `mode` is the only thing a browser has to say; a user id or
 * a row filter it invented reaches nothing.
 *
 * `sameOrigin` is required rather than optional so the route cannot forget it.
 */
export function checkExportAccountRequest(
  headers: HeaderReader,
  rawBody: string,
  sameOrigin: boolean
): CheckedExportRequest {
  if (!sameOrigin) return { ok: false, status: 403, code: "forbidden" }

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

  const mode = (parsed as Record<string, unknown>).mode
  if (typeof mode !== "string" || !(EXPORT_MODES as readonly string[]).includes(mode)) return bad
  return { ok: true, mode: mode as ExportMode, forward: { mode: mode as ExportMode } }
}

export const EXPORT_NETWORK_FAILURE = { status: 502, body: { ok: false, code: "network" } } as const

export type MappedExportResponse =
  | { ok: true; status: number; text: string }
  | { ok: false; status: number; body: { ok: false; code: string } }

const network = (): MappedExportResponse => ({
  ok: false,
  status: EXPORT_NETWORK_FAILURE.status,
  body: { ...EXPORT_NETWORK_FAILURE.body },
})

/**
 * What the browser gets back for an upstream answer.
 *
 * The edge function answers every handled outcome as HTTP 200 JSON with a
 * boolean `ok`. Anything else — an HTML gateway page, a 5xx, a body with no
 * verdict — is not an answer and must not be handed over as one: saving a file
 * whose contents are a gateway error page is worse than saying it failed.
 *
 * A valid answer is forwarded VERBATIM. The document can be megabytes, and the
 * whole point of this route is to pass it through unchanged; the parse above is
 * only there to prove it is an answer.
 */
export function mapExportUpstream(status: number, text: string): MappedExportResponse {
  if (status === 401) return { ok: false, status: 401, body: { ok: false, code: "unauthorized" } }
  if (status >= 500) return network()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return network()
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return network()
  if (typeof (parsed as { ok?: unknown }).ok !== "boolean") return network()
  return { ok: true, status, text }
}

// ---------------------------------------------------------------- responses

export interface ExportCounts {
  trips: number
  photos: number
  files: number
  expenses: number
  chats: number
  bookingsImported: number
  placesSaved: number
  guidesSaved: number
}

export interface ExportResponse {
  ok: boolean
  code: string | null
  error: string | null
  counts: ExportCounts | null
  estimatedBytes: number | null
  filename: string | null
  generatedAt: string | null
  document: Record<string, unknown> | null
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)
const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0)

function readCounts(v: Record<string, unknown>): ExportCounts {
  return {
    trips: count(v.trips),
    photos: count(v.photos),
    files: count(v.files),
    expenses: count(v.expenses),
    chats: count(v.chats),
    bookingsImported: count(v.bookings_imported),
    placesSaved: count(v.places_saved),
    guidesSaved: count(v.guides_saved),
  }
}

export function readExportResponse(raw: unknown): ExportResponse {
  const o = asObject(raw)
  const counts = asObject(o?.counts)
  return {
    ok: o?.ok === true,
    // No object at all means no answer reached us — never a verdict.
    code: o ? text(o.code) : "network",
    error: text(o?.error),
    counts: counts ? readCounts(counts) : null,
    estimatedBytes: count(o?.estimated_bytes) || null,
    filename: text(o?.filename),
    generatedAt: text(o?.generated_at),
    document: asObject(o?.document),
  }
}

// ---------------------------------------------------------------- the file

const FALLBACK_STEM = "drift-export"

/**
 * The name the browser will save the file under.
 *
 * The server picks it, but this string becomes an `<a download>` attribute, so
 * it is cleaned rather than trusted: last path segment only, an allowlist of
 * characters, no leading dot (a hidden file nobody can find afterwards), and a
 * .json extension so the operating system opens it with something sensible.
 * A missing or unusable name falls back to today's date — never no name.
 */
export function safeExportFilename(raw: unknown, now: Date = new Date()): string {
  const fallback = `${FALLBACK_STEM}-${now.toISOString().slice(0, 10)}.json`
  if (typeof raw !== "string") return fallback
  const base = raw.split(/[/\\]/).pop() ?? ""
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.\-]+/, "")
    .slice(0, 120)
  if (!cleaned) return fallback
  return /\.json$/i.test(cleaned) ? cleaned : `${cleaned}.json`
}

/** Pretty-printed, like the iOS export: a person has to be able to open this
 *  file and read it, which is most of what "your data" means. */
export function serializeExportDocument(doc: unknown): string {
  return JSON.stringify(doc, null, 2)
}

/**
 * The bytes and the name to save, from an `export` answer.
 *
 * null means nothing is saved: an answer with no document would serialize to
 * the four characters "null", and handing someone that as their data — after a
 * spinner that said it was working — is the one outcome this screen must never
 * produce.
 */
export function prepareExportDownload(
  res: ExportResponse,
  now?: Date
): { filename: string; json: string } | null {
  if (!res.ok || !res.document) return null
  return { filename: safeExportFilename(res.filename, now), json: serializeExportDocument(res.document) }
}

// ---------------------------------------------------------------- copy

/** Local rather than imported from deleteAccount.ts, which this module
 *  deliberately does not import — see the note at the top. */
function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** "3 trips", "42 photos" … — what the file will actually contain. Empty
 *  sections are left out rather than listed as zeroes. */
export function describeExportContents(c: ExportCounts): string[] {
  return [
    c.trips ? plural(c.trips, "trip") : null,
    c.photos ? plural(c.photos, "photo") : null,
    c.files ? plural(c.files, "file") : null,
    c.expenses ? plural(c.expenses, "expense") : null,
    c.chats ? plural(c.chats, "chat message") : null,
    c.bookingsImported ? plural(c.bookingsImported, "imported booking") : null,
    c.placesSaved ? plural(c.placesSaved, "saved place") : null,
    c.guidesSaved ? plural(c.guidesSaved, "saved guide") : null,
  ].filter((x): x is string => !!x)
}

/** "about 2.4 MB". The estimate is the server's, so the copy hedges. */
export function describeSize(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) return null
  if (bytes < 1024) return "under 1 KB"
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `about ${mb.toFixed(1)} MB` : `about ${Math.round(bytes / 1024)} KB`
}
