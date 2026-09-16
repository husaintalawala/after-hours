import { test, describe } from "node:test"
import assert from "node:assert/strict"
import {
  checkExportAccountRequest,
  describeExportContents,
  describeSize,
  mapExportUpstream,
  prepareExportDownload,
  readExportResponse,
  safeExportFilename,
  serializeExportDocument,
} from "./exportAccount.ts"

// The export route hands a person every row Drift holds about them, so what it
// accepts — and what it will write to their disk — is pinned here rather than
// trusted to review. The route itself imports next/server and the cookie
// client, which Node cannot load; every decision it makes lives in
// exportAccount.ts for exactly that reason.

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

// The origin rule itself (isSameOriginRequest) is pinned in
// deleteAccount.test.ts; the route passes its verdict in, so what is tested
// here is that the verdict is obeyed.
const check = (body: unknown, over: Record<string, string | null> = {}, sameOrigin = true) =>
  checkExportAccountRequest(headers(over), typeof body === "string" ? body : JSON.stringify(body), sameOrigin)

const AT = new Date("2026-09-15T04:12:00Z")

describe("request", () => {
  test("our own page asking for a preview or an export is accepted", () => {
    for (const mode of ["preview", "export"]) {
      assert.deepEqual(check({ mode }), { ok: true, mode, forward: { mode } })
    }
  })

  test("another origin is a 403, whatever the body says", () => {
    assert.deepEqual(check("not json", {}, false), { ok: false, status: 403, code: "forbidden" })
    assert.deepEqual(check({ mode: "export" }, {}, false), { ok: false, status: 403, code: "forbidden" })
  })

  test("only JSON is accepted", () => {
    assert.deepEqual(check({ mode: "preview" }, { "content-type": "text/plain" }), {
      ok: false,
      status: 415,
      code: "unsupported_media_type",
    })
    assert.equal(check({ mode: "preview" }, { "content-type": "application/json; charset=utf-8" }).ok, true)
  })

  test("no body, a non-object body or an unknown mode is a 400", () => {
    for (const body of ["", "not json", "[]", "null", JSON.stringify({}), JSON.stringify({ mode: "everything" })]) {
      assert.deepEqual(check(body), { ok: false, status: 400, code: "bad_request" }, body)
    }
  })

  test("the forwarded body carries nothing but the mode", () => {
    // Anything else a browser sends is dropped: the edge function reads the
    // account from the JWT, so a user id here could only ever be an attempt to
    // export somebody else.
    assert.deepEqual(check({ mode: "export", user_id: "someone-else", tables: ["*"] }), {
      ok: true,
      mode: "export",
      forward: { mode: "export" },
    })
  })
})

describe("upstream answers", () => {
  const network = { ok: false, status: 502, body: { ok: false, code: "network" } }

  test("a handled JSON answer is passed through verbatim", () => {
    const body = JSON.stringify({ ok: true, filename: "drift-export-2026-09-15.json", document: { a: 1 } })
    assert.deepEqual(mapExportUpstream(200, body), { ok: true, status: 200, text: body })
    const refusal = JSON.stringify({ ok: false, code: "too_large" })
    assert.deepEqual(mapExportUpstream(200, refusal), { ok: true, status: 200, text: refusal })
  })

  test("gateway pages, 5xx and bodies without a verdict become network — never a file", () => {
    // Saving a gateway error page as "your data" is worse than saying it failed.
    assert.deepEqual(mapExportUpstream(200, "<html>504 Gateway Timeout</html>"), network)
    assert.deepEqual(mapExportUpstream(504, ""), network)
    assert.deepEqual(mapExportUpstream(500, JSON.stringify({ ok: false, error: "boom" })), network)
    assert.deepEqual(mapExportUpstream(200, JSON.stringify({ document: {} })), network)
    assert.deepEqual(mapExportUpstream(200, "[]"), network)
  })

  test("401 is its own code", () => {
    assert.deepEqual(mapExportUpstream(401, "Unauthorized"), {
      ok: false,
      status: 401,
      body: { ok: false, code: "unauthorized" },
    })
  })
})

describe("readers", () => {
  test("no answer at all reads as network", () => {
    const r = readExportResponse(null)
    assert.equal(r.ok, false)
    assert.equal(r.code, "network")
    assert.equal(r.document, null)
  })

  test("a preview missing keys reads as zeros, not as a crash", () => {
    const r = readExportResponse({ ok: true, counts: { trips: 3, photos: 41 }, estimated_bytes: 240_000 })
    assert.equal(r.counts?.trips, 3)
    assert.equal(r.counts?.photos, 41)
    assert.equal(r.counts?.guidesSaved, 0)
    assert.equal(r.estimatedBytes, 240_000)
  })

  test("an export answer keeps the document exactly as it arrived", () => {
    const doc = { drift_export_version: 1, trips: [{ id: "t1", steps: [] }], excluded: [] }
    const r = readExportResponse({ ok: true, filename: "drift-export-2026-09-15.json", document: doc })
    assert.deepEqual(r.document, doc)
    assert.equal(r.filename, "drift-export-2026-09-15.json")
  })
})

describe("the saved file", () => {
  test("the server's name is used when it is a plain name", () => {
    assert.equal(safeExportFilename("drift-export-2026-09-15.json", AT), "drift-export-2026-09-15.json")
  })

  test("a path, a hidden file or a missing extension is cleaned up", () => {
    // This string becomes an <a download> attribute; a "../" or a leading dot
    // is the browser's problem to interpret, so it never gets one.
    assert.equal(safeExportFilename("../../etc/passwd", AT), "passwd.json")
    assert.equal(safeExportFilename("..\\windows\\system32\\drivers", AT), "drivers.json")
    assert.equal(safeExportFilename(".bashrc", AT), "bashrc.json")
    assert.equal(safeExportFilename("my data (2).json", AT), "my-data-2-.json")
    assert.equal(safeExportFilename("export", AT), "export.json")
  })

  test("a missing or unusable name falls back to today's date", () => {
    const fallback = "drift-export-2026-09-15.json"
    assert.equal(safeExportFilename(null, AT), fallback)
    assert.equal(safeExportFilename(42, AT), fallback)
    assert.equal(safeExportFilename("   ", AT), fallback)
    assert.equal(safeExportFilename("...", AT), fallback)
  })

  test("the document is written pretty-printed, so a person can read it", () => {
    assert.equal(serializeExportDocument({ a: [1] }), '{\n  "a": [\n    1\n  ]\n}')
  })

  test("an answer with a document becomes a name and the bytes to save", () => {
    const res = readExportResponse({ ok: true, filename: "drift-export-2026-09-15.json", document: { a: 1 } })
    assert.deepEqual(prepareExportDownload(res, AT), {
      filename: "drift-export-2026-09-15.json",
      json: '{\n  "a": 1\n}',
    })
  })

  test("an answer with no document saves nothing at all", () => {
    // JSON.stringify(null) is the four characters "null". Handing someone that
    // as their data — after a spinner that said it was working — is the one
    // ending this screen must never produce.
    assert.equal(prepareExportDownload(readExportResponse({ ok: true })), null)
    assert.equal(prepareExportDownload(readExportResponse({ ok: false, code: "network" })), null)
    assert.equal(prepareExportDownload(readExportResponse(null)), null)
    // An `ok:false` that somehow still carried rows is refused too.
    assert.equal(prepareExportDownload(readExportResponse({ ok: false, document: { a: 1 } })), null)
  })
})

describe("copy", () => {
  test("empty sections are left out and singulars read right", () => {
    assert.equal(
      describeExportContents({
        trips: 1,
        photos: 0,
        files: 2,
        expenses: 0,
        chats: 0,
        bookingsImported: 1,
        placesSaved: 0,
        guidesSaved: 0,
      }).join(", "),
      "1 trip, 2 files, 1 imported booking"
    )
  })

  test("an unknown or empty size says nothing rather than 0 KB", () => {
    assert.equal(describeSize(null), null)
    assert.equal(describeSize(0), null)
    assert.equal(describeSize(400), "under 1 KB")
    assert.equal(describeSize(240_000), "about 234 KB")
    assert.equal(describeSize(2_500_000), "about 2.4 MB")
  })
})
