import { NextResponse } from "next/server"
import { getDriftUpstream } from "@/lib/drift/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Proxy to the claude-complete edge function — the plain completion endpoint.
 *
 * WHY THIS ROUTE HAD TO EXIST. Chat on web was trip-scoped all the way down:
 * /api/drift/ask rejects a body with no tripId and forwards it to
 * ask-drift-chat as `trip_id`, which that function requires in nine places. So
 * an account with no trips could not hold a conversation at all — the Chats tab
 * met it with "No trips yet — plan one from Home first", on the screen the
 * home's Ask Drift panel had just sent it to.
 *
 * iOS has never had that wall, and NOT because it uses a cleverer chat
 * function: a trip-anchored thread there goes to ask-drift-chat exactly as web's
 * does, and a place/general one goes to `claude-complete` seeded with the user's
 * trips digest (DriftChatView, "Place/general → claude-complete"). drift-chat is
 * not the general path either — it is the expenses/kit tool loop and requires a
 * trip_id of its own. This route is the missing half of that pair.
 *
 * The upstream contract is small and fixed: POST { system?, user, max_tokens?,
 * model? } answers { ok: true, text, model } or { ok: false, error }. `model` is
 * deliberately NOT forwarded from the client — the function's own note warns
 * that a caller-supplied model lets anyone select the most expensive one
 * available and bill it to us, so the choice stays server-side.
 */
export async function POST(request: Request) {
  const up = await getDriftUpstream()
  if (!up) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const user = typeof body?.user === "string" ? body.user.trim() : ""
  if (!user) {
    return NextResponse.json({ ok: false, error: "missing user" }, { status: 400 })
  }

  const upstream = await fetch(`${up.functionsBase}/claude-complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${up.token}`,
      apikey: up.anonKey,
    },
    body: JSON.stringify({
      system: typeof body?.system === "string" ? body.system : undefined,
      user,
      // 2200 is iOS's number for this call: an itinerary answer carries a
      // trailing machine block on top of the prose, and 500 truncated it.
      max_tokens: Math.min(4000, Number(body?.max_tokens) || 2200),
    }),
  })

  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  })
}
