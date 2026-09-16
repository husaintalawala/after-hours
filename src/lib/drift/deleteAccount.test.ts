import { test, describe } from "node:test"
import assert from "node:assert/strict"
import {
  checkDeleteAccountRequest,
  describeFinishing,
  describeKept,
  describeRemoved,
  isSameOriginRequest,
  mapUpstreamResponse,
  readDeleteResponse,
  readReceipt,
} from "./deleteAccount.ts"

// The delete-account proxy is the one route in the app that can end an account,
// so what it accepts is pinned here rather than trusted to review. The route
// itself imports next/server and the cookie client, which Node cannot load;
// every decision it makes lives in deleteAccount.ts for exactly this reason.

const ID = "8a6e0f1c-2b3d-4e5f-8a9b-0c1d2e3f4a5b"

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

const check = (body: unknown, over: Record<string, string | null> = {}) =>
  checkDeleteAccountRequest(headers(over), typeof body === "string" ? body : JSON.stringify(body))

describe("origin", () => {
  test("our own page is accepted", () => {
    assert.equal(isSameOriginRequest(headers()), true)
  })

  test("cross-site and same-site-but-other-origin fetches are refused", () => {
    assert.equal(isSameOriginRequest(headers({ "sec-fetch-site": "cross-site" })), false)
    // Same SITE is exactly what SameSite=Lax lets through: another
    // *.after-hours.app host. It must not be enough.
    assert.equal(isSameOriginRequest(headers({ "sec-fetch-site": "same-site" })), false)
    assert.equal(isSameOriginRequest(headers({ origin: "https://evil.after-hours.app", "sec-fetch-site": null })), false)
  })

  test("a missing or opaque Origin is refused", () => {
    assert.equal(isSameOriginRequest(headers({ origin: null })), false)
    assert.equal(isSameOriginRequest(headers({ origin: "null" })), false)
  })

  test("browsers that do not send Sec-Fetch-Site still work when Origin matches", () => {
    assert.equal(isSameOriginRequest(headers({ "sec-fetch-site": null })), true)
  })

  test("the forwarded host counts as this host", () => {
    assert.equal(
      isSameOriginRequest(headers({ host: "internal.vercel.app", "x-forwarded-host": "drift.after-hours.app" })),
      true
    )
  })

  test("a refused origin is a 403 before the body is even read", () => {
    assert.deepEqual(check("not json", { "sec-fetch-site": "cross-site" }), {
      ok: false,
      status: 403,
      code: "forbidden",
    })
  })
})

describe("body", () => {
  test("only JSON is accepted", () => {
    assert.deepEqual(check({ mode: "preview" }, { "content-type": "text/plain" }), {
      ok: false,
      status: 415,
      code: "unsupported_media_type",
    })
    assert.equal(check({ mode: "preview" }, { "content-type": "application/json; charset=utf-8" }).ok, true)
  })

  test("no body, a non-object body or an unknown mode is a 400", () => {
    for (const body of ["", "not json", "[]", "null", JSON.stringify({}), JSON.stringify({ mode: "wipe" })]) {
      assert.deepEqual(check(body), { ok: false, status: 400, code: "bad_request" }, body)
    }
  })

  test("malformed code, deletion id or confirmation is a 400", () => {
    for (const body of [
      { mode: "delete", code: "12345" },
      { mode: "delete", code: 123456 },
      { mode: "delete", code: "12345a" },
      { mode: "delete", deletion_id: "abc" },
      { mode: "delete", confirm: true },
      { mode: "delete", confirm: "x".repeat(33) },
    ]) {
      assert.equal(check(body).ok, false, JSON.stringify(body))
    }
  })
})

describe("forwarded body", () => {
  test("delete forwards only what the person supplied, and platform is always web", () => {
    const result = check({
      mode: "delete",
      deletion_id: ID,
      code: "123456",
      platform: "ios",
      apple_identity_token: "forged",
    })
    assert.deepEqual(result, {
      ok: true,
      mode: "delete",
      forward: { mode: "delete", platform: "web", deletion_id: ID, code: "123456" },
    })
  })

  test("the confirmation is never invented", () => {
    const result = check({ mode: "delete" })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal("confirm" in result.forward, false)
    const typed = check({ mode: "delete", confirm: "DELETE" })
    assert.equal(typed.ok && typed.forward.confirm, "DELETE")
  })

  test("preview and send_code carry nothing but mode and platform", () => {
    for (const mode of ["preview", "send_code"]) {
      assert.deepEqual(check({ mode, code: "123456", deletion_id: ID, confirm: "DELETE" }), {
        ok: true,
        mode,
        forward: { mode, platform: "web" },
      })
    }
  })

  test("status needs a deletion id and nothing else", () => {
    assert.equal(check({ mode: "status" }).ok, false)
    assert.deepEqual(check({ mode: "status", deletion_id: ID, code: "123456" }), {
      ok: true,
      mode: "status",
      forward: { mode: "status", deletion_id: ID },
    })
  })
})

describe("upstream answers", () => {
  const network = { status: 502, body: { ok: false, code: "network" } }

  test("a handled JSON outcome passes through", () => {
    assert.deepEqual(mapUpstreamResponse(200, JSON.stringify({ ok: true, status: "completed" })), {
      status: 200,
      body: { ok: true, status: "completed" },
    })
    assert.deepEqual(mapUpstreamResponse(200, JSON.stringify({ ok: false, code: "code_expired" })), {
      status: 200,
      body: { ok: false, code: "code_expired" },
    })
  })

  test("gateway pages, 5xx and bodies without a verdict become network, never a verdict", () => {
    assert.deepEqual(mapUpstreamResponse(200, "<html>504 Gateway Timeout</html>"), network)
    assert.deepEqual(mapUpstreamResponse(504, ""), network)
    assert.deepEqual(mapUpstreamResponse(500, JSON.stringify({ ok: false, error: "boom" })), network)
    assert.deepEqual(mapUpstreamResponse(200, JSON.stringify({ deleted: true })), network)
    assert.deepEqual(mapUpstreamResponse(200, "[]"), network)
  })

  test("401 is its own code so the page can check whether the account is already gone", () => {
    assert.deepEqual(mapUpstreamResponse(401, "Unauthorized"), {
      status: 401,
      body: { ok: false, code: "unauthorized" },
    })
  })
})

describe("readers", () => {
  test("no answer at all reads as network", () => {
    const r = readDeleteResponse(null)
    assert.equal(r.ok, false)
    assert.equal(r.code, "network")
  })

  test("a preview missing keys reads as zeros, not as a crash", () => {
    const r = readDeleteResponse({ ok: true, verification: "email_code", preview: { photos: 4, handovers: [{}] } })
    assert.equal(r.verification, "email_code")
    assert.equal(r.preview?.photos, 4)
    assert.equal(r.preview?.tripsDeleted, 0)
    assert.equal(r.preview?.googleConnected, false)
    assert.equal(r.preview?.handovers[0]?.title, "A trip")
    assert.equal(r.preview?.handovers[0]?.toName, "a co-traveller")
  })

  test("an unknown verification is null rather than trusted", () => {
    assert.equal(readDeleteResponse({ ok: true, verification: "sms" }).verification, null)
  })

  test("follow-up links must be https", () => {
    const r = readReceipt({
      response: {
        ok: true,
        followups: [
          { code: "apple_manual", url: "https://account.apple.com/account/manage" },
          { code: "evil", url: "javascript:alert(1)" },
          { code: "no_url" },
        ],
      },
      google: "not_revoked",
    })
    assert.equal(r.followups.length, 1)
    assert.equal(r.followups[0]?.code, "apple_manual")
    assert.equal(r.google, "not_revoked")
  })

  test("a receipt with no server answer still reads", () => {
    const r = readReceipt({ response: null, google: "bogus" })
    assert.equal(r.summary, null)
    assert.equal(r.google, "none")
  })
})

describe("copy", () => {
  test("zero rows are left out and singulars read right", () => {
    assert.equal(
      describeRemoved({ tripsDeleted: 1, photos: 0, files: 2, chats: 0, bookingsImported: 0, comments: 1 }).join(", "),
      "1 trip, 2 files, 1 comment"
    )
  })

  test("nothing kept says nothing", () => {
    assert.equal(describeKept({ expensesKeptForGroup: 0, settlementsKeptForGroup: 0 }), null)
    assert.match(describeKept({ expensesKeptForGroup: 3, settlementsKeptForGroup: 1 }) ?? "", /^3 expenses and 1 settle-up/)
  })

  test("finishing names the work that is actually left, not always photos", () => {
    assert.deepEqual(describeFinishing("completed", []), [])
    assert.deepEqual(describeFinishing("incomplete", ["media"]), ["A few photos are still being removed"])
    assert.deepEqual(describeFinishing("incomplete", ["cards"]), ["Your bank cards are still being disconnected"])
    assert.deepEqual(describeFinishing("incomplete", ["login", "analytics"]), ["A few last pieces are still being removed"])
    // The status poll carries no list; incomplete still says something.
    assert.deepEqual(describeFinishing("incomplete", []), ["A few last pieces are still being removed"])
  })
})
