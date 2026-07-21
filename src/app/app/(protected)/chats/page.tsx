import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import type { TripRow } from "@/lib/db-types"

// Chats — the session history (web ChatHomeView): every conversation grouped
// Trips / Places / General, most recent first. Trip sessions open the trip's
// planning studio, where the chat lives docked beside the itinerary.

interface SessionRow {
  id: string
  anchor_type: string
  anchor_id: string | null
  anchor_label: string | null
  title: string | null
  last_message_at: string
}

export default async function ChatsPage() {
  const supabase = createClient()
  // Middleware already verified this request's user; cookie read is enough here.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return null

  const { data: sessionsRaw } = await supabase
    .from("chat_sessions")
    .select("id,anchor_type,anchor_id,anchor_label,title,last_message_at")
    .eq("user_id", user.id)
    .order("last_message_at", { ascending: false })
    .limit(100)
  const sessions = (sessionsRaw ?? []) as SessionRow[]

  // Resolve trip titles for trip-anchored sessions.
  const tripIds = [
    ...new Set(
      sessions
        .filter((s) => s.anchor_type === "trip" && s.anchor_id)
        .map((s) => s.anchor_id!)
    ),
  ]
  const tripTitles = new Map<string, string>()
  if (tripIds.length) {
    const { data: trips } = await supabase
      .from("trips")
      .select("id,title")
      .in("id", tripIds)
      .returns<Pick<TripRow, "id" | "title">[]>()
    for (const t of trips ?? []) tripTitles.set(t.id, t.title)
  }

  const groups: { label: string; sessions: SessionRow[] }[] = [
    { label: "Trips", sessions: sessions.filter((s) => s.anchor_type === "trip") },
    { label: "Places", sessions: sessions.filter((s) => s.anchor_type === "place") },
    { label: "General", sessions: sessions.filter((s) => s.anchor_type === "general") },
  ].filter((g) => g.sessions.length)

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-28 pt-6">
      <h1 className="font-drift-display text-3xl font-medium tracking-tight">Chats</h1>
      <p className="mt-1 text-drift-muted">
        Every conversation with Drift, anchored to what it&rsquo;s about.
      </p>

      {groups.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-4xl opacity-30">💬</p>
          <p className="mt-3 text-[15px] text-drift-muted">
            No chats yet — open a trip and ask Drift anything.
          </p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.label} className="mt-7">
          <h2 className="font-drift-display text-[19px] font-bold">{g.label}</h2>
          <ul className="mt-2 space-y-1.5">
            {g.sessions.map((s) => {
              const label =
                (s.anchor_type === "trip" && s.anchor_id
                  ? tripTitles.get(s.anchor_id)
                  : null) ??
                s.anchor_label ??
                "Chat"
              const row = (
                <div className="flex items-center gap-3 rounded-xl border border-drift-divider bg-white px-3.5 py-3 transition-colors hover:border-drift-coral/40">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-drift-coral-50 text-[16px]">
                    {g.label === "Trips" ? "🧭" : g.label === "Places" ? "📍" : "✦"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-semibold">{label}</p>
                    <p className="truncate text-[12.5px] text-drift-muted">
                      {s.title ?? "New conversation"}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11.5px] text-drift-text-tertiary">
                    {relativeTime(s.last_message_at)}
                  </span>
                </div>
              )
              return (
                <li key={s.id}>
                  {s.anchor_type === "trip" && s.anchor_id ? (
                    <Link href={`/app/trips/${s.anchor_id}`}>{row}</Link>
                  ) : (
                    <div className="opacity-70">{row}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </main>
  )
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
