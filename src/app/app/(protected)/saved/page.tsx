import { createClient } from "@/lib/supabase/server"
import { readSavedGuideIds } from "@/lib/drift/savedGuides"
import { buildSavedGuides } from "@/lib/drift/inspirePromo"
import SavedShell from "@/components/app/saved/SavedShell"

/**
 * Everything this reader kept.
 *
 * The web counterpart of the phone's pushed Saved screen, and the destination
 * the home band's "See all" points at. It exists because the parity rule is
 * that a feature ships on both platforms — a Saved surface the phone has and
 * the laptop does not is half a feature.
 *
 * THIS PAGE FETCHES AND DECODES; SavedShell renders. The Inspire shelf's own
 * page carries that split and the reason: the page must not become a client
 * component, or the whole corpus read moves into the browser.
 */

export const metadata = { title: "Saved · Drift" }

export default async function SavedPage() {
  const supabase = await createClient()
  // Middleware already verified this request's user; the cookie read is enough,
  // the same as the home.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.user) return null

  const ids = await readSavedGuideIds(supabase)
  // Newest saved first — `readSavedGuideIds` orders by created_at desc and
  // buildSavedGuides preserves that rather than reimposing the curated rank.
  const cards = await buildSavedGuides(supabase, ids)

  // `ids.length`, not `cards.length`: a guide that has been de-listed since it
  // was saved drops out of `cards` and the difference is what the empty state
  // needs to not claim the account has nothing.
  return <SavedShell cards={cards} savedCount={ids.length} />
}
