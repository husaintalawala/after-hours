import type { SupabaseClient } from "@supabase/supabase-js"
import type { TripRow, ProfileRow, StepRow } from "@/lib/db-types"
import { dateOnly } from "@/lib/drift/dates"
import { tripCover } from "@/lib/drift/tripCover"
import type { GlobeTripPin } from "@/components/app/GlobeHero"
import type { HomeData, HomeTrip, HomeChat } from "@/components/app/home/HomeShell"

/**
 * Build the profile payload — globe pins, featured trip, trip list, stats —
 * for ANY user id.
 *
 * This lived inline in the logged-in home page, which is why someone else's
 * profile looked nothing like your own: /app/people/[id] had grown its own
 * thinner rendering (avatar, three stats, a flat list of links) with no globe,
 * no featured trip and no cover chain. Two screens answering the same question
 * — "what are this person's trips?" — that shared no code and so shared no
 * behaviour.
 *
 * Parity here has to be STRUCTURAL, not a copy. A duplicated assembly would
 * agree on the day it was written and diverge on the next change to either
 * side, which is exactly how the two drifted apart the first time. So both
 * pages call this, and any future field lands on both at once.
 *
 * Visibility is left entirely to RLS. This deliberately does not filter by
 * privacy: as the signed-in caller you see your own trips in full, and on
 * someone else's profile the same query returns only what their policies let
 * you see. Re-implementing that rule here would be a second, weaker copy of
 * the real one.
 */
export async function buildHomeData(
  // The route's own server client, so RLS evaluates as the signed-in caller.
  supabase: SupabaseClient,
  userId: string,
  /**
   * Who is LOOKING, which is not always whose page this is.
   *
   * Defaults to `userId` — the common case, and the one every existing caller
   * already meant. Pass it explicitly from /app/people/[id], where the two
   * differ and the self-only fields (home city, chat threads) must not be
   * fetched at all.
   */
  viewerId: string = userId
): Promise<HomeData> {
  // Parallelize the independent lookups — every serial await here is felt as
  // navigation latency.
  const [{ data: profile }, { data: buddyRows }, followCounts] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single<ProfileRow>(),
    supabase
      .from("trip_buddies")
      .select("trip_id")
      .eq("user_id", userId)
      .eq("status", "accepted")
      .returns<{ trip_id: string }[]>(),
    Promise.all([
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", userId),
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", userId),
    ]),
  ])
  const [{ count: followers }, { count: following }] = followCounts
  const buddyIds = (buddyRows ?? []).map((r) => r.trip_id).filter(Boolean)

  let tripsQuery = supabase.from("trips").select("*")
  tripsQuery = buddyIds.length
    ? tripsQuery.or(`user_id.eq.${userId},id.in.(${buddyIds.join(",")})`)
    : tripsQuery.eq("user_id", userId)
  const { data: tripsRaw } = await tripsQuery.returns<TripRow[]>()
  const trips = (tripsRaw ?? []).sort((a, b) =>
    (b.start_date ?? "").localeCompare(a.start_date ?? "")
  )
  const tripIds = trips.map((t) => t.id)

  let stepsWithCoords: StepRow[] = []
  const mediaCovers = new Map<string, string>()
  if (tripIds.length) {
    const [{ data: steps }, { data: media }] = await Promise.all([
      supabase
        .from("steps")
        .select("id,trip_id,latitude,longitude,date,created_at,step_type")
        .in("trip_id", tripIds)
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .returns<StepRow[]>(),
      supabase
        .from("media")
        .select("trip_id,url,type,created_at")
        .in("trip_id", tripIds)
        .eq("type", "photo")
        .order("created_at", { ascending: true })
        .returns<{ trip_id: string | null; url: string }[]>(),
    ])
    stepsWithCoords = ((steps ?? []) as StepRow[]).sort((a, b) =>
      (dateOnly(a.date) ?? "").localeCompare(dateOnly(b.date) ?? "")
    )
    for (const m of media ?? []) {
      if (m.trip_id && m.url && !mediaCovers.has(m.trip_id)) {
        mediaCovers.set(m.trip_id, m.url)
      }
    }
  }

  // ONE chain for every surface — see lib/drift/tripCover.
  const coverFor = (t: TripRow) =>
    tripCover({
      id: t.id,
      title: t.title,
      cover_url: t.cover_url,
      firstPhotoUrl: mediaCovers.get(t.id) ?? null,
      cover_fallback_url: t.cover_fallback_url,
      cover_fallback_attribution: t.cover_fallback_attribution,
      cover_fallback_link: t.cover_fallback_link,
      countries: t.countries,
    })

  const pins: GlobeTripPin[] = []
  for (const t of trips) {
    const tripSteps = stepsWithCoords.filter((s) => s.trip_id === t.id)
    if (!tripSteps.length) continue
    const first = tripSteps[0]
    pins.push({
      tripId: t.id,
      lat: first.latitude!,
      lng: first.longitude!,
      imageURL: coverFor(t).url,
      route: tripSteps.map((s) => [s.longitude!, s.latitude!] as [number, number]),
    })
  }

  const countries = new Set<string>()
  for (const t of trips) (t.countries ?? []).forEach((c) => c && countries.add(c))

  const today = new Date().toISOString().slice(0, 10)
  // "Traveling now" is date-derived — today within [start, end] — NOT the
  // trips.is_active flag, which goes stale (a past trip stayed flagged active,
  // so it showed "NOW TRAVELING" and drove the Ask-Drift CTA in July).
  const isNow = (t: TripRow): boolean => {
    const s = t.start_date?.slice(0, 10)
    const e = (t.end_date ?? t.start_date)?.slice(0, 10)
    return !!s && !!e && s <= today && today <= e
  }
  // Ordering rank — same date basis as the NOW TRAVELING badge (isNow), so the
  // list order and the badge stay consistent. 0 = travelling, 1 = upcoming,
  // 2 = past/other. Comparisons are date-only (YYYY-MM-DD) to absorb the UTC
  // 00:00:00Z day-shift.
  const rank = (t: TripRow): number => {
    if (isNow(t)) return 0
    if ((t.start_date?.slice(0, 10) ?? "") > today) return 1
    return 2
  }
  // Trips ordered for the list: travelling first, then upcoming (soonest start
  // first), then past (most recent travel date first).
  const orderedTrips = trips.slice().sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra - rb
    const sa = a.start_date?.slice(0, 10) ?? ""
    const sb = b.start_date?.slice(0, 10) ?? ""
    return ra === 1 ? sa.localeCompare(sb) : sb.localeCompare(sa)
  })
  const featuredRow = orderedTrips[0] ?? null
  const featuredHeader = !featuredRow
    ? null
    : rank(featuredRow) === 0
      ? { title: "Now", subtitle: "Traveling now" }
      : rank(featuredRow) === 1
        ? { title: "Next", subtitle: "Coming up" }
        : { title: "Latest", subtitle: "Most recent" }

  const toHomeTrip = (t: TripRow): HomeTrip => ({
    id: t.id,
    title: t.title || "Untitled Trip",
    cover: coverFor(t),
    city: t.cities?.[0] ?? null,
    country: t.countries?.[0] ?? null,
    startDate: t.start_date,
    dateLabel: t.start_date
      ? new Date(t.start_date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        })
      : "",
    isActive: isNow(t),
  })

  // Self-only extras. Both are asked for AFTER the main payload rather than in
  // the parallel block above, because neither is on the critical path for
  // someone else's profile and this function serves both pages.
  //
  // `viewerId` is the signed-in caller; when it differs from `userId` we are
  // rendering a stranger's page, where a home city and a private chat list have
  // no business being fetched at all — not merely hidden at render time.
  const isSelf = viewerId === userId
  const p = profile as (ProfileRow & HomeProfileExtras) | null
  const home =
    isSelf && (p?.home_city || p?.home_country)
      ? {
          city: p.home_city ?? null,
          country: p.home_country ?? null,
          lat: p.home_lat ?? null,
          lng: p.home_lng ?? null,
        }
      : null

  let chats: HomeChat[] = []
  if (isSelf) {
    // Same filters the Chats tab uses: merged-away duplicates and archived
    // threads are not "recent", they are gone.
    const { data: rows } = await supabase
      .from("chat_sessions")
      .select("id,title,anchor_type,anchor_id,anchor_label,last_message_at")
      .eq("user_id", userId)
      .is("merged_into", null)
      .is("archived_at", null)
      .order("last_message_at", { ascending: false })
      .limit(3)
      .returns<ChatSessionRow[]>()

    // THE SAME NAME THE CHATS TAB USES, and that is the requirement rather than
    // a nicety: a thread called "Barcelona" in one place and "Untitled chat" in
    // the other is two names for one object. /app/chats resolves
    //   trip title ?? anchor_label ?? session title ?? "Chat"
    // and the trip half is what actually fires, because most threads hang off a
    // trip and carry no title of their own — which is why the first cut of this
    // panel rendered "Untitled chat" three times over. The trips are already
    // loaded above, so resolving it here costs nothing.
    const tripTitles = new Map(trips.map((t) => [t.id, t.title]))
    chats = (rows ?? []).map((r) => {
      const fromTrip =
        r.anchor_type === "trip" && r.anchor_id ? tripTitles.get(r.anchor_id) : null
      const name =
        fromTrip?.trim() || r.anchor_label?.trim() || r.title?.trim() || "Chat"
      return {
        id: r.id,
        title: name,
        // The session's own title becomes the second line when it is not
        // already doing duty as the first — the same split the tab makes.
        anchorLabel: r.title?.trim() && r.title.trim() !== name ? r.title.trim() : null,
        lastMessageAt: r.last_message_at ?? null,
      }
    })
  }

  return {
    displayName: profile?.display_name || profile?.username || "traveler",
    username: profile?.username ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    countries: countries.size,
    followers: followers ?? 0,
    following: following ?? 0,
    pins,
    featured: featuredRow ? toHomeTrip(featuredRow) : null,
    featuredHeader,
    others: orderedTrips.slice(1).map(toHomeTrip),
    home,
    chats,
  }
}

/** The profile columns this file reads that `ProfileRow` does not yet name. */
type HomeProfileExtras = {
  home_city: string | null
  home_country: string | null
  home_lat: number | null
  home_lng: number | null
}

type ChatSessionRow = {
  id: string
  title: string | null
  anchor_type: string | null
  anchor_id: string | null
  anchor_label: string | null
  last_message_at: string | null
}

/** Whether a profile row exists at all — /app/people/[id] 404s without one. */
export async function profileExists(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle<{ id: string }>()
  return !!data
}
