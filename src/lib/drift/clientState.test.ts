import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"
import ts from "typescript"

// clearUserClientState runs on every sign-out and after account deletion, so
// what it forgets — and what it must NOT forget — is pinned here. It imports
// through the "@/" alias, which Node's runner cannot resolve, so the module is
// compiled and loaded the way savedReliability.test.ts loads its subjects, with
// analytics replaced (the real one would try to import posthog-js).

const here = dirname(fileURLToPath(import.meta.url))
function isolated(name: string, mocks: Record<string, unknown> = {}): any {
  const cache = new Map<string, any>()
  function load(path: string): any {
    if (cache.has(path)) return cache.get(path).exports
    const module = { exports: {} }
    cache.set(path, module)
    const code = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText
    const nativeRequire = createRequire(path)
    const require = (id: string) => {
      if (id in mocks) return mocks[id]
      if (id.startsWith("@/")) return load(resolve(here, "../..", id.slice(2)) + ".ts")
      if (id.startsWith(".")) return load(resolve(dirname(path), id.replace(/\.ts$/, "")) + ".ts")
      return nativeRequire(id)
    }
    runInNewContext(code, { module, exports: module.exports, require, console })
    return module.exports
  }
  return load(resolve(here, name + ".ts"))
}

const { clearUserClientState, isAccountKey } = isolated("clientState", {
  "@/lib/analytics": { resetAnalytics: () => {} },
})

class FakeStorage {
  map = new Map<string, string>()
  constructor(entries: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(entries)) this.map.set(k, v)
  }
  get length() {
    return this.map.size
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null
  }
  getItem(k: string) {
    return this.map.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v))
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
  clear() {
    this.map.clear()
  }
}

const ME = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"

function env(over: Record<string, unknown> = {}) {
  const written: string[] = []
  let resets = 0
  const e = {
    localStorage: new FakeStorage({
      [`drift.discover.recents.${ME}`]: "[]",
      "drift.scanDismissed": "[]",
      "drift_trip_activated_abc": "1",
      defaultTripPrivacy: "private",
      drift_first_seen: "1700000000000",
      driftUnits: "metric",
      driftCurrency: "EUR",
      "mapbox.eventData": "x",
    }),
    sessionStorage: new FakeStorage({ ph_session_started: "1", drift_app_opened: "1" }),
    readCookies: () => `foo=1; drift_daybreak=${OTHER}.${ME}; bar=2`,
    writeCookie: (c: string) => {
      written.push(c)
    },
    secure: true,
    resetAnalytics: () => {
      resets++
    },
    ...over,
  }
  return { e, written, resets: () => resets }
}

test("account keys go; device preferences and foreign keys stay", async () => {
  const { e, resets } = env()
  await clearUserClientState(ME, e)
  assert.deepEqual([...e.localStorage.map.keys()].sort(), ["driftCurrency", "driftUnits", "drift_first_seen", "mapbox.eventData"])
  assert.equal(e.sessionStorage.map.size, 0)
  assert.equal(resets(), 1)
})

test("the key rule, spelled out", () => {
  assert.equal(isAccountKey("drift.anything"), true)
  assert.equal(isAccountKey("drift_anything"), true)
  assert.equal(isAccountKey("defaultTripPrivacy"), true)
  assert.equal(isAccountKey("drift_first_seen"), false)
  assert.equal(isAccountKey("driftLanguage"), false)
  assert.equal(isAccountKey("ph_phc_key_posthog"), false)
})

test("only this account leaves the Daybreak cookie, and Secure is kept", async () => {
  const { e, written } = env()
  await clearUserClientState(ME, e)
  assert.equal(written.length, 1)
  assert.match(written[0], new RegExp(`^drift_daybreak=${OTHER}; Path=/; Max-Age=\\d+; SameSite=Lax; Secure$`))
})

test("the last account expires the cookie", async () => {
  const { e, written } = env({ readCookies: () => `drift_daybreak=${ME}`, secure: false })
  await clearUserClientState(ME, e)
  assert.deepEqual(written, ["drift_daybreak=; Path=/; Max-Age=0; SameSite=Lax"])
})

test("a cookie that never saw this account is not rewritten", async () => {
  const { e, written } = env({ readCookies: () => `drift_daybreak=${OTHER}` })
  await clearUserClientState(ME, e)
  assert.equal(written.length, 0)
})

test("an unknown user still clears storage but leaves the cookie alone", async () => {
  const { e, written, resets } = env()
  await clearUserClientState(null, e)
  assert.equal(e.localStorage.map.has("drift.scanDismissed"), false)
  assert.equal(written.length, 0)
  assert.equal(resets(), 1)
})

test("blocked storage and a throwing analytics reset cannot stop the rest", async () => {
  const broken = {
    get length(): number {
      throw new Error("SecurityError")
    },
  }
  const { e, written } = env({
    localStorage: broken,
    sessionStorage: null,
    resetAnalytics: () => {
      throw new Error("posthog")
    },
  })
  await clearUserClientState(ME, e)
  assert.equal(written.length, 1)
})

test("no browser, no work", async () => {
  await clearUserClientState(ME, null)
})
