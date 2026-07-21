import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import type { ProfileRow } from "@/lib/db-types"
import FollowButton from "@/components/app/people/FollowButton"
import BackLink from "@/components/app/BackLink"

// Followers / Following — web port of the iOS follower-list screens, reached
// from the home profile stats. Tabbed list with follow/unfollow.

interface FollowRow {
  follower_id: string
  following_id: string
}

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const tab = searchParams.tab === "following" ? "following" : "followers"
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return null

  // Both edges in parallel: who follows me, who I follow.
  const [{ data: followerRows }, { data: followingRows }] = await Promise.all([
    supabase
      .from("follows")
      .select("follower_id, following_id")
      .eq("following_id", user.id)
      .returns<FollowRow[]>(),
    supabase
      .from("follows")
      .select("follower_id, following_id")
      .eq("follower_id", user.id)
      .returns<FollowRow[]>(),
  ])

  const followerIds = (followerRows ?? []).map((r) => r.follower_id)
  const followingIds = (followingRows ?? []).map((r) => r.following_id)
  const iFollow = new Set(followingIds)
  const listIds = tab === "followers" ? followerIds : followingIds

  let profiles: ProfileRow[] = []
  if (listIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .in("id", listIds)
      .returns<ProfileRow[]>()
    profiles = data ?? []
    // Preserve the follows-row order (newest edges first would need
    // created_at; alphabetical is stable and predictable).
    profiles.sort((a, b) =>
      (a.display_name || a.username || "").localeCompare(
        b.display_name || b.username || ""
      )
    )
  }

  return (
    <div className="mx-auto w-full max-w-xl px-5 pb-32 pt-8 lg:pt-12">
      <BackLink href="/app" label="Home" className="mb-5" />
      <h1 className="font-drift-display text-[28px] font-bold">People</h1>

      {/* Tabs */}
      <div className="mt-5 flex gap-2">
        <Tab
          href="/app/people?tab=followers"
          active={tab === "followers"}
          label={`Followers · ${followerIds.length}`}
        />
        <Tab
          href="/app/people?tab=following"
          active={tab === "following"}
          label={`Following · ${followingIds.length}`}
        />
      </div>

      <ul className="mt-5 space-y-2">
        {profiles.map((p) => (
          <li
            key={p.id}
            className="flex items-center gap-3.5 rounded-2xl bg-white p-3.5 shadow-sm"
          >
            {p.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.avatar_url}
                alt=""
                className="h-12 w-12 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-drift-coral-50 font-drift-display text-[17px] font-bold text-drift-coral">
                {(p.display_name || p.username || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">
                {p.display_name || p.username || "Traveler"}
              </p>
              {p.username && (
                <p className="truncate text-[12.5px] text-drift-muted">@{p.username}</p>
              )}
            </div>
            {p.id !== user.id && (
              <FollowButton
                meId={user.id}
                targetId={p.id}
                initiallyFollowing={iFollow.has(p.id)}
              />
            )}
          </li>
        ))}
      </ul>

      {profiles.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-4xl opacity-30">{tab === "followers" ? "👋" : "🧭"}</p>
          <p className="mt-3 text-[14.5px] text-drift-muted">
            {tab === "followers"
              ? "No followers yet — share a trip to get started."
              : "You're not following anyone yet."}
          </p>
        </div>
      )}
    </div>
  )
}

function Tab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-4 py-2 text-[13.5px] font-semibold transition-colors ${
        active
          ? "bg-drift-coral text-white"
          : "bg-white text-drift-muted shadow-sm hover:text-drift-ink"
      }`}
    >
      {label}
    </Link>
  )
}
