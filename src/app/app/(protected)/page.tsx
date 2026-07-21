import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import type { TripRow, ProfileRow, StepRow } from "@/lib/db-types"
import { countryFlagEmoji } from "@/lib/drift/flags"
import { dateOnly } from "@/lib/drift/dates"
import SignOutButton from "@/components/app/SignOutButton"
import GlobeHero, { type GlobeTripPin } from "@/components/app/GlobeHero"

// Profile / Trips home — web port of ProfileTripsView: self-filling photo
// globe on top, white sheet sliding over it with the Instagram-style header,
// Travel Stats row, the state-aware featured trip (Now / Next / Latest) and
// "Other trips" as 220px full-bleed cover cards.

export default async function TripsHome() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<ProfileRow>()

  // Trips you own + trips you're an accepted buddy on.
  const { data: buddyRows } = await supabase
    .from("trip_buddies")
    .select("trip_id")
    .eq("user_id", user.id)
    .eq("status", "accepted")
    .returns<{ trip_id: string }[]>()
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

  // Steps with coordinates → globe pins + colored routes; media → cover chain.
  let stepsWithCoords: StepRow[] = []
  let mediaCovers = new Map<string, string>()
  if (tripIds.length) {
    const { data: steps } = await supabase
      .from("steps")
      .select("id,trip_id,latitude,longitude,date,created_at,step_type")
      .in("trip_id", tripIds)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .returns<StepRow[]>()
    stepsWithCoords = ((steps ?? []) as StepRow[]).sort((a, b) =>
      (dateOnly(a.date) ?? "").localeCompare(dateOnly(b.date) ?? "")
    )

    const { data: media } = await supabase
      .from("media")
      .select("trip_id,url,type,created_at")
      .in("trip_id", tripIds)
      .eq("type", "photo")
      .order("created_at", { ascending: true })
      .returns<{ trip_id: string | null; url: string }[]>()
    for (const m of media ?? []) {
      if (m.trip_id && m.url && !mediaCovers.has(m.trip_id)) {
        mediaCovers.set(m.trip_id, m.url)
      }
    }
  }

  // Cover chain per trip: trips.cover_url → first photo media.
  const coverFor = (t: TripRow): string | null =>
    t.cover_url || mediaCovers.get(t.id) || null

  // Globe pins: first coordinate per trip; route: all coords in date order.
  const pins: GlobeTripPin[] = []
  for (const t of trips) {
    const tripSteps = stepsWithCoords.filter((s) => s.trip_id === t.id)
    if (!tripSteps.length) continue
    const first = tripSteps[0]
    pins.push({
      tripId: t.id,
      lat: first.latitude!,
      lng: first.longitude!,
      imageURL: coverFor(t),
      route: tripSteps.map((s) => [s.longitude!, s.latitude!] as [number, number]),
    })
  }

  // Stats: countries from trips.countries[]; follower/following counts.
  const countries = new Set<string>()
  for (const t of trips) (t.countries ?? []).forEach((c) => c && countries.add(c))
  const [{ count: followers }, { count: following }] = await Promise.all([
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", user.id),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", user.id),
  ])

  // Featured slot: active > nearest upcoming > most recent past.
  const today = new Date().toISOString().slice(0, 10)
  const featured =
    trips.find((t) => t.is_active) ??
    trips
      .filter((t) => (t.start_date ?? "") > today)
      .sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? ""))[0] ??
    trips[0]
  const others = trips.filter((t) => t.id !== featured?.id)
  const featuredHeader = !featured
    ? null
    : featured.is_active
      ? { title: "Now", subtitle: "Traveling now" }
      : (featured.start_date ?? "") > today
        ? { title: "Next", subtitle: "Coming up" }
        : { title: "Latest", subtitle: "Most recent" }

  const displayName = profile?.display_name || profile?.username || "traveler"

  return (
    <div className="relative">
      {/* Globe hero — fixed behind the sheet */}
      <div className="fixed inset-x-0 top-0 h-[52vh]">
        <GlobeHero pins={pins} />
      </div>

      {/* Sheet over the globe */}
      <div className="relative z-10 mt-[44vh] rounded-t-[28px] bg-white pb-28 shadow-[0_-8px_30px_rgba(0,0,0,0.25)]">
        <div className="mx-auto w-full max-w-2xl px-5">
          {/* Grab handle */}
          <div className="flex justify-center pt-3">
            <div className="h-1 w-9 rounded-full bg-drift-divider" />
          </div>

          {/* Instagram-style compact header */}
          <div className="mt-4 flex items-center gap-4">
            <Avatar url={profile?.avatar_url ?? null} name={displayName} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-drift-display text-[28px] font-bold leading-tight">
                {displayName}
              </p>
              {profile?.username && (
                <p className="text-[12px] text-drift-muted">@{profile.username}</p>
              )}
            </div>
            <SignOutButton />
          </div>

          {/* Stats row */}
          <div className="mt-4 flex gap-8 border-b border-drift-divider pb-4">
            <Stat value={countries.size} label="Countries" />
            <Stat value={followers ?? 0} label="Followers" />
            <Stat value={following ?? 0} label="Following" />
          </div>

          {/* Travel Stats pill */}
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-drift-divider bg-white px-4 py-3">
            <span className="text-[15px]">🌍</span>
            <span className="text-[14px] font-semibold">Travel Stats</span>
            <span className="ml-auto text-[12px] text-drift-muted">
              {countries.size} {countries.size === 1 ? "country" : "countries"}
            </span>
          </div>

          {/* Trip sections */}
          {trips.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-4xl opacity-30">🗺</p>
              <p className="mt-3 text-[15px] text-drift-muted">No trips yet</p>
            </div>
          ) : (
            <>
              {featured && featuredHeader && (
                <>
                  <div className="mt-6 flex items-baseline gap-2">
                    <h2 className="font-drift-display text-[22px] font-bold">
                      {featuredHeader.title}
                    </h2>
                    <span className="text-[13px] font-semibold text-[rgb(87,87,87)]">
                      {featuredHeader.subtitle}
                    </span>
                  </div>
                  <TripCard trip={featured} cover={coverFor(featured)} className="mt-3" />
                </>
              )}

              {others.length > 0 && (
                <>
                  <h2 className="mt-8 font-drift-display text-[22px] font-bold">
                    Other trips
                  </h2>
                  <div className="mt-3 space-y-4">
                    {others.map((t) => (
                      <TripCard key={t.id} trip={t} cover={coverFor(t)} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="h-16 w-16 rounded-full object-cover ring-2 ring-drift-coral/70"
    />
  ) : (
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-drift-coral-50 font-drift-display text-2xl font-bold text-drift-coral ring-2 ring-drift-coral/70">
      {name.slice(0, 1).toUpperCase()}
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-[20px] font-bold leading-tight">{value}</p>
      <p className="text-[12px] text-drift-muted">{label}</p>
    </div>
  )
}

// 220px full-bleed cover card: photo (or amber gradient), dark bottom
// gradient, flag top-right, title + date bottom row, NOW TRAVELING badge.
function TripCard({
  trip,
  cover,
  className = "",
}: {
  trip: TripRow
  cover: string | null
  className?: string
}) {
  const flag = countryFlagEmoji(trip.countries?.[0])
  const dateStr = trip.start_date
    ? new Date(trip.start_date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : ""

  return (
    <Link
      href={`/app/trips/${trip.id}`}
      className={`relative block h-[220px] overflow-hidden rounded-[14px] ${className}`}
    >
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(135deg, #E0563B, rgb(140,82,0))",
          }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(to bottom, transparent 45%, rgba(0,0,0,0.65))",
        }}
      />
      {flag && (
        <span className="absolute right-2.5 top-2.5 text-[20px] drop-shadow">{flag}</span>
      )}
      {trip.is_active && (
        <span className="absolute left-3 top-3 rounded-full bg-drift-coral px-2.5 py-1 text-[10px] font-bold tracking-wide text-white">
          NOW TRAVELING
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
        <p className="font-drift-display text-[18px] font-bold leading-snug text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
          {trip.title || "Untitled Trip"}
        </p>
        <p className="shrink-0 text-[11px] text-white/70 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
          {dateStr}
        </p>
      </div>
    </Link>
  )
}
