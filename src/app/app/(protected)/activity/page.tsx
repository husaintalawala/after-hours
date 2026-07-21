import { createClient } from "@/lib/supabase/server"
import type { ProfileRow, TripRow } from "@/lib/db-types"

// Activity — the notifications feed (web NotificationsView): likes, comments,
// follows, grouped Today / This week / Earlier, with actor avatars.

interface NotifRow {
  id: string
  type: string
  actor_id: string
  trip_id: string | null
  created_at: string | null
  read: boolean | null
}

export default async function ActivityPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: notifsRaw } = await supabase
    .from("notifications")
    .select("id,type,actor_id,trip_id,created_at,read")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(60)
  const notifs = (notifsRaw ?? []) as NotifRow[]

  // Actors + trip titles in two batched lookups.
  const actorIds = [...new Set(notifs.map((n) => n.actor_id).filter(Boolean))]
  const tripIds = [...new Set(notifs.map((n) => n.trip_id).filter((x): x is string => !!x))]
  const actors = new Map<string, Pick<ProfileRow, "username" | "display_name" | "avatar_url">>()
  const tripTitles = new Map<string, string>()
  if (actorIds.length) {
    const { data } = await supabase
      .from("profiles")
      .select("id,username,display_name,avatar_url")
      .in("id", actorIds)
      .returns<Array<Pick<ProfileRow, "id" | "username" | "display_name" | "avatar_url">>>()
    for (const p of data ?? []) actors.set(p.id, p)
  }
  if (tripIds.length) {
    const { data } = await supabase
      .from("trips")
      .select("id,title")
      .in("id", tripIds)
      .returns<Pick<TripRow, "id" | "title">[]>()
    for (const t of data ?? []) tripTitles.set(t.id, t.title)
  }

  // Group by recency.
  const now = Date.now()
  const groups: { label: string; items: NotifRow[] }[] = [
    { label: "Today", items: [] },
    { label: "This week", items: [] },
    { label: "Earlier", items: [] },
  ]
  for (const n of notifs) {
    const t = n.created_at ? new Date(n.created_at).getTime() : 0
    const days = (now - t) / 86_400_000
    if (days < 1) groups[0].items.push(n)
    else if (days < 7) groups[1].items.push(n)
    else groups[2].items.push(n)
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-28 pt-6">
      <h1 className="font-drift-display text-3xl font-medium tracking-tight">Activity</h1>

      {notifs.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-4xl opacity-30">🔔</p>
          <p className="mt-3 text-[15px] text-drift-muted">
            Nothing yet — likes, comments and follows land here.
          </p>
        </div>
      )}

      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <section key={g.label} className="mt-7">
            <h2 className="font-drift-display text-[19px] font-bold">{g.label}</h2>
            <ul className="mt-2 space-y-1">
              {g.items.map((n) => {
                const actor = actors.get(n.actor_id)
                const name = actor?.display_name || actor?.username || "Someone"
                const tripTitle = n.trip_id ? tripTitles.get(n.trip_id) : null
                return (
                  <li
                    key={n.id}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                      n.read ? "" : "bg-drift-coral-50/50"
                    }`}
                  >
                    {actor?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={actor.avatar_url}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-drift-alt-bg font-drift-display text-[15px] font-bold text-drift-muted">
                        {name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <p className="min-w-0 flex-1 text-[14px] leading-snug">
                      <span className="font-semibold">{name}</span>{" "}
                      {notifText(n.type, tripTitle)}
                    </p>
                    <span className="shrink-0 text-[11.5px] text-drift-text-tertiary">
                      {n.created_at ? relativeTime(n.created_at) : ""}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
    </main>
  )
}

function notifText(type: string, tripTitle: string | null | undefined): string {
  const trip = tripTitle ? `“${tripTitle}”` : "your trip"
  switch (type) {
    case "like":
      return `liked ${trip}`
    case "comment":
      return `commented on ${trip}`
    case "comment_like":
      return "liked your comment"
    case "follow":
      return "started following you"
    case "trip_invite":
      return `invited you to ${trip}`
    case "reservation":
      return `added a reservation to ${trip}`
    default:
      return type.replace(/_/g, " ")
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (isNaN(then)) return ""
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (mins < 1) return "now"
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
