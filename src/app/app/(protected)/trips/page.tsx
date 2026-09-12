import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { buildHomeData } from "@/lib/drift/homeData"
import { RailTripCard, type HomeTrip } from "@/components/app/home/HomeShell"
import BackLink from "@/components/app/BackLink"

/**
 * Every trip on the account.
 *
 * THIS PAGE WAS A 404. The home has linked "All trips" to /app/trips since the
 * cockpit row was built (HomeShell's Section action), and this directory held
 * only `[id]/`, `new/` and a `loading.tsx` — so the one affordance for reaching
 * the rest of your travel dead-ended. The iOS home just gained the same
 * destination, and shipping that against a link that 404s on web is the parity
 * gap in the wrong direction.
 *
 * ORDER COMES FROM `buildHomeData`, NOT FROM HERE. It already ranks travelling,
 * then upcoming soonest-first, then past most-recent-first — the same rule the
 * phone uses — and `featured` is simply the first of that list. Re-sorting here
 * would be a second opinion that could disagree with the card the home shows on
 * top.
 *
 * GROUPED BY YEAR, which is the thing an archive is actually scanned by. Upcoming
 * trips get their own group at the head rather than being filed under a year
 * that has not happened yet.
 */

export const metadata = { title: "All trips · Drift" }

function yearOf(trip: HomeTrip): string | null {
  // The date-only slice, not `new Date(...)`. These timestamps are stored at
  // UTC midnight, and a local-time parse in a western timezone lands on
  // December 31st of the previous year — which would file a January trip under
  // the wrong heading, silently.
  return trip.startDate?.slice(0, 4) ?? null
}

export default async function AllTripsPage() {
  const supabase = await createClient()
  // Middleware already verified this request's user; the cookie read is enough,
  // same as the home.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return null

  const data = await buildHomeData(supabase, user.id)
  const all = data.featured ? [data.featured, ...data.others] : data.others
  if (all.length === 0) redirect("/app")

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = all.filter((t) => t.isActive || (t.startDate?.slice(0, 10) ?? "") > today)
  const rest = all.filter((t) => !upcoming.includes(t))

  // Insertion order is already newest-first, so the years come out descending
  // without a second sort.
  const years = new Map<string, HomeTrip[]>()
  for (const trip of rest) {
    const key = yearOf(trip) ?? "No dates yet"
    years.set(key, [...(years.get(key) ?? []), trip])
  }

  const groups: Array<[string, HomeTrip[]]> = [
    ...(upcoming.length ? ([["Upcoming", upcoming]] as Array<[string, HomeTrip[]]>) : []),
    ...years.entries(),
  ]

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-6 lg:max-w-[1400px] lg:px-10">
      <div className="flex items-center gap-4">
        <BackLink href="/app" label="home" />
        <h1 className="font-drift-display text-[24px] font-bold tracking-[-0.02em] text-aurora-ink lg:text-[30px]">
          All trips
          <span className="ml-3 whitespace-nowrap font-mono text-[11px] font-normal uppercase tracking-[0.14em] text-aurora-ink3">
            {all.length} {all.length === 1 ? "trip" : "trips"}
          </span>
        </h1>
      </div>

      {groups.map(([label, trips]) => (
        <section key={label} className="mt-9">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-aurora-teal">
            {label}
          </h2>
          {/* A GRID, not the home's rail. A rail is right on the home, where
              these are a preview beside two other tiles; here they are the
              whole page, and queueing an account's entire history behind a
              horizontal scroll is the shape this page exists to replace. */}
          <div className="mt-3.5 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3.5">
            {trips.map((trip) => (
              <div key={trip.id} className="[&>a]:w-full">
                <RailTripCard trip={trip} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
