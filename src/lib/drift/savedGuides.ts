import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Inspire guides the reader hearted. Backed by `public.saved_guides`, whose
 * primary key is `(user_id, trip_id)`.
 *
 * WHAT THIS REPLACES. The save control existed on both clients and persisted
 * nowhere real: this file's caller kept a JSON array in localStorage under
 * "drift.inspire.saved", and iOS kept a comma-joined string in UserDefaults
 * under a different key. So a saved guide was invisible on the shelf, on the
 * home, on the other platform, and in any other browser — and the two clients
 * could never agree.
 *
 * THE CASTS ARE DELIBERATE. `saved_guides` is not in `src/lib/database.types.ts`
 * and regenerating that file drops a large unrelated diff into this change —
 * the reasoning is already written out at src/app/i/[slug]/page.tsx and at
 * src/app/app/(protected)/inspire/[tripId]/page.tsx, which take the same route
 * for the same reason. The row shape is asserted here instead, in one place.
 */

interface SavedRow {
  trip_id: string
}

/** Newest save first. null means unavailable, never an empty collection. */
export async function readSavedGuideIds(db: SupabaseClient): Promise<string[] | null> {
  try {
    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser()
    if (authError || !user) return null

    const { data, error } = await db
      .from("saved_guides" as never)
      .select("trip_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
    if (error) return null
    return ((data ?? []) as unknown as SavedRow[]).map((r) => r.trip_id)
  } catch {
    return null
  }
}

/**
 * Flip one guide. Returns whether the write landed, so the caller can put its
 * optimistic state back when it did not — showing a failed write as success is
 * the thing this repo's standing rule forbids.
 *
 * AWAITED, not fired. supabase-js query builders are lazy: an un-awaited
 * `.upsert()` never sends, which is a defect this codebase has already shipped
 * once.
 */
export async function toggleSavedGuide(
  db: SupabaseClient,
  tripId: string,
  next: boolean
): Promise<boolean> {
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return false

  if (next) {
    // ON CONFLICT DO NOTHING, via `ignoreDuplicates` — NOT the default
    // DO UPDATE. Two reasons, and the second one is a hard failure rather than
    // a preference:
    //
    //   * A re-save must not rewrite `created_at`. The Saved list is ordered
    //     newest-first, so a DO UPDATE would silently move a guide you saved
    //     months ago to the top of the list the next time you tapped it.
    //   * DO UPDATE requires the UPDATE privilege, and `authenticated`
    //     deliberately does not have it on this table — the row has nothing
    //     editable in it. The default upsert returned 403 for exactly that
    //     reason.
    const { error } = await db
      .from("saved_guides" as never)
      .upsert({ user_id: user.id, trip_id: tripId } as never, {
        onConflict: "user_id,trip_id",
        ignoreDuplicates: true,
      })
    return !error
  }

  // Scoped to the owner as well as the guide. RLS would enforce it anyway;
  // saying it here means a policy change can never widen what this deletes.
  const { error } = await db
    .from("saved_guides" as never)
    .delete()
    .eq("user_id", user.id)
    .eq("trip_id", tripId)
  return !error
}
