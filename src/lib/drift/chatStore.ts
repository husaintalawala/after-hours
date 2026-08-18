// Chat persistence — mirrors the iOS ChatStore: one chat_sessions row per
// anchor (find-or-create), every turn saved to trip_chat_messages (trip-
// anchored messages also set trip_id so shared-trip histories work). All
// writes are fail-open: persistence must never block the conversation.

import { createClient } from "@/lib/supabase/client"

// The generated generics degrade to `never` on chained filters for these
// tables; an untyped handle keeps the calls working (shapes are asserted at
// the call sites, and every path is fail-open anyway).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient()

export interface StoredMessage {
  role: string
  text: string
  /** Author of a user turn on a SHARED trip thread. Absent on personal chats. */
  userId?: string | null
}

/** Signed-in user id, for deciding which turns are the viewer's own. */
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const {
      data: { user },
    } = await db().auth.getUser()
    return user?.id ?? null
  } catch {
    return null
  }
}

/**
 * Display names for a shared thread's authors, in ONE query.
 *
 * Not a PostgREST embed: trip_chat_messages.user_id references auth.users, not
 * public.profiles, so `select("...,profiles(username)")` returns PGRST200 and
 * the whole load fails closed to a blank thread. profiles' only SELECT policy
 * is `auth.uid() IS NOT NULL`, so any signed-in member can resolve any author.
 */
export async function loadAuthorNames(ids: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (!unique.length) return {}
  try {
    const { data } = await db()
      .from("profiles")
      .select("id,username,display_name")
      .in("id", unique)
    const out: Record<string, string> = {}
    for (const r of data ?? []) {
      out[r.id] = (r.display_name || "").trim() || (r.username || "").trim() || "Traveler"
    }
    return out
  } catch {
    return {}
  }
}

export async function ensureTripSession(tripId: string): Promise<string | null> {
  try {
    const supabase = db()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data: existing } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("user_id", user.id)
      .eq("anchor_type", "trip")
      .eq("anchor_id", tripId)
      .is("merged_into", null) // never reopen a merged-away duplicate thread
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing?.id) return existing.id

    const { data: created } = await supabase
      .from("chat_sessions")
      .insert({
        user_id: user.id,
        anchor_type: "trip",
        anchor_id: tripId,
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single()
      .throwOnError()
    return created?.id ?? null
  } catch (e) {
    // null here means "no session" to every caller, so a failed insert looked
    // identical to a signed-out user and the chat silently stopped persisting.
    console.error("[chatStore] could not open a chat session", e)
    return null
  }
}

export async function loadSessionMessages(sessionId: string): Promise<StoredMessage[]> {
  try {
    const supabase = db()
    const { data } = await supabase
      .from("trip_chat_messages")
      .select("role,text,created_at,user_id")
      // Newest-first then reversed. Ordering ascending WITH a limit returns the
      // OLDEST 100, which silently pins a long thread to its beginning.
      .order("created_at", { ascending: false })
      .eq("session_id", sessionId)
      .limit(100)
    return (data ?? [])
      .slice()
      .reverse()
      .map((m: { role: string; text: string; user_id?: string | null }) => ({
        role: m.role,
        text: m.text,
        userId: m.user_id ?? null,
      }))
  } catch {
    return []
  }
}

// Trip chat history is keyed by trip_id — every trip-anchored turn sets it (see
// the header note: "so shared-trip histories work"). Loading by trip_id (not a
// single session_id) is what makes the full transcript appear regardless of
// which session row a turn was written under: iOS-created sessions, pre-merge
// duplicate threads whose messages were never re-pointed to the canonical
// session, and shared-trip buddies whose own session id differs. The trip chat
// consolidates all of these into one thread (matching the Chats sidebar's
// one-row-per-trip grouping).
export async function loadTripMessages(tripId: string): Promise<StoredMessage[]> {
  try {
    const supabase = db()
    const { data } = await supabase
      .from("trip_chat_messages")
      .select("role,text,created_at,user_id")
      .eq("trip_id", tripId)
      // Newest-first then reversed — see loadSessionMessages. This matters more
      // here: a shared group thread is several members' turns combined, so the
      // oldest-100 bug shows the start of the trip instead of the current state.
      .order("created_at", { ascending: false })
      .limit(100)
    return (data ?? [])
      .slice()
      .reverse()
      .map((m: { role: string; text: string; user_id?: string | null }) => ({
        role: m.role,
        text: m.text,
        userId: m.user_id ?? null,
      }))
  } catch {
    return []
  }
}

export async function saveMessage(
  sessionId: string,
  tripId: string | null,
  role: "user" | "assistant",
  text: string
): Promise<void> {
  try {
    const supabase = db()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from("trip_chat_messages").insert({
      session_id: sessionId,
      trip_id: tripId,
      user_id: user.id,
      role,
      text,
    }).throwOnError()
    const patch: { last_message_at: string; title?: string } = {
      last_message_at: new Date().toISOString(),
    }
    if (role === "user") {
      // First user message titles an untitled session (iOS auto-titles via
      // Claude; a truncated first message is the pragmatic web equivalent).
      const { data: s } = await supabase
        .from("chat_sessions")
        .select("title")
        .eq("id", sessionId)
        .maybeSingle()
      if (s && !s.title) patch.title = text.slice(0, 60)
    }
    await supabase.from("chat_sessions").update(patch).eq("id", sessionId).throwOnError()
  } catch (e) {
    // Still fail-open — a persistence failure must not break the live chat UI. But
    // it was previously invisible, so a message the user sent simply was not there
    // next session and nothing recorded why.
    console.error("[chatStore] saveMessage failed; message not persisted", e)
  }
}
