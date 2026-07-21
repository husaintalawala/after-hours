import "server-only"
import { getDriftUpstream } from "./server"

// Server-side destination hero photo: one resolve-place call (shared POI
// cache) → a browser-loadable maps-photo URL. Fail-open to null (the UI
// falls back to the amber gradient).
//
// Warm-lambda memo: the URL is destination-keyed (not user-specific), so an
// in-memory TTL cache skips the edge-fn round trip on repeat navigations —
// this call sits on the trip page's critical path.
const memo = new Map<string, { url: string | null; at: number }>()
const MEMO_TTL_MS = 60 * 60 * 1000

export async function destinationPhotoUrl(
  name: string,
  country?: string | null,
  width = 1200
): Promise<string | null> {
  const key = `${name}|${country ?? ""}|${width}`
  const hit = memo.get(key)
  if (hit && Date.now() - hit.at < MEMO_TTL_MS) return hit.url
  const url = await fetchPhotoUrl(name, country, width)
  memo.set(key, { url, at: Date.now() })
  return url
}

async function fetchPhotoUrl(
  name: string,
  country?: string | null,
  width = 1200
): Promise<string | null> {
  try {
    const up = await getDriftUpstream()
    if (!up) return null
    const res = await fetch(`${up.functionsBase}/resolve-place`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${up.token}`,
        apikey: up.anonKey,
      },
      body: JSON.stringify({ query: name, destinationName: name, country: country ?? "" }),
      // Places cache lives server-side (30-day TTL); avoid Next caching a
      // per-user authorized response.
      cache: "no-store",
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
      candidates?: Array<{
        heroImageURL?: string | null
        photoUrl?: string | null
        photoRef?: string | null
      }>
    }
    const c = json.candidates?.[0]
    if (!c) return null
    if (c.heroImageURL) return c.heroImageURL
    if (c.photoUrl) return c.photoUrl
    if (c.photoRef) {
      return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/maps-photo?ref=${encodeURIComponent(
        c.photoRef
      )}&w=${width}&apikey=${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
    }
    return null
  } catch {
    return null
  }
}
