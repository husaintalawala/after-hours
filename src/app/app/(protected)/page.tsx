import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { INVITE_COOKIE, isValidInviteToken } from "@/lib/drift/invite"
import { GUIDE_COOKIE, isGuideSlug } from "@/lib/drift/inspire"
import type { TripRow, ProfileRow, StepRow } from "@/lib/db-types"
import { dateOnly } from "@/lib/drift/dates"
import type { GlobeTripPin } from "@/components/app/GlobeHero"
import HomeShell, { type HomeData, type HomeTrip } from "@/components/app/home/HomeShell"
import { tripCover } from "@/lib/drift/tripCover"

// Logged-in home — server data loader for HomeShell (full-viewport globe +
// desktop trip rail / mobile sheet). See HomeShell for the layout.

export default async function TripsHome() {
  // Invite pickup. Someone who opened an invite link before they had an account
  // gets sent through login, and login always lands here — the magic-link email
  // template hardcodes next=/app, and /app/login builds redirectTo with NO query
  // params on purpose (Supabase matches redirect URLs against an allow-list and
  // a ?next= variant can silently fall back to the Site URL). So the token
  // cannot ride the redirect; it waits in a cookie and is claimed here, which
  // works identically for magic link and OAuth.
  //
  // Reading a cookie in a Server Component is fine; only WRITING throws. The
  // clearing therefore happens in the /join route handlers, not here.
  const jar = await cookies()
  const pendingInvite = jar.get(INVITE_COOKIE)?.value
  if (isValidInviteToken(pendingInvite)) redirect(`/join/${pendingInvite}`)

  // Guide pickup, same mechanism and for the same reason. Somebody read a
  // public /i/<slug> guide, pressed "Make this trip mine", and was sent through
  // login — which always lands here. /i/<slug>/start is where the cookie is both
  // written and cleared, so bouncing back through it hands them the trip they
  // were reading and leaves nothing behind to bounce off next time.
  const pendingGuide = jar.get(GUIDE_COOKIE)?.value
  if (isGuideSlug(pendingGuide)) redirect(`/i/${pendingGuide}/start`)

  const supabase = await createClient()
  // Middleware already verified this request's user; cookie read is enough here.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return null

  // Parallelize the independent lookups — every serial await here is felt
  // as navigation latency.
  const [{ data: profile }, { data: buddyRows }, followCounts] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single<ProfileRow>(),
    supabase
      .from("trip_buddies")
      .select("trip_id")
      .eq("user_id", user.id)
      .eq("status", "accepted")
      .returns<{ trip_id: string }[]>(),
    Promise.all([
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", user.id),
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", user.id),
    ]),
  ])
  const [{ count: followers }, { count: following }] = followCounts
  const buddyIds = (buddyRows ?? []).map((r) => r.trip_id).filter(Boolean)

  let tripsQuery = supabase.from("trips").select("*")
  tripsQuery = buddyIds.length
    ? tripsQuery.or(`user_id.eq.${user.id},id.in.(${buddyIds.join(",")})`)
    : tripsQuery.eq("user_id", user.id)
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
  const featuredRow =
    trips.find(isNow) ??
    trips
      .filter((t) => (t.start_date ?? "") > today)
      .sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? ""))[0] ??
    trips
      .slice()
      .sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? ""))[0] ??
    trips[0]
  const featuredHeader = !featuredRow
    ? null
    : isNow(featuredRow)
      ? { title: "Now", subtitle: "Traveling now" }
      : (featuredRow.start_date ?? "") > today
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

  const data: HomeData = {
    displayName: profile?.display_name || profile?.username || "traveler",
    username: profile?.username ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    countries: countries.size,
    followers: followers ?? 0,
    following: following ?? 0,
    pins,
    featured: featuredRow ? toHomeTrip(featuredRow) : null,
    featuredHeader,
    others: trips.filter((t) => t.id !== featuredRow?.id).map(toHomeTrip),
  }

  return <HomeShell data={data} />
}
