import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { createHash, createHmac } from "node:crypto"
import {
  checkOneClickRequest,
  checkSessionPrefsRequest,
  checkTokenPrefsRequest,
  describeSaved,
  describeSaveError,
  everyCategory,
  isOneClickBody,
  mapOneClickUpstream,
  mapPrefsUpstream,
  MAX_TOKEN_LENGTH,
  ONE_CLICK_TEXT,
  oneClickUpstreamQuery,
  preferencesPath,
  readEmailPrefsResponse,
  readSubscribedMap,
  readToken,
  saveOutcomeUnknown,
} from "./emailPreferences.ts"

// The unsubscribe routes are how someone tells Drift to stop emailing them, so
// what they accept — and what they claim happened — is pinned here rather than
// trusted to review. The routes themselves import next/server and the cookie
// client, which Node cannot load; every decision they make lives in
// emailPreferences.ts for exactly that reason. The origin rule
// (isSameOriginRequest) is pinned in deleteAccount.test.ts; the JSON routes pass
// its verdict in, so what is tested here is that the verdict is obeyed.

/** Shaped exactly like _shared/email-prefs.ts signs one. The web never checks
 *  the signature — only the edge function can — so any secret will do. */
function token(c = "trip_invites"): string {
  const h = createHash("sha256").update("someone@example.com").digest("hex")
  const payload = Buffer.from(JSON.stringify({ v: 1, h, c, m: "s•••@example.com" })).toString("base64url")
  const sig = createHmac("sha256", "test-secret").update(payload).digest("base64url")
  return `${payload}.${sig}`
}
const T = token()

function headers(over: Record<string, string | null> = {}): Headers {
  const base: Record<string, string | null> = {
    host: "drift.after-hours.app",
    origin: "https://drift.after-hours.app",
    "sec-fetch-site": "same-origin",
    "content-type": "application/json",
    ...over,
  }
  const h = new Headers()
  for (const [k, v] of Object.entries(base)) if (v !== null) h.set(k, v)
  return h
}

const ALL_ON = everyCategory(true)
const MIXED = { trip_invites: false, activity: true, trip_updates: true, product: false }
const ONE_CLICK_URL = `https://drift.after-hours.app/api/email/unsubscribe?t=${encodeURIComponent(T)}`

describe("the link", () => {
  test("a real token is read back exactly", () => {
    assert.equal(readToken(T), T)
    // searchParams can hand a page an array when a link was pasted twice.
    assert.equal(readToken([T, "other"]), T)
    assert.equal(readToken(`  ${T}\n`), T)
  })

  test("anything not token-shaped is refused before it costs an upstream call", () => {
    for (const bad of [
      undefined,
      null,
      42,
      "",
      "nodot",
      "a.b.c",
      ".sig",
      "payload.",
      "pay load.sig",
      "payload/../x.sig",
      'payload".sig',
      "payload.sig\r\nLocation: https://evil.example",
      `${"a".repeat(MAX_TOKEN_LENGTH)}.b`,
    ]) {
      assert.equal(readToken(bad), null, String(bad))
    }
  })

  test("a GET of the one-click address lands on the preferences page with the same link", () => {
    assert.equal(preferencesPath(T), `/email/preferences?t=${T}`)
    assert.equal(preferencesPath(null), "/email/preferences")
  })
})

describe("one-click body (RFC 8058)", () => {
  test("the form-encoded body every major mailbox provider sends is accepted", () => {
    assert.equal(isOneClickBody("application/x-www-form-urlencoded", "List-Unsubscribe=One-Click"), true)
    assert.equal(isOneClickBody("application/x-www-form-urlencoded; charset=utf-8", "List-Unsubscribe=One-Click\r\n"), true)
    assert.equal(isOneClickBody("application/x-www-form-urlencoded", "foo=bar&List-Unsubscribe=One-Click"), true)
  })

  test("the multipart encoding the RFC also permits is accepted", () => {
    const crlf = [
      "--XyZ",
      'Content-Disposition: form-data; name="List-Unsubscribe"',
      "",
      "One-Click",
      "--XyZ--",
      "",
    ].join("\r\n")
    assert.equal(isOneClickBody("multipart/form-data; boundary=XyZ", crlf), true)
    assert.equal(isOneClickBody('multipart/form-data; boundary="XyZ"', crlf), true)
    assert.equal(isOneClickBody("multipart/form-data; boundary=XyZ", crlf.replace(/\r\n/g, "\n")), true)
  })

  test("a POST that is not a one-click request unsubscribes nobody", () => {
    assert.equal(isOneClickBody("application/x-www-form-urlencoded", ""), false)
    assert.equal(isOneClickBody("application/x-www-form-urlencoded", "List-Unsubscribe=Yes"), false)
    assert.equal(isOneClickBody("application/x-www-form-urlencoded", "list-unsubscribe=one-click"), false)
    assert.equal(isOneClickBody("application/json", '{"List-Unsubscribe":"One-Click"}'), false)
    const wrongName = '--XyZ\r\nContent-Disposition: form-data; name="Unsubscribe"\r\n\r\nOne-Click\r\n--XyZ--'
    assert.equal(isOneClickBody("multipart/form-data; boundary=XyZ", wrongName), false)
    const noBoundary = '--XyZ\r\nContent-Disposition: form-data; name="List-Unsubscribe"\r\n\r\nOne-Click\r\n--XyZ--'
    assert.equal(isOneClickBody("multipart/form-data", noBoundary), false)
  })
})

describe("one-click request", () => {
  test("a valid POST yields the token exactly as it was signed", () => {
    assert.deepEqual(
      checkOneClickRequest(ONE_CLICK_URL, "application/x-www-form-urlencoded", "List-Unsubscribe=One-Click"),
      { ok: true, token: T }
    )
  })

  test("the token reaches the edge function unchanged", () => {
    const checked = checkOneClickRequest(ONE_CLICK_URL, "application/x-www-form-urlencoded", "List-Unsubscribe=One-Click")
    assert.equal(checked.ok, true)
    if (!checked.ok) return
    const forwarded = new URLSearchParams(oneClickUpstreamQuery(checked.token)).get("t")
    assert.equal(forwarded, T)
  })

  test("a missing or malformed token is refused before the body is even considered", () => {
    const form = "application/x-www-form-urlencoded"
    const body = "List-Unsubscribe=One-Click"
    const invalid = { ok: false, status: 400, code: "invalid_token" }
    assert.deepEqual(checkOneClickRequest("https://drift.after-hours.app/api/email/unsubscribe", form, body), invalid)
    assert.deepEqual(checkOneClickRequest("https://drift.after-hours.app/api/email/unsubscribe?t=", form, body), invalid)
    assert.deepEqual(checkOneClickRequest("https://drift.after-hours.app/api/email/unsubscribe?t=abc", form, body), invalid)
  })

  test("a valid token with the wrong body is a bad request, not an unsubscribe", () => {
    assert.deepEqual(checkOneClickRequest(ONE_CLICK_URL, "text/plain", "hello"), {
      ok: false,
      status: 400,
      code: "bad_request",
    })
  })
})

describe("one-click answer", () => {
  const done = { status: 200, text: ONE_CLICK_TEXT.done }
  const network = { status: 502, text: ONE_CLICK_TEXT.network }
  const TEXT = "text/plain; charset=utf-8"
  const JSON_TYPE = "application/json"

  test("200 only when the edge function recorded it", () => {
    // Exactly what email-preferences/index.ts answers a recorded opt-out with.
    assert.deepEqual(mapOneClickUpstream(200, "You're unsubscribed.\n", TEXT), done)
    assert.deepEqual(mapOneClickUpstream(200, JSON.stringify({ ok: true }), JSON_TYPE), done)
  })

  test("a refusal the edge function handled keeps its meaning", () => {
    assert.deepEqual(mapOneClickUpstream(200, JSON.stringify({ ok: false, code: "invalid_token" }), JSON_TYPE), {
      status: 400,
      text: ONE_CLICK_TEXT.invalid_token,
    })
    assert.deepEqual(mapOneClickUpstream(200, JSON.stringify({ ok: false, code: "bad_request" }), JSON_TYPE), {
      status: 400,
      text: ONE_CLICK_TEXT.bad_request,
    })
  })

  test("an outage, a missing function or an unknown refusal is never reported as unsubscribed", () => {
    // Saying "done" about an opt-out nobody wrote down is the one answer this
    // route must never give.
    assert.deepEqual(mapOneClickUpstream(500, "boom", TEXT), network)
    assert.deepEqual(mapOneClickUpstream(504, "<html>Gateway Timeout</html>", "text/html"), network)
    assert.deepEqual(mapOneClickUpstream(404, "Function not found", TEXT), network)
    assert.deepEqual(mapOneClickUpstream(401, "Unauthorized", TEXT), network)
    assert.deepEqual(
      mapOneClickUpstream(200, JSON.stringify({ ok: false, code: "preferences_unavailable" }), JSON_TYPE),
      network
    )
  })

  test("a 2xx that is not a recognised success is never reported as unsubscribed", () => {
    // Success is recognised, not inferred from the absence of a refusal.
    assert.deepEqual(mapOneClickUpstream(200, "<html>gateway</html>", "text/html; charset=utf-8"), network)
    assert.deepEqual(mapOneClickUpstream(200, "<html>gateway</html>", null), network)
    assert.deepEqual(mapOneClickUpstream(200, "", null), network)
    assert.deepEqual(mapOneClickUpstream(200, "", TEXT), network)
    assert.deepEqual(mapOneClickUpstream(204, "", null), network)
    assert.deepEqual(mapOneClickUpstream(200, "null", JSON_TYPE), network)
    assert.deepEqual(mapOneClickUpstream(200, "[]", JSON_TYPE), network)
    assert.deepEqual(mapOneClickUpstream(200, JSON.stringify({ code: "BOOT_ERROR", message: "x" }), JSON_TYPE), network)
    assert.deepEqual(mapOneClickUpstream(200, JSON.stringify({ ok: "true" }), JSON_TYPE), network)
  })
})

describe("signed-link JSON request", () => {
  const check = (body: unknown, over: Record<string, string | null> = {}, sameOrigin = true) =>
    checkTokenPrefsRequest(headers(over), typeof body === "string" ? body : JSON.stringify(body), sameOrigin)

  test("each page action is accepted and the token passes through unchanged", () => {
    for (const action of ["get", "unsubscribe_all", "resubscribe_all"]) {
      assert.deepEqual(check({ t: T, action }), { ok: true, action, forward: { t: T, action } })
    }
    assert.deepEqual(check({ t: T, action: "set", subscribed: MIXED }), {
      ok: true,
      action: "set",
      forward: { t: T, action: "set", subscribed: MIXED },
    })
  })

  test("the forwarded body is rebuilt, never passed through", () => {
    assert.deepEqual(
      check({
        t: T,
        action: "set",
        subscribed: { ...ALL_ON, security: false, all: false },
        email: "someone-else@example.com",
        h: "0".repeat(64),
      }),
      { ok: true, action: "set", forward: { t: T, action: "set", subscribed: ALL_ON } }
    )
    // `subscribed` means nothing to any action but set.
    assert.deepEqual(check({ t: T, action: "get", subscribed: ALL_ON }), {
      ok: true,
      action: "get",
      forward: { t: T, action: "get" },
    })
  })

  test("another origin is a 403, whatever the body says", () => {
    assert.deepEqual(check({ t: T, action: "unsubscribe_all" }, {}, false), { ok: false, status: 403, code: "forbidden" })
  })

  test("only JSON is accepted", () => {
    assert.deepEqual(check({ t: T, action: "get" }, { "content-type": "application/x-www-form-urlencoded" }), {
      ok: false,
      status: 415,
      code: "unsupported_media_type",
    })
    assert.equal(check({ t: T, action: "get" }, { "content-type": "application/json; charset=utf-8" }).ok, true)
  })

  test("a malformed body, an unknown action or a session action is a 400", () => {
    for (const body of ["", "nope", "[]", "null", {}, { t: T }, { t: T, action: "delete" }, { t: T, action: "session_get" }]) {
      assert.deepEqual(check(body), { ok: false, status: 400, code: "bad_request" }, JSON.stringify(body))
    }
  })

  test("a missing or malformed token says so", () => {
    assert.deepEqual(check({ action: "get" }), { ok: false, status: 400, code: "invalid_token" })
    assert.deepEqual(check({ t: "abc", action: "get" }), { ok: false, status: 400, code: "invalid_token" })
  })

  test("set forwards only the switch that changed, unchanged", () => {
    // The page's copy of the other switches can be stale, and the edge function
    // reads every `true` as "remove that opt-out" — so one key is the request.
    assert.deepEqual(check({ t: T, action: "set", subscribed: { product: false } }), {
      ok: true,
      action: "set",
      forward: { t: T, action: "set", subscribed: { product: false } },
    })
    assert.deepEqual(check({ t: T, action: "set", subscribed: { trip_invites: true, future_category: false } }), {
      ok: true,
      action: "set",
      forward: { t: T, action: "set", subscribed: { trip_invites: true } },
    })
  })

  test("set needs at least one known switch, and a real boolean for each", () => {
    for (const subscribed of [
      undefined,
      null,
      [],
      {},
      { security: false },
      { all: false },
      { ...ALL_ON, activity: "false" },
      { product: 0 },
      Object.create({ product: false }),
    ]) {
      assert.deepEqual(check({ t: T, action: "set", subscribed }), { ok: false, status: 400, code: "bad_request" })
    }
    assert.deepEqual(check({ t: T, action: "set" }), { ok: false, status: 400, code: "bad_request" })
  })
})

describe("signed-in JSON request", () => {
  const check = (body: unknown, over: Record<string, string | null> = {}, sameOrigin = true) =>
    checkSessionPrefsRequest(headers(over), typeof body === "string" ? body : JSON.stringify(body), sameOrigin)

  test("session_get and session_set are accepted", () => {
    assert.deepEqual(check({ action: "session_get" }), {
      ok: true,
      action: "session_get",
      forward: { action: "session_get" },
    })
    assert.deepEqual(check({ action: "session_set", subscribed: MIXED }), {
      ok: true,
      action: "session_set",
      forward: { action: "session_set", subscribed: MIXED },
    })
  })

  test("session_set forwards only the switch that changed, unchanged", () => {
    assert.deepEqual(check({ action: "session_set", subscribed: { product: false } }), {
      ok: true,
      action: "session_set",
      forward: { action: "session_set", subscribed: { product: false } },
    })
    assert.deepEqual(check({ action: "session_set", subscribed: { security: false } }), {
      ok: false,
      status: 400,
      code: "bad_request",
    })
  })

  test("nothing in the body can point this at somebody else's address", () => {
    // The edge function reads the account from the JWT. A user id, an address or
    // a link token here could only ever be an attempt at someone else.
    assert.deepEqual(
      check({ action: "session_set", subscribed: MIXED, user_id: "someone-else", email: "x@example.com", t: T }),
      { ok: true, action: "session_set", forward: { action: "session_set", subscribed: MIXED } }
    )
  })

  test("link actions are not session actions", () => {
    for (const action of ["get", "set", "unsubscribe_all", "resubscribe_all"]) {
      assert.deepEqual(check({ action, t: T, subscribed: ALL_ON }), { ok: false, status: 400, code: "bad_request" })
    }
  })

  test("the same browser gate as every other account route", () => {
    assert.deepEqual(check({ action: "session_get" }, {}, false), { ok: false, status: 403, code: "forbidden" })
    assert.deepEqual(check({ action: "session_get" }, { "content-type": "text/plain" }), {
      ok: false,
      status: 415,
      code: "unsupported_media_type",
    })
    assert.deepEqual(check({ action: "session_set" }), { ok: false, status: 400, code: "bad_request" })
  })
})

describe("JSON answers", () => {
  const network = { status: 502, body: { ok: false, code: "network" } }

  test("a handled answer is rebuilt to the fields the page shows", () => {
    const upstream = JSON.stringify({
      ok: true,
      masked: "s•••@example.com",
      subscribed: { ...MIXED, all: true },
      email_hash: "0".repeat(64),
      email: "someone@example.com",
    })
    assert.deepEqual(mapPrefsUpstream(200, upstream), {
      status: 200,
      body: { ok: true, masked: "s•••@example.com", subscribed: MIXED },
    })
  })

  test("a refusal keeps its code, and only a code-shaped one", () => {
    assert.deepEqual(mapPrefsUpstream(200, JSON.stringify({ ok: false, code: "invalid_token", h: "x" })), {
      status: 200,
      body: { ok: false, code: "invalid_token" },
    })
    assert.deepEqual(mapPrefsUpstream(200, JSON.stringify({ ok: false, code: "<script>" })), {
      status: 200,
      body: { ok: false, code: "unknown" },
    })
  })

  test("gateway pages, 5xx and bodies without a verdict become network — never a saved state", () => {
    assert.deepEqual(mapPrefsUpstream(200, "<html>504</html>"), network)
    assert.deepEqual(mapPrefsUpstream(503, JSON.stringify({ ok: true, subscribed: ALL_ON })), network)
    assert.deepEqual(mapPrefsUpstream(200, JSON.stringify({ subscribed: ALL_ON })), network)
    assert.deepEqual(mapPrefsUpstream(200, "[]"), network)
    assert.deepEqual(mapPrefsUpstream(404, "Function not found"), network)
  })

  test("401 is its own code", () => {
    assert.deepEqual(mapPrefsUpstream(401, "Unauthorized"), { status: 401, body: { ok: false, code: "unauthorized" } })
  })

  test("the reader turns no answer into network and an incomplete map into no map", () => {
    assert.deepEqual(readEmailPrefsResponse(null), { ok: false, code: "network", masked: null, subscribed: null })
    const partial = readEmailPrefsResponse({ ok: true, subscribed: { trip_invites: false } })
    assert.equal(partial.ok, true)
    assert.equal(partial.subscribed, null)
    assert.equal(readSubscribedMap({ ...MIXED, future_category: true })?.trip_invites, false)
  })
})

describe("copy", () => {
  test("a save refused before any write says what is still true, the opposite of what was asked", () => {
    assert.equal(
      describeSaveError("bad_request", { category: "trip_invites", on: false }),
      "We couldn’t save that, so trip invitation emails are still on. Please try again."
    )
    assert.equal(
      describeSaveError("forbidden", { category: "product", on: true }),
      "We couldn’t save that, so news emails from Drift are still off. Please try again."
    )
    assert.match(describeSaveError("bad_request", "all"), /nothing changed/)
    assert.match(describeSaveError("invalid_token", "all"), /isn’t one we recognise/)
    assert.match(describeSaveError("unauthorized", "all"), /session has expired/)
  })

  test("a save that may have landed claims no state", () => {
    // A timeout can end after the edge function wrote, and `server` can follow a
    // write that worked, so "still on" or "nothing changed" could be false.
    for (const code of ["network", "server", "unknown", null]) {
      assert.equal(saveOutcomeUnknown(code), true, String(code))
      for (const what of [{ category: "trip_invites", on: false } as const, "all" as const]) {
        for (const reloaded of [false, true]) {
          const said = describeSaveError(code, what, reloaded)
          assert.doesNotMatch(said, /still (on|off)|nothing changed/, `${code} ${JSON.stringify(what)} ${reloaded}`)
          assert.match(said, /couldn’t confirm/)
        }
      }
    }
    assert.match(describeSaveError("network", "all", true), /now show what’s saved/)
    assert.match(describeSaveError("network", "all", false), /Reload this page/)
    for (const code of ["bad_request", "forbidden", "unsupported_media_type", "invalid_token", "unauthorized", "no_email"]) {
      assert.equal(saveOutcomeUnknown(code), false, code)
    }
  })

  test("a saved change is announced in words", () => {
    assert.equal(describeSaved({ category: "activity", on: false }), "Booking and settle-up emails turned off.")
    assert.match(describeSaved("unsubscribe_all"), /only send you security and account emails/)
  })
})
