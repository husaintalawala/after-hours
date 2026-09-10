import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { photoAt, photoSrcSet } from "./inspire.ts"

// Which photo bytes a browser is offered, and at what sizes.
//
// The defect this pins: the full-bleed first-run backdrop asked its host for
// ONE width — 1200, a constant sized for a phone — and then stretched it across
// the whole window. On a laptop at 2x that is a ~2.5x upscale, and it looked
// like it. `sizes="100vw"` was already being passed and did nothing, because a
// single-candidate <img> has nothing to choose between; the pair is what works.
//
// The other half of the invariant is a licence one. Unsplash and Wikimedia are
// deliberately absent from OptimizedImg's allow-list, because routing their
// bytes through Vercel's optimizer would re-host them. So every candidate here
// has to remain a URL on the photo's OWN host — a srcset that pointed anywhere
// else would be the exact breach that component exists to prevent.

const WIKI =
  "https://commons.wikimedia.org/wiki/Special:FilePath/Cala_Paura_-_Virginia_Cassano.jpg"
const UNSPLASH = "https://images.unsplash.com/photo-1234567890"

describe("photoSrcSet", () => {
  test("offers every width, each as its own candidate", () => {
    const set = photoSrcSet(WIKI, [800, 1600, 2560])
    assert.ok(set)
    const parts = set.split(", ")
    assert.equal(parts.length, 3)
    assert.deepEqual(
      parts.map((p) => p.split(" ").pop()),
      ["800w", "1600w", "2560w"]
    )
  })

  test("every candidate is the photo's OWN host, never our optimizer", () => {
    // The licence invariant. If this ever fails, the fix is not to update the
    // assertion — it is that the bytes are being re-hosted.
    for (const url of [WIKI, UNSPLASH]) {
      const set = photoSrcSet(url, [400, 1200])
      assert.ok(set)
      const origin = new URL(url).origin
      for (const cand of set.split(", ")) {
        assert.ok(
          cand.startsWith(origin),
          `candidate left the origin: ${cand.slice(0, 80)}`
        )
      }
    }
  })

  test("each candidate is what photoAt would have produced alone", () => {
    // The srcset must not become a second, divergent way of asking for a
    // width — the `src` and the candidates have to agree on what 1200 means.
    const set = photoSrcSet(WIKI, [1200, 2048])
    assert.ok(set)
    assert.equal(set.split(", ")[0], `${photoAt(WIKI, 1200)} 1200w`)
  })

  test("null for a host we cannot resize, so the caller falls back to one src", () => {
    // Google Place Photos go through a streaming proxy and must never be
    // re-hosted or cached; there is no width to ask for, and inventing
    // candidates that are all the same URL would be a srcset that lies about
    // having choices.
    assert.equal(photoSrcSet("https://maps.example.com/proxy?ref=abc", [400, 800]), null)
    assert.equal(photoSrcSet("not a url at all", [400, 800]), null)
    assert.equal(photoSrcSet(null, [400, 800]), null)
    assert.equal(photoSrcSet(undefined, [400, 800]), null)
  })

  test("null for a Wikimedia URL that is not a Special:FilePath", () => {
    // photoAt can only size the FilePath form; for anything else it returns the
    // URL untouched, which would make every candidate identical.
    assert.equal(
      photoSrcSet("https://upload.wikimedia.org/wikipedia/commons/a/ab/X.jpg", [400, 800]),
      null
    )
  })

  test("a url that ALREADY carries a width still gets a srcset", () => {
    // THE REGRESSION. `inspire_trips.hero_url` is stored with `?width=1200`
    // baked in, so asking photoAt for 1200 legitimately returns a string equal
    // to its input. The first guard here was `if (at === url) return null`,
    // which read that as "this host cannot be sized" and returned null for
    // EVERY real row — while every fixture above, none of which carried a
    // width, passed. The feature was dead in production and green in CI; it
    // was caught by measuring the rendered <img>, not by a test.
    const stored = `${WIKI}?width=1200`
    const set = photoSrcSet(stored, [800, 1200, 1600, 2048])
    assert.ok(set, "a stored, width-baked hero url must still produce candidates")
    assert.equal(set.split(", ").length, 4)
    // And the candidate at the baked width is the input itself, which is fine —
    // what matters is that the OTHERS differ from it.
    const widths = set.split(", ").map((c) => {
      const u = new URL(c.trim().split(" ")[0])
      return u.searchParams.get("width")
    })
    assert.deepEqual(widths, ["800", "1200", "1600", "2048"])
  })

  test("fewer than two distinct widths is not a choice", () => {
    assert.equal(photoSrcSet(WIKI, [1200]), null)
    assert.equal(photoSrcSet(WIKI, []), null)
    // Duplicates collapse, and what collapses to one candidate is not a srcset.
    assert.equal(photoSrcSet(WIKI, [1200, 1200]), null)
  })

  test("the ladder spans a phone to a retina laptop", () => {
    // The point of the change: the smallest candidate must still be phone-sized
    // so a phone does not pay for a laptop's photo, and the largest must cover a
    // ~1500pt window at 2x, which is what was being upscaled from 1200.
    const widths = [800, 1200, 1600, 2048, 2560, 3200]
    const set = photoSrcSet(WIKI, widths)
    assert.ok(set)
    const declared = set.split(", ").map((p) => Number(p.split(" ").pop()!.replace("w", "")))
    assert.equal(Math.min(...declared), 800)
    assert.ok(Math.max(...declared) >= 3000, "top of the ladder must cover 1500pt at 2x")
  })
})
