import { createClient } from "@/lib/supabase/client"
import type { TripNoteGroup } from "@/lib/drift/tripNotes"
import { splitNoteURL } from "@/lib/drift/tripNotes"

// Gives a name to a note whose whole body is a pasted map link — the web half
// of iOS's MapLinkResolver, against the same expand-map-link function.
//
// A note reading `https://maps.app.goo.gl/RsDP…` has nothing to render once the
// panel lifts the URL out into a chip, so every one of them showed the same
// placeholder. The short link is opaque; its redirect target is not. On the
// trip that prompted this every link turned out to be a DRIVING ROUTE rather
// than a place, so the name is "Drive · Hvammstangi → Húsavík → Akureyri".
//
// The result is written to the note's own `location_name` — the mirror both
// platforms already read — so one resolve names the note here and on the phone,
// and it never runs again. `notes` keeps the URL, so the chip still opens what
// the user saved.

/** Hosts worth sending. Matches the function's allow-list, so an ordinary web
 *  link in a note costs no round trip. */
const MAP_HOSTS = ["maps.app.goo.gl", "goo.gl", "maps.google.com", "google.com"]

export function isMapLink(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "")
    return MAP_HOSTS.includes(host)
  } catch {
    return false
  }
}

/** Ids attempted this session, so a link that will not expand is not retried on
 *  every render of the panel. */
const attempted = new Set<string>()

/**
 * Resolve every unnamed map-link note in `groups`, writing each name to its
 * step. Resolves to true if anything was written, so the caller can refresh.
 *
 * Bounded per pass: a trip with thirty saved links should not fire thirty
 * redirect-follows the moment the panel opens.
 */
export async function resolveMissingMapLinks(
  groups: TripNoteGroup[],
  limit = 6
): Promise<boolean> {
  const work: { id: string; url: string }[] = []
  for (const g of groups) {
    for (const n of g.notes) {
      if (work.length >= limit) break
      if (n.savedLabel || n.kind !== "note" || attempted.has(n.sourceId)) continue
      const { text, url } = splitNoteURL(n.body)
      // Only a note that is NOTHING BUT a link needs a name; one with its own
      // words already has a title.
      if (text || !url || !isMapLink(url)) continue
      work.push({ id: n.sourceId, url })
    }
  }
  if (!work.length) return false

  const db = createClient()
  let wrote = false
  for (const item of work) {
    attempted.add(item.id)
    try {
      const { data, error } = await db.functions.invoke("expand-map-link", {
        body: { url: item.url },
      })
      if (error) continue
      const label = (data as { ok?: boolean; label?: string | null })?.label
      if (!label) continue
      // location_name only. `notes` keeps the URL the user pasted.
      const { error: writeErr } = await db
        .from("steps")
        .update({ location_name: label.slice(0, 120) })
        .eq("id", item.id)
      if (!writeErr) wrote = true
    } catch {
      // A link that will not expand is not worth surfacing — the note keeps its
      // placeholder and its working chip.
    }
  }
  return wrote
}
