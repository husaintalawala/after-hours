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
    return created?.id ?? null
  } catch {
    return null
  }
}

export async function loadSessionMessages(sessionId: string): Promise<StoredMessage[]> {
  try {
    const supabase = db()
    const { data } = await supabase
      .from("trip_chat_messages")
      .select("role,text,created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(100)
    return (data ?? []).map((m: { role: string; text: string }) => ({
      role: m.role,
      text: m.text,
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
      .select("role,text,created_at")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: true })
      .limit(100)
    return (data ?? []).map((m: { role: string; text: string }) => ({
      role: m.role,
      text: m.text,
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
    })
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
    await supabase.from("chat_sessions").update(patch).eq("id", sessionId)
  } catch {
    /* fail-open */
  }
}
