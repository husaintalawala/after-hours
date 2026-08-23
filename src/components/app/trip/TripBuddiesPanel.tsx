"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

// Travel Buddies — web port of the iOS TravelBuddiesSheet, opened from the
// "Invite" pill on the trip cover exactly as it is on the phone.
//
// This is where the invite link lives now. It was briefly buried in Trip
// Settings, which is not where anyone looks for it and is not what iOS does.
//
// WHAT IS AND ISN'T OFFERED, and why it differs per viewer:
//
//   Roster    — everyone who can see the trip sees it.
//   Invite    — owner AND accepted buddies. create_trip_invite permits both
//               (verified against production), so gating it to the owner would
//               withhold something the server allows.
//   Remove    — OWNER ONLY, because that is the truth: "Trip owner manages
//               buddies" requires trips.user_id = auth.uid(). iOS renders the
//               remove affordance for everyone and the failure is SILENT — a
//               DELETE that RLS filters to zero rows is not an error in
//               Postgres, so PostgREST returns success, the member disappears
//               from the screen, and the server is untouched. This does not
//               reproduce that: the control is hidden from non-owners, and when
//               it IS shown the deleted row count is checked rather than the
//               absence of a thrown error.

export interface TripBuddy {
  id: string
  name: string
  avatarUrl: string | null
  isOwner: boolean
  isMe: boolean
}

export default function TripBuddiesPanel({
  tripId,
  buddies,
  viewerIsOwner,
  onClose,
}: {
  tripId: string
  buddies: TripBuddy[]
  viewerIsOwner: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const db = createClient()

  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [minting, setMinting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function createInvite() {
    if (minting) return
    setMinting(true)
    setError(null)
    setCopied(false)
    try {
      // `as never`: database.types.ts predates migration 20260823210813, so the
      // typed client does not know these function names yet.
      const { data, error: e } = await db.rpc(
        "create_trip_invite" as never,
        { p_trip_id: tripId } as never
      )
      if (e) throw e
      // `returns table(...)` → PostgREST hands back an ARRAY. Reading .token
      // off the response gives undefined and produces a /join/undefined link
      // that the landing page then rejects.
      const token = ((data as { token?: string }[] | null) ?? [])[0]?.token
      if (!token) throw new Error("No invite token came back. Try again.")
      setInviteUrl(`https://drift.after-hours.app/join/${token}`)
    } catch (err) {
      setError(
        (err as { message?: string })?.message ??
          "Couldn't create an invite link. Try again in a moment."
      )
    }
    setMinting(false)
  }

  async function share() {
    if (!inviteUrl) return
    const text = "Come travel with me — here's the plan:"
    // Native share sheet where the browser has one (iOS/Android Safari and
    // Chrome), clipboard everywhere else.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text, url: inviteUrl })
        return
      } catch {
        // User dismissed the sheet, or the browser refused — fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError("Couldn't copy — select the link and copy it manually.")
    }
  }

  async function remove(buddy: TripBuddy) {
    if (removingId) return
    setRemovingId(buddy.id)
    setError(null)
    try {
      const { data, error: e } = await db
        .from("trip_buddies")
        .delete()
        .eq("trip_id", tripId)
        .eq("user_id", buddy.id)
        .select() // ← the whole point: proves a row actually went
      if (e) throw e
      if (!data || data.length === 0) {
        // Zero rows deleted is a permission refusal wearing a success costume.
        throw new Error("You don't have permission to remove people from this trip.")
      }
      router.refresh()
    } catch (err) {
      setError((err as { message?: string })?.message ?? `Couldn't remove ${buddy.name}.`)
    }
    setRemovingId(null)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-[24px] border border-aurora-border bg-aurora-glass p-5 sm:rounded-[24px]"
        style={{ background: "rgba(16,34,47,0.98)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Travel buddies"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-drift-display text-[22px] font-semibold">Travel buddies</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full px-2 py-1 text-[20px] leading-none text-drift-muted hover:text-drift-ink"
          >
            ×
          </button>
        </div>

        {error && (
          <p
            className="mt-3 rounded-xl border px-3 py-2 text-[13px]"
            style={{ borderColor: "rgba(255,99,88,0.35)", color: "rgba(255,140,130,0.95)" }}
          >
            {error}
          </p>
        )}

        {/* ---- Roster ---- */}
        <p className="mb-2 mt-5 text-[11.5px] font-bold uppercase tracking-wider text-drift-muted">
          {buddies.length === 1 ? "1 traveler" : `${buddies.length} travelers`}
        </p>
        <ul className="space-y-1.5">
          {buddies.map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-3 rounded-xl bg-drift-alt-bg px-3 py-2.5"
            >
              {b.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-aurora-teal/20 text-[14px] font-bold text-aurora-teal">
                  {b.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-[14.5px]">
                {b.isMe ? "You" : b.name}
              </span>
              {b.isOwner && (
                <span className="shrink-0 rounded-full bg-aurora-teal/15 px-2.5 py-1 text-[11px] font-semibold text-aurora-teal">
                  Organizer
                </span>
              )}
              {viewerIsOwner && !b.isOwner && (
                <button
                  onClick={() => remove(b)}
                  disabled={removingId === b.id}
                  aria-label={`Remove ${b.name}`}
                  className="shrink-0 text-[13px] font-semibold text-drift-muted hover:text-drift-ink disabled:opacity-50"
                >
                  {removingId === b.id ? "Removing…" : "Remove"}
                </button>
              )}
            </li>
          ))}
        </ul>

        {/* ---- Invite ---- */}
        <p className="mb-2 mt-6 text-[11.5px] font-bold uppercase tracking-wider text-drift-muted">
          Invite
        </p>
        <div className="rounded-xl bg-drift-alt-bg p-4">
          <p className="text-[13px] text-drift-muted">
            Anyone who opens the link can join. Works on any phone or computer —
            they don&apos;t need the app. Expires in 14 days.
          </p>

          {inviteUrl ? (
            <>
              <div className="mt-3 flex items-center gap-2">
                <input
                  readOnly
                  value={inviteUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Invite link"
                  className="min-w-0 flex-1 rounded-lg border border-aurora-border bg-black/25 px-3 py-2 text-[12.5px] outline-none"
                />
                <button
                  onClick={share}
                  className="shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold text-aurora-teal-ink"
                  style={{ background: "linear-gradient(135deg, #37D6C4, #22B7D4)" }}
                >
                  {copied ? "Copied" : "Share"}
                </button>
              </div>
              <button
                onClick={createInvite}
                disabled={minting}
                className="mt-2.5 text-[12.5px] font-semibold text-drift-muted hover:text-drift-ink disabled:opacity-60"
              >
                {minting ? "Creating…" : "Create a different link"}
              </button>
            </>
          ) : (
            <button
              onClick={createInvite}
              disabled={minting}
              className="mt-3 w-full rounded-full px-5 py-2.5 text-[14px] font-semibold text-aurora-teal-ink disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #37D6C4, #22B7D4)" }}
            >
              {minting ? "Creating…" : "Create invite link"}
            </button>
          )}
        </div>

        {!viewerIsOwner && (
          <p className="mt-4 text-[12px] text-drift-muted">
            Only the organizer can remove people from this trip.
          </p>
        )}
      </div>
    </div>
  )
}
