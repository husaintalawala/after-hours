import { createClient } from "@/lib/supabase/server"
import type { StepRow, TripRow } from "@/lib/db-types"
import { dateOnly } from "@/lib/drift/dates"
import { destinationPhotoUrl } from "@/lib/drift/placePhoto"
import ChatsShell, {
  type ChatSessionVM,
  type MeVM,
  type TripPickVM,
} from "@/components/app/chats/ChatsShell"

// Chats — server loader for the sidebar-and-thread shell. Cover photos come
// from the same chain the app uses everywhere: trips.cover_url → first photo
// media → destination photo via the shared POI cache (maps-photo streaming
// proxy — no rehosted bytes).

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
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return null

  const [{ data: sessionsRaw }, { data: profile }, { data: tripsRaw }, { data: buddyRows }] =
    await Promise.all([
      supabase
        .from("chat_sessions")
        .select("id,anchor_type,anchor_id,anchor_label,title,last_message_at")
        .eq("user_id", user.id)
        .order("last_message_at", { ascending: false })
        .limit(100),
      supabase
        .from("profiles")
        .select("display_name,username,avatar_url")
        .eq("id", user.id)
        .maybeSingle<{ display_name: string | null; username: string | null; avatar_url: string | null }>(),
      supabase.from("trips").select("*").eq("user_id", user.id).returns<TripRow[]>(),
      supabase
        .from("trip_buddies")
        .select("trip_id")
        .eq("user_id", user.id)
        .eq("status", "accepted")
        .returns<{ trip_id: string }[]>(),
    ])
  const sessions = (sessionsRaw ?? []) as SessionRow[]

  // Owned + buddy trips.
  let trips = tripsRaw ?? []
  const buddyIds = (buddyRows ?? [])
    .map((r) => r.trip_id)
    .filter((id) => !trips.some((t) => t.id === id))
  if (buddyIds.length) {
    const { data: buddyTrips } = await supabase
      .from("trips")
      .select("*")
      .in("id", buddyIds)
      .returns<TripRow[]>()
    trips = [...trips, ...(buddyTrips ?? [])]
  }
  trips.sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? ""))
  const tripIds = trips.map((t) => t.id)

  // Cover chain: cover_url → first photo media → destination/city photo.
  const mediaCovers = new Map<string, string>()
  const destByTrip = new Map<string, StepRow[]>()
  if (tripIds.length) {
    const [{ data: media }, { data: destsRaw }] = await Promise.all([
      supabase
        .from("media")
        .select("trip_id,url,type,created_at")
        .in("trip_id", tripIds)
        .eq("type", "photo")
        .order("created_at", { ascending: true })
        .returns<Array<{ trip_id: string | null; url: string }>>(),
      supabase
        .from("steps")
        .select("*")
        .in("trip_id", tripIds)
        .eq("step_type", "destination")
        .is("parent_step_id", null)
        .returns<StepRow[]>(),
    ])
    for (const m of media ?? []) {
      if (m.trip_id && m.url && !mediaCovers.has(m.trip_id)) mediaCovers.set(m.trip_id, m.url)
    }
    for (const d of (destsRaw ?? []) as StepRow[]) {
      const arr = destByTrip.get(d.trip_id ?? "") ?? []
      arr.push(d)
      destByTrip.set(d.trip_id ?? "", arr)
    }
    destByTrip.forEach((arr) =>
      arr.sort((a, b) => (dateOnly(a.date) ?? "").localeCompare(dateOnly(b.date) ?? ""))
    )
  }

  const fmtShort = (iso: string | null) => {
    const d = iso ? dateOnly(iso) : null
    if (!d) return ""
    const [y, m, day] = d.split("-").map(Number)
    return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    })
  }

  const tripCover = async (t: TripRow): Promise<string | null> =>
    t.cover_url ||
    mediaCovers.get(t.id) ||
    (await destinationPhotoUrl(
      destByTrip.get(t.id)?.[0]?.title || t.cities?.[0] || t.title,
      t.countries?.[0],
      240
    ))

  const tripVMs: TripPickVM[] = await Promise.all(
    trips.map(async (t) => ({
      id: t.id,
      title: t.title,
      photo: await tripCover(t),
      start: t.start_date,
      dateRange: [fmtShort(t.start_date), fmtShort(t.end_date)].filter(Boolean).join(" – "),
      destinations: (destByTrip.get(t.id) ?? []).map((d) => ({
        id: d.id,
        date: d.date,
        nights: d.nights ?? 0,
        label: d.title || d.location_name || "Destination",
      })),
      country: t.countries?.[0] ?? null,
      stops: destByTrip.get(t.id)?.length ?? 0,
    }))
  )
  const tripVMById = new Map(tripVMs.map((t) => [t.id, t]))

  const sessionVMs: ChatSessionVM[] = await Promise.all(
    sessions.map(async (s) => {
      const kind =
        s.anchor_type === "trip" ? "trip" : s.anchor_type === "place" ? "place" : "general"
      const trip = kind === "trip" && s.anchor_id ? tripVMById.get(s.anchor_id) : null
      const photo =
        kind === "trip"
          ? trip?.photo ?? null
          : kind === "place" && s.anchor_label
            ? await destinationPhotoUrl(s.anchor_label, null, 240)
            : null
      return {
        id: s.id,
        kind,
        tripId: kind === "trip" ? s.anchor_id : null,
        title: trip?.title ?? s.anchor_label ?? s.title ?? "Chat",
        subtitle: s.title,
        when: relativeTime(s.last_message_at),
        photo,
      } as ChatSessionVM
    })
  )

  const me: MeVM = {
    name: profile?.display_name || profile?.username || "Traveler",
    username: profile?.username ?? null,
    avatarUrl: profile?.avatar_url ?? null,
  }

  return <ChatsShell sessions={sessionVMs} trips={tripVMs} me={me} />
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
