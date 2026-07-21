import "server-only"
import { getDriftUpstream } from "./server"

// Server-side destination hero photo: one resolve-place call (shared POI
// cache) → a browser-loadable maps-photo URL. Fail-open to null (the UI
// falls back to the amber gradient).
export async function destinationPhotoUrl(
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
