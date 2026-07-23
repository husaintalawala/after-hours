import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { ProfileRow, TripRow } from "@/lib/db-types"
import { countryFlagEmoji } from "@/lib/drift/flags"
import FollowButton from "@/components/app/people/FollowButton"
import BackLink from "@/components/app/BackLink"

// Public profile — reached by tapping a person in the followers/following list.
// Shows their identity, follower/following counts, and the trips visible to the
// viewer (RLS returns only public — or buddy-shared — trips of others).

export default async function ProfilePage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const me = session?.user
  if (!me) return null

  // Viewing your own id → send to Home (your own passport lives there).
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", params.id)
    .maybeSingle<ProfileRow>()
  if (!profile) notFound()

  const [{ count: followers }, { count: following }, { data: iFollowRow }, { data: tripsRaw }] =
    await Promise.all([
      supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", params.id),
      supabase.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", params.id),
      supabase.from("follows").select("follower_id").eq("follower_id", me.id).eq("following_id", params.id).maybeSingle(),
      supabase
        .from("trips")
        .select("*")
        .eq("user_id", params.id)
        .order("start_date", { ascending: false })
        .returns<TripRow[]>(),
    ])
  const trips = tripsRaw ?? [] // RLS already limits this to trips the viewer may see

  const countries = new Set<string>()
  for (const t of trips) for (const c of t.countries ?? []) if (c) countries.add(c)

  const name = profile.display_name || profile.username || "Traveler"

  return (
    <div className="mx-auto w-full max-w-xl px-5 pb-32 pt-8 lg:pt-12">
      <BackLink href="/app/people" label="People" className="mb-5" />

      {/* Identity */}
      <div className="flex items-center gap-4">
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt=""
            className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-drift-coral/60"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-drift-coral-50 font-drift-display text-[28px] font-bold text-drift-coral ring-2 ring-drift-coral/60">
            {name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-drift-display text-[24px] font-bold leading-tight">{name}</p>
          {profile.username && (
            <p className="truncate text-[13px] text-drift-muted">@{profile.username}</p>
          )}
        </div>
        {params.id !== me.id && (
          <FollowButton meId={me.id} targetId={params.id} initiallyFollowing={!!iFollowRow} />
        )}
      </div>

      {/* Stats */}
      <div className="mt-5 flex gap-7 border-b border-drift-divider pb-4">
        <Stat value={countries.size} label="Countries" />
        <Stat value={followers ?? 0} label="Followers" />
        <Stat value={following ?? 0} label="Following" />
      </div>

      {/* Their trips (RLS-scoped to what you can see) */}
      <h2 className="mt-6 font-drift-display text-[19px] font-bold">Trips</h2>
      {trips.length === 0 ? (
        <p className="mt-3 text-[14px] text-drift-muted">No public trips to show.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {trips.map((t) => (
            <li key={t.id}>
              <Link
                href={`/app/trips/${t.id}`}
                className="flex items-center gap-3 rounded-2xl border border-aurora-border bg-aurora-glass p-3.5 transition-colors hover:bg-drift-card-active"
              >
                {t.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.cover_url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                ) : (
                  <div
                    className="h-12 w-12 shrink-0 rounded-xl"
                    style={{ background: "linear-gradient(135deg,#16222F,#0B1A25)" }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{t.title || "Untitled trip"}</p>
                  <p className="truncate text-[12.5px] text-drift-muted">
                    {(t.cities ?? []).filter(Boolean).join(", ") ||
                      (t.countries ?? []).filter(Boolean).join(", ")}
                  </p>
                </div>
                {(t.countries?.[0] ?? null) && (
                  <span className="text-[17px]">{countryFlagEmoji(t.countries![0])}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-[19px] font-bold leading-tight">{value}</p>
      <p className="text-[12px] text-drift-muted">{label}</p>
    </div>
  )
}
