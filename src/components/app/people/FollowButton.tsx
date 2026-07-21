"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

// Follow / unfollow toggle (web FollowService port): inserts or deletes the
// follows row for the signed-in user, optimistic label flip + router.refresh.

export default function FollowButton({
  meId,
  targetId,
  initiallyFollowing,
}: {
  meId: string
  targetId: string
  initiallyFollowing: boolean
}) {
  const router = useRouter()
  const [following, setFollowing] = useState(initiallyFollowing)
  const [busy, setBusy] = useState(false)

  async function toggle() {
    if (busy) return
    setBusy(true)
    const next = !following
    setFollowing(next)
    const db = createClient() as any
    const { error } = next
      ? await db.from("follows").insert({ follower_id: meId, following_id: targetId })
      : await db
          .from("follows")
          .delete()
          .eq("follower_id", meId)
          .eq("following_id", targetId)
    if (error) setFollowing(!next) // revert on failure
    setBusy(false)
    router.refresh()
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-bold transition-colors disabled:opacity-60 ${
        following
          ? "bg-drift-alt-bg text-drift-muted hover:text-drift-ink"
          : "bg-drift-coral text-white hover:opacity-90"
      }`}
    >
      {following ? "Following" : "Follow"}
    </button>
  )
}
