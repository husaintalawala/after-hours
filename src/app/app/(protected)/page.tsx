import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import type { TripRow, ProfileRow } from "@/lib/db-types"
import SignOutButton from "@/components/app/SignOutButton"

// Profile/home tab for Phase 0: the signed-in user's trips, read via RLS.
// This proves the whole stack end-to-end (auth cookie -> RLS-scoped read).
// No writes yet — the trips RLS buddy-clause audit is a prerequisite for
// Phase 1 write paths.
export default async function TripsHome() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // In the App Router the page renders concurrently with the (protected)
  // layout, so this runs even when unauthenticated — the layout's redirect
  // still wins, but bail cleanly instead of dereferencing a null user.
  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<ProfileRow>()

  // "Your trips" = trips you own + trips you're an accepted buddy on. RLS also
  // exposes every PUBLIC trip, so we must scope explicitly or the list would
  // show strangers' public trips too. (Verified against live RLS.)
  const { data: buddyRows } = await supabase
    .from("trip_buddies")
    .select("trip_id")
    .eq("user_id", user.id)
    .eq("status", "accepted")

  const buddyIds = (buddyRows ?? [])
    .map((r) => (r as { trip_id?: string }).trip_id)
    .filter((id): id is string => Boolean(id))

  let query = supabase.from("trips").select("*")
  query = buddyIds.length
    ? query.or(`user_id.eq.${user.id},id.in.(${buddyIds.join(",")})`)
    : query.eq("user_id", user.id)

  const { data: trips, error } = await query.returns<TripRow[]>()

  const sorted = (trips ?? []).slice().sort((a, b) => {
    const da = (a.start_date as string) ?? ""
    const db = (b.start_date as string) ?? ""
    return db.localeCompare(da) // most recent first
  })

  const displayName =
    profile?.display_name || profile?.username || user?.email || "traveler"

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-drift-muted">Welcome back</p>
          <h1 className="font-drift-display text-3xl font-medium tracking-tight">
            {displayName}
          </h1>
        </div>
        <SignOutButton />
      </header>

      <h2 className="mt-8 text-sm font-medium uppercase tracking-wide text-drift-text-tertiary">
        Your trips
      </h2>

      {error && (
        <p className="mt-4 rounded-xl bg-drift-coral-50 p-4 text-sm text-drift-coral-deep">
          Couldn&apos;t load trips: {error.message}
        </p>
      )}

      {!error && sorted.length === 0 && (
        <p className="mt-4 text-drift-muted">
          No trips yet. Tap the coral + to start one.
        </p>
      )}

      <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {sorted.map((trip) => (
          <li
            key={trip.id}
            className="overflow-hidden rounded-2xl border border-drift-divider bg-white transition-shadow hover:shadow-md"
          >
            <Link href={`/app/trips/${trip.id}`} className="block">
              <div className="relative aspect-[4/3] bg-drift-alt-bg">
                {trip.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={trip.cover_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="p-4">
                <p className="font-drift-display text-lg font-medium">
                  {trip.title || "Untitled trip"}
                </p>
                <p className="mt-1 text-sm text-drift-muted">
                  {formatSubtitle(trip)}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}

function formatSubtitle(trip: TripRow): string {
  const place =
    (trip.cities && trip.cities.filter(Boolean).join(", ")) ||
    (trip.countries && trip.countries.filter(Boolean).join(", ")) ||
    ""
  const start = trip.start_date ? fmtDate(trip.start_date) : ""
  const end = trip.end_date ? fmtDate(trip.end_date) : ""
  const range = start && end ? `${start} – ${end}` : start || end || ""
  return [place, range].filter(Boolean).join(" · ")
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
