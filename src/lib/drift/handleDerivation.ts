import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Name the account from the identity it signed in with — the web half of
 * Drift/Core/HandleDerivation.swift.
 *
 * WHAT WAS HAPPENING WITHOUT IT. `handle_new_user` inserts `(id, created_at)`
 * and nothing else, and no web code has ever read the OAuth identity. So a
 * Google signup reached the first-run flow's "Is this you?" card showing
 * "Traveler", "@drift" and a letter disc — while the same person on iOS saw
 * their real name, a handle seeded from it and their Google photo. Worse, that
 * card's "Yes, that's me" writes nothing, so agreeing to the placeholders left
 * `username` null for the life of the account, and the editor behind the link
 * then told a Google user "No photo came with your sign-in."
 *
 * FAILS CLOSED, on purpose. Every error path leaves the row exactly as it was
 * and returns false; the caller carries on and the traveller can still name
 * themselves in the editor. Being unable to guess a name must never be able to
 * block a sign-in.
 *
 * IDEMPOTENT. Returns early when the row already has a username, so it is safe
 * on the callback path — which runs again on every OAuth sign-in, not only the
 * first.
 */

/** The database's own alphabet (`profiles_username_shape`) and iOS's
 *  `Handle.normalized`, which must agree or a derived handle is rejected by the
 *  CHECK and the user lands on the form this exists to remove.
 *
 *  ASCII-only is load-bearing rather than parochial: the Swift version once
 *  used a Unicode-aware `isLetter`, so a Cyrillic or Greek display name seeded
 *  a handle the constraint refused. */
export function normalizeHandle(raw: string): string {
  const kept = raw
    .toLowerCase()
    .split("")
    .filter((c) => /[a-z0-9_.]/.test(c))
    .join("")
  // A handle opens with a letter or a digit — "_x" and "..." read as decoration
  // rather than identity, and the latter would be a valid, unclaimable-looking
  // username.
  const opened = kept.replace(/^[._]+/, "")
  // 20, not the 30 the column allows, so the two collision digits below still
  // fit under the cap.
  return opened.slice(0, 20)
}

interface Identity {
  name: string | null
  emailLocalPart: string | null
  avatarUrl: string | null
}

function identityFrom(user: {
  email?: string | null
  user_metadata?: Record<string, unknown> | null
}): Identity {
  const meta = user.user_metadata ?? {}
  const str = (k: string): string | null => {
    const v = meta[k]
    if (typeof v !== "string") return null
    const t = v.trim()
    return t.length ? t : null
  }
  const local = user.email?.split("@")[0]?.trim() || null
  return {
    // The same two sources, in the same order, as the iOS reader — so a handle
    // derived on either platform for one identity comes out the same.
    name: str("full_name") ?? str("name"),
    emailLocalPart: local,
    avatarUrl: str("avatar_url") ?? str("picture"),
  }
}

/** `seed`, else `seed` + two digits four times, else a random handle.
 *
 *  Bounded rather than looping: a collision storm is not a real scenario on
 *  this table, and an unbounded retry on the sign-in path is a spin loop in
 *  front of somebody watching a blank page. A lookup that ERRORS returns null
 *  rather than a guess — a handle we could not verify as free is one we might
 *  be taking from somebody. */
async function firstFreeHandle(
  db: SupabaseClient,
  seed: string,
  excludeId: string
): Promise<string | null> {
  const candidates = [seed]
  for (let i = 0; i < 4; i++) {
    candidates.push(`${seed}${Math.floor(Math.random() * 90) + 10}`)
  }
  candidates.push(`traveler${Math.random().toString(16).slice(2, 8)}`)

  for (const candidate of candidates) {
    const { data, error } = await db
      .from("profiles")
      .select("id")
      .eq("username", candidate)
      .neq("id", excludeId)
      .limit(1)
    if (error) return null
    if (!data?.length) return candidate
  }
  return null
}

export async function deriveProfileIdentity(
  db: SupabaseClient,
  userId: string
): Promise<boolean> {
  try {
    const { data: existing, error: readErr } = await db
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle<{ username: string | null }>()
    // Already named — by a previous sign-in, by the editor, or by the phone.
    // Never overwrite: the traveller's own choice outranks anything derivable.
    if (readErr || existing?.username) return false

    const {
      data: { user },
    } = await db.auth.getUser()
    if (!user || user.id !== userId) return false

    const identity = identityFrom(user)

    let seed = normalizeHandle(identity.name ?? identity.emailLocalPart ?? "")
    if (seed.length < 3) seed = "traveler"

    // NEVER EMPTY. Sixteen of thirty-six profiles once had no display_name
    // because signup never asked, which is why the People tab was a column of
    // rows all reading "Traveler".
    const local = identity.emailLocalPart
    const display =
      identity.name ??
      (local ? local.charAt(0).toUpperCase() + local.slice(1) : null) ??
      "Traveler"

    const handle = await firstFreeHandle(db, seed, userId)
    if (!handle) return false

    const { error } = await db
      .from("profiles")
      .upsert(
        {
          id: userId,
          username: handle,
          display_name: display,
          // Only when there is one. Writing null would blank a photo the
          // traveller uploaded on the phone.
          ...(identity.avatarUrl ? { avatar_url: identity.avatarUrl } : {}),
        },
        { onConflict: "id" }
      )
    return !error
  } catch {
    // Fails closed — see the note at the top.
    return false
  }
}
