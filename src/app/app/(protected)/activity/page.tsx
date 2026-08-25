import { createClient } from "@/lib/supabase/server"
import type { ProfileRow, TripRow } from "@/lib/db-types"
import { tripCover, TRIP_COVER_COLUMNS, type TripCoverResult } from "@/lib/drift/tripCover"
import { loadReviewList } from "@/lib/drift/loadReviewList"
import ActivityShell from "@/components/app/activity/ActivityShell"

// Activity — the web half of the iOS Activity tab, built to the same canvas
// (.design-activity/ in the iOS repo). Two modes:
//
//   UPDATES — UP NEXT hero, "Waiting on you" rail, "From your crew", then one
//             doorway into People.
//   PEOPLE  — discovery, ordered by how EARNED the connection is: people you
//             have actually travelled with, then friends of your crew, then
//             everyone else.
//
// This page was a flat notifications list (likes/comments/follows) while iOS
// had the whole Dispatch — the divergence the parity rule exists to prevent.
// The notifications themselves survive as the "Signals" strip, which is the
// only thing they were ever good at.
//
// RSC fetches, one client shell renders — the same split HomeShell and
// ChatsShell use. The mode switch is the only thing that needs state, so the
// page must NOT become a client component.

export const dynamic = "force-dynamic"

export interface ActivityPerson {
  id: string
  name: string
  avatar: string | null
  places: string[]
  isFollowing: boolean
  tier: "crew" | "mutual" | "new"
  why: string | null
}

export interface ActivityUpNext {
  id: string
  title: string
  cover: TripCoverResult
  daysAway: number | null
  dateText: string
  travellers: number
  reviewCount: number
}

export interface ActivityReviewCard {
  id: string
  title: string
  cover: TripCoverResult
  count: number
  dateText: string
}

export interface ActivityPulse {
  id: string
  kind: "stops" | "chat"
  who: string | null
  text: string
  /** The row NAMES a trip, so it has to be able to open it. Carrying the title
   *  without the id was the iOS defect too — both build sites had the id in
   *  hand and simply were not passing it. */
  tripId: string
  tripTitle: string
  at: string
  /** Rendered server-side. Computing "3m" from Date.now() inside the client
   *  shell made the server and client renders disagree by a minute and blew up
   *  hydration — a feed's timestamp is not worth a client clock. */
  agoText: string
}

export interface ActivitySignal {
  id: string
  actor: string
  avatar: string | null
  text: string
  agoText: string
}

const DAY = 86_400_000

/** Coarse relative time, computed once on the server so both renders agree. */
function ago(iso: string | null | undefined): string {
  const t = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(t)) return ""
  const mins = Math.max(0, Math.round((Date.now() - t) / 60_000))
  if (mins < 60) return `${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.round(hrs / 24)}d`
}

/** yyyy-MM-dd today, in no timezone but the server's calendar date. Kept as a
 *  string compare throughout — the home page learned the hard way that Date
 *  arithmetic here shifts a trip by a day for anyone east of UTC. */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function prettyRange(start?: string | null, end?: string | null): string {
  const f = (iso?: string | null) => {
    if (!iso) return ""
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
    if (!y || !m || !d) return ""
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    })
  }
  const a = f(start)
  const b = f(end)
  if (a && b && a !== b) return `${a} – ${b}`
  return a || b || ""
}

export default async function ActivityPage() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return null
  const me = user.id

  // ── My trips (owned OR accepted buddy), the spine everything else hangs on.
  const { data: buddyRows } = await supabase
    .from("trip_buddies")
    .select("trip_id")
    .eq("user_id", me)
    .eq("status", "accepted")
    .returns<{ trip_id: string }[]>()
  const buddyTripIds = (buddyRows ?? []).map((r) => r.trip_id).filter(Boolean)

  let tripsQuery = supabase
    .from("trips")
    .select(`id,title,start_date,end_date,countries,${TRIP_COVER_COLUMNS}`)
  tripsQuery = buddyTripIds.length
    ? tripsQuery.or(`user_id.eq.${me},id.in.(${buddyTripIds.join(",")})`)
    : tripsQuery.eq("user_id", me)
  const { data: tripsRaw } = await tripsQuery.returns<TripRow[]>()
  const trips = tripsRaw ?? []
  const tripIds = trips.map((t) => t.id)
  const titleOf = new Map(trips.map((t) => [t.id, t.title ?? "a trip"]))
  const coverOf = (t: TripRow) =>
    tripCover({
      id: t.id,
      title: t.title,
      cover_url: t.cover_url,
      cover_fallback_url: t.cover_fallback_url,
      cover_fallback_attribution: t.cover_fallback_attribution,
      cover_fallback_link: t.cover_fallback_link,
      countries: t.countries,
    })

  const today = todayISO()
  const since = new Date(Date.now() - 30 * DAY).toISOString()

  // ── Everything that does not depend on the trip list, in parallel.
  const [notifRes, memberRes, followRes, batchRes, stepRes, chatRes] = await Promise.all([
    supabase
      .from("notifications")
      .select("id,type,actor_id,trip_id,created_at")
      .eq("user_id", me)
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<{ id: string; type: string; actor_id: string; trip_id: string | null; created_at: string | null }[]>(),
    tripIds.length
      ? supabase
          .from("trip_buddies")
          .select("trip_id,user_id")
          .in("trip_id", tripIds)
          .eq("status", "accepted")
          .returns<{ trip_id: string; user_id: string }[]>()
      : Promise.resolve({ data: [] as { trip_id: string; user_id: string }[] }),
    supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", me)
      .returns<{ following_id: string }[]>(),
    tripIds.length
      ? supabase
          .from("import_batches")
          .select("trip_id,status")
          .in("trip_id", tripIds)
          .in("status", ["review_ready", "partial"])
          .returns<{ trip_id: string; status: string }[]>()
      : Promise.resolve({ data: [] as { trip_id: string; status: string }[] }),
    tripIds.length
      ? supabase
          .from("steps")
          .select("id,trip_id,title,location_name,author_id,created_at")
          .in("trip_id", tripIds)
          .gte("created_at", since)
          .neq("author_id", me)
          .order("created_at", { ascending: false })
          .limit(40)
          .returns<{ id: string; trip_id: string; title: string | null; location_name: string | null; author_id: string | null; created_at: string | null }[]>()
      : Promise.resolve({ data: [] as never[] }),
    tripIds.length
      ? supabase
          .from("trip_chat_messages")
          .select("id,trip_id,user_id,created_at")
          .in("trip_id", tripIds)
          .gte("created_at", since)
          .neq("user_id", me)
          .eq("role", "user")
          .order("created_at", { ascending: false })
          .limit(40)
          .returns<{ id: string; trip_id: string | null; user_id: string | null; created_at: string | null }[]>()
      : Promise.resolve({ data: [] as never[] }),
  ])

  const followingIds = new Set((followRes.data ?? []).map((r) => r.following_id))

  // ── Who I have actually travelled with: everyone on a shared trip but me.
  const tripsWith = new Map<string, Set<string>>()
  for (const m of memberRes.data ?? []) {
    if (m.user_id === me) continue
    const set = tripsWith.get(m.user_id) ?? new Set<string>()
    set.add(m.trip_id)
    tripsWith.set(m.user_id, set)
  }

  // ── Profiles for everyone we might name: crew, step authors, notif actors.
  const stepAuthors = (stepRes.data ?? []).map((s) => s.author_id).filter((x): x is string => !!x)
  const chatAuthors = (chatRes.data ?? []).map((c) => c.user_id).filter((x): x is string => !!x)
  const notifActors = (notifRes.data ?? []).map((n) => n.actor_id).filter(Boolean)
  const wantProfiles = [...new Set([...tripsWith.keys(), ...stepAuthors, ...chatAuthors, ...notifActors])]
  const profiles = new Map<string, Pick<ProfileRow, "id" | "username" | "display_name" | "avatar_url">>()
  if (wantProfiles.length) {
    const { data } = await supabase
      .from("profiles")
      .select("id,username,display_name,avatar_url")
      .in("id", wantProfiles)
      .returns<Array<Pick<ProfileRow, "id" | "username" | "display_name" | "avatar_url">>>()
    for (const p of data ?? []) profiles.set(p.id, p)
  }
  const nameOf = (id: string | null | undefined): string | null => {
    if (!id) return null
    const p = profiles.get(id)
    return p?.display_name?.trim() || p?.username?.trim() || null
  }

  // ── Reviewable bookings per trip. loadReviewList is the same filter the
  //    review screen applies, so the count cannot promise more than it opens.
  //    Only trips with a terminal batch are asked, which is normally none or a
  //    couple — a blanket pass over every trip would be N pointless round trips.
  const batchTripIds = [...new Set((batchRes.data ?? []).map((b) => b.trip_id))].slice(0, 8)
  const reviewCounts = new Map<string, number>()
  if (batchTripIds.length) {
    const counted = await Promise.all(
      batchTripIds.map(async (id) => {
        try {
          return [id, (await loadReviewList(supabase, id)).length] as const
        } catch {
          return [id, 0] as const
        }
      })
    )
    for (const [id, n] of counted) if (n > 0) reviewCounts.set(id, n)
  }

  // ── UP NEXT: travelling now, else the soonest future trip. Deliberately NOT
  //    falling through to a past trip — this band is about what is ahead.
  const isNow = (t: TripRow) => {
    const s = t.start_date?.slice(0, 10)
    const e = (t.end_date ?? t.start_date)?.slice(0, 10)
    return !!s && !!e && s <= today && today <= e
  }
  const nextRow =
    trips.find(isNow) ??
    trips
      .filter((t) => (t.start_date ?? "").slice(0, 10) > today)
      .sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? ""))[0] ??
    null

  const upNext: ActivityUpNext | null = nextRow
    ? {
        id: nextRow.id,
        title: nextRow.title ?? "Untitled trip",
        cover: coverOf(nextRow),
        daysAway: isNow(nextRow)
          ? null
          : Math.max(
              0,
              Math.round(
                (Date.parse(`${(nextRow.start_date ?? today).slice(0, 10)}T00:00:00Z`) -
                  Date.parse(`${today}T00:00:00Z`)) /
                  DAY
              )
            ),
        dateText: prettyRange(nextRow.start_date, nextRow.end_date),
        // Everyone on the trip including me — "3 travellers" counts people, and
        // I am one of them.
        travellers:
          1 + [...tripsWith.entries()].filter(([, set]) => set.has(nextRow.id)).length,
        reviewCount: reviewCounts.get(nextRow.id) ?? 0,
      }
    : null

  const reviewCards: ActivityReviewCard[] = trips
    .filter((t) => (reviewCounts.get(t.id) ?? 0) > 0)
    .map((t) => ({
      id: t.id,
      title: t.title?.trim() && t.title.trim().length > 1 ? t.title.trim() : (t.countries?.[0] ?? "Trip"),
      cover: coverOf(t),
      count: reviewCounts.get(t.id) ?? 0,
      dateText: prettyRange(t.start_date, t.end_date),
    }))
    .sort((a, b) => b.count - a.count)

  // ── From your crew. Grouped per trip AND actor — three stops one person
  //    added to one trip is ONE piece of news, not three rows. Same rule iOS
  //    follows; the canvas is explicit about it.
  const pulse: ActivityPulse[] = []
  const stopGroups = new Map<string, { n: number; at: string; place: string; who: string | null; trip: string }>()
  for (const s of stepRes.data ?? []) {
    const key = `${s.trip_id}|${s.author_id ?? "?"}`
    const at = s.created_at ?? ""
    const g = stopGroups.get(key)
    const place = s.location_name?.trim() || s.title?.trim() || "a stop"
    if (!g) {
      stopGroups.set(key, { n: 1, at, place, who: nameOf(s.author_id), trip: s.trip_id })
    } else {
      g.n += 1
      if (at > g.at) {
        g.at = at
        g.place = place
      }
    }
  }
  for (const [key, g] of stopGroups) {
    const what = g.n === 1 ? g.place : `${g.n} stops`
    pulse.push({
      id: `stops-${key}`,
      kind: "stops",
      who: g.who,
      text: g.who ? `added ${what}` : "added",
      tripId: g.trip,
      tripTitle: titleOf.get(g.trip) ?? "a trip",
      at: g.at,
      agoText: ago(g.at),
    })
  }
  const chatByTrip = new Map<string, { n: number; at: string }>()
  for (const c of chatRes.data ?? []) {
    if (!c.trip_id) continue
    const at = c.created_at ?? ""
    const g = chatByTrip.get(c.trip_id)
    chatByTrip.set(c.trip_id, { n: (g?.n ?? 0) + 1, at: at > (g?.at ?? "") ? at : (g?.at ?? at) })
  }
  for (const [tid, g] of chatByTrip) {
    pulse.push({
      id: `chat-${tid}`,
      kind: "chat",
      who: null,
      text: `${g.n} new message${g.n === 1 ? "" : "s"}`,
      tripId: tid,
      tripTitle: titleOf.get(tid) ?? "a trip",
      at: g.at,
      agoText: ago(g.at),
    })
  }
  pulse.sort((a, b) => b.at.localeCompare(a.at))

  // ── People, ranked by how EARNED the connection is. Crew first — a shared
  //    trip is the warmest signal there is — then people who followed me and
  //    whom I have not followed back, then nobody. No strangers are invented to
  //    fill the page.
  const people: ActivityPerson[] = []
  for (const [id, tripSet] of tripsWith) {
    const name = nameOf(id)
    if (!name) continue
    const places = [...tripSet]
      .map((tid) => trips.find((t) => t.id === tid))
      .flatMap((t) => (t?.countries ?? []).filter(Boolean) as string[])
    people.push({
      id,
      name,
      avatar: profiles.get(id)?.avatar_url ?? null,
      places: [...new Set(places)].slice(0, 3),
      isFollowing: followingIds.has(id),
      tier: "crew",
      why: `${tripSet.size} trip${tripSet.size === 1 ? "" : "s"} together`,
    })
  }
  const crewIds = new Set(people.map((p) => p.id))

  // ── FRIENDS OF YOUR CREW. The tier that makes this discovery rather than a
  //    roster: someone your crew has travelled with, whom you have not met.
  //    iOS has had it since the Activity redesign (SearchView.loadMutuals); the
  //    web declared the "mutual" tier in its type and never produced one, so
  //    once you had followed everyone who followed you the People mode showed
  //    only the handful of people you already know — no way to find anyone new.
  //
  //    The warmth is what makes it worth showing: not "here are strangers", but
  //    "this person travelled with Rashida, in Japan". A suggestion you cannot
  //    place is not a suggestion.
  if (crewIds.size > 0) {
    const crewList = [...crewIds]
    const myTripIds = new Set(trips.map((t) => t.id))

    const [crewBuddyRes, crewOwnedRes] = await Promise.all([
      supabase
        .from("trip_buddies")
        .select("trip_id,user_id")
        .in("user_id", crewList)
        .eq("status", "accepted")
        .limit(400)
        .returns<Array<{ trip_id: string; user_id: string }>>(),
      supabase
        .from("trips")
        .select("id,user_id,title")
        .in("user_id", crewList)
        .limit(200)
        .returns<Array<{ id: string; user_id: string; title: string | null }>>(),
    ])

    // Trips my crew are on or own that I am NOT part of — those are the only
    // ones that can introduce me to somebody.
    const ownerOfTrip = new Map<string, string>()
    const titleOfTrip = new Map<string, string>()
    const candidateTrips = new Set<string>()
    for (const t of crewOwnedRes.data ?? []) {
      ownerOfTrip.set(t.id, t.user_id)
      if (t.title?.trim()) titleOfTrip.set(t.id, t.title.trim())
      if (!myTripIds.has(t.id)) candidateTrips.add(t.id)
    }
    for (const b of crewBuddyRes.data ?? []) {
      if (!ownerOfTrip.has(b.trip_id)) ownerOfTrip.set(b.trip_id, b.user_id)
      if (!myTripIds.has(b.trip_id)) candidateTrips.add(b.trip_id)
    }

    if (candidateTrips.size > 0) {
      const { data: otherRows } = await supabase
        .from("trip_buddies")
        .select("trip_id,user_id")
        .in("trip_id", [...candidateTrips])
        .eq("status", "accepted")
        .limit(400)
        .returns<Array<{ trip_id: string; user_id: string }>>()

      // First trip that connects us wins — it is the one the reason names.
      const viaTrip = new Map<string, string>()
      for (const o of otherRows ?? []) {
        if (o.user_id === me) continue
        if (crewIds.has(o.user_id) || followingIds.has(o.user_id)) continue
        if (!viaTrip.has(o.user_id)) viaTrip.set(o.user_id, o.trip_id)
      }

      if (viaTrip.size > 0) {
        const { data: mutualProfiles } = await supabase
          .from("profiles")
          .select("id,username,display_name,avatar_url")
          .in("id", [...viaTrip.keys()])
          .returns<Array<Pick<ProfileRow, "id" | "username" | "display_name" | "avatar_url">>>()
        for (const p of mutualProfiles ?? []) profiles.set(p.id, p)

        for (const [candidateId, tripId] of viaTrip) {
          // Anonymous profiles are SKIPPED, not rendered as "Traveler" with a
          // "?" avatar — six of those filled the whole section on iOS once.
          const name = nameOf(candidateId)
          if (!name) continue
          const viaName = nameOf(ownerOfTrip.get(tripId) ?? null)
          const where = titleOfTrip.get(tripId)
          const why =
            viaName && where
              ? `Travelled with ${viaName} · ${where}`
              : viaName
                ? `Travelled with ${viaName}`
                : (where ?? "Through your crew")
          people.push({
            id: candidateId,
            name,
            avatar: profiles.get(candidateId)?.avatar_url ?? null,
            // Deliberately empty so PersonRow falls through to `why`. It
            // prefers `places`, and for a mutual the place alone ("Japan") is
            // the weaker half — "Travelled with Rashida · Japan" is the line
            // that tells you why this person is on your screen at all.
            places: [],
            isFollowing: false,
            tier: "mutual",
            why,
          })
        }
      }
    }
  }

  const knownIds = new Set(people.map((p) => p.id))
  for (const n of notifRes.data ?? []) {
    if (n.type !== "follow" || !n.actor_id) continue
    // knownIds covers crew AND the friends-of-crew just added, so someone
    // already suggested with a warm reason is not repeated with a colder one.
    if (knownIds.has(n.actor_id) || followingIds.has(n.actor_id)) continue
    const name = nameOf(n.actor_id)
    if (!name) continue
    people.push({
      id: n.actor_id,
      name,
      avatar: profiles.get(n.actor_id)?.avatar_url ?? null,
      places: [],
      isFollowing: false,
      tier: "new",
      why: "Followed you",
    })
  }

  const signals: ActivitySignal[] = (notifRes.data ?? []).slice(0, 6).map((n) => ({
    id: n.id,
    actor: nameOf(n.actor_id) ?? "Someone",
    avatar: profiles.get(n.actor_id)?.avatar_url ?? null,
    text:
      n.type === "follow"
        ? "started following you"
        : n.type === "like"
          ? "liked your trip"
          : n.type === "comment"
            ? `commented on ${titleOf.get(n.trip_id ?? "") ?? "your trip"}`
            : "trip update",
    agoText: ago(n.created_at),
  }))

  return (
    <ActivityShell
      meId={me}
      upNext={upNext}
      reviewCards={reviewCards}
      pulse={pulse.slice(0, 12)}
      people={people}
      signals={signals}
    />
  )
}
