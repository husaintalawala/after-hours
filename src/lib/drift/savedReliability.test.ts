import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"
import ts from "typescript"
import type { SupabaseClient } from "@supabase/supabase-js"
import { readSavedGuideIds, toggleSavedGuide } from "./savedGuides.ts"

// Isolate module caches and replace only IO/React hooks. Compile the actual
// implementation so alias imports work under the project's native Node runner.
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
    runInNewContext(code, { module, exports: module.exports, require, console, Date, Set, Map })
    return module.exports
  }
  return load(resolve(here, name + ".ts"))
}

function dbWith(result: unknown, authError: unknown = null): SupabaseClient {
  const query: any = {}
  for (const name of ["select", "eq", "order"]) query[name] = () => query
  query.then = (yes: any, no: any) => Promise.resolve(result).then(yes, no)
  query.returns = () => Promise.resolve(result)
  return {
    auth: { getUser: async () => ({ data: { user: { id: "reader" } }, error: authError }) },
    from: () => query,
  } as unknown as SupabaseClient
}

test("saved ids distinguish failed/auth/rejected reads from confirmed empty", async () => {
  assert.equal(await readSavedGuideIds(dbWith({ data: null, error: { message: "offline" } })), null)
  assert.equal(await readSavedGuideIds(dbWith({ data: [] }, { message: "expired" })), null)
  const rejected = dbWith({ data: [] })
  rejected.auth.getUser = async () => { throw new Error("network") }
  assert.equal(await readSavedGuideIds(rejected), null)
  assert.deepEqual(await readSavedGuideIds(dbWith({ data: [], error: null })), [])
  assert.deepEqual(await readSavedGuideIds(dbWith({ data: [{ trip_id: "b" }, { trip_id: "a" }] })), ["b", "a"])
})

test("Saved shelf read failure and decode failure cannot mean removed guides", async () => {
  for (const result of [{ data: null, error: { message: "offline" } }, { data: [{}], error: null }]) {
    const { buildSavedGuides } = isolated("inspirePromo")
    assert.equal(await buildSavedGuides(dbWith(result), ["saved"]), null)
  }
})

test("a successfully empty shelf means saved guides are unlisted", async () => {
  const { buildSavedGuides } = isolated("inspirePromo")
  assert.equal((await buildSavedGuides(dbWith({ data: [], error: null }), ["saved"])).length, 0)
})

function places(db: SupabaseClient) {
  const { useSavedPlaces } = isolated("savedPlaces", {
    "@/lib/supabase/client": { createClient: () => db },
    react: { useState: () => [0, () => {}], useCallback: (f: any) => f, useEffect: () => {} },
  })
  return useSavedPlaces() as { isSaved: (id: string) => boolean; toggle: (p: any, a: any, c: string) => Promise<boolean> }
}
const place = { id: "place", name: "Place" }

test("places restore both failed saves and failed unsaves, including thrown writes", async () => {
  for (const alreadySaved of [false, true]) {
    const db = dbWith({ data: alreadySaved ? [{ place_id: place.id }] : [], error: null })
    const from = db.from.bind(db)
    db.from = (() => {
      const query: any = from("saved_places")
      query.upsert = () => Promise.reject(new Error("offline"))
      query.delete = () => { throw new Error("offline") }
      return query
    }) as typeof db.from
    const state = places(db)
    assert.equal(await state.toggle(place, null, "food"), false)
    assert.equal(state.isSaved(place.id), alreadySaved)
  }
})

test("failed place read retries and never writes from invented empty state", async () => {
  let reads = 0
  let writes = 0
  const db = dbWith({ data: [] })
  db.from = (() => {
    reads++
    const source: any = dbWith(reads === 1 ? { data: null, error: { message: "offline" } } : { data: [], error: null }).from("saved_places")
    source.upsert = async () => { writes++; return { error: null } }
    return source
  }) as typeof db.from
  const state = places(db)
  assert.equal(await state.toggle(place, null, "food"), false)
  assert.equal(writes, 0)
  assert.equal(await state.toggle(place, null, "food"), true)
  assert.equal(state.isSaved(place.id), true)
  assert.equal(writes, 1)
})

test("row and sheet cannot issue overlapping writes for the same place", async () => {
  let finish!: (v: unknown) => void
  let writes = 0
  const db = dbWith({ data: [], error: null })
  const from = db.from.bind(db)
  db.from = (() => {
    const query: any = from("saved_places")
    query.upsert = () => { writes++; return new Promise((r) => { finish = r }) }
    return query
  }) as typeof db.from
  const state = places(db)
  const first = state.toggle(place, null, "food")
  assert.equal(await state.toggle(place, null, "food"), false)
  while (!finish) await Promise.resolve()
  finish({ error: null })
  assert.equal(await first, true)
  assert.equal(writes, 1)
  assert.equal(state.isSaved(place.id), true)
})


test("guide writes await persistence and report failed save and unsave", async () => {
  for (const next of [false, true]) {
    for (const failed of [false, true]) {
      let awaited = false
      const db = dbWith({ data: [] })
      const mutation: any = {
        eq: () => mutation,
        then: (yes: any) => { awaited = true; return Promise.resolve({ error: failed ? { message: "offline" } : null }).then(yes) },
      }
      db.from = (() => ({ upsert: () => mutation, delete: () => mutation })) as unknown as typeof db.from
      assert.equal(await toggleSavedGuide(db, "guide", next), !failed)
      assert.equal(awaited, true)
    }
  }
})
