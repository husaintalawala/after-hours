import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import type { TripRow, TripBuddyRow } from "@/lib/db-types"
import { countryFlagEmoji, countryCode } from "@/lib/drift/flags"
import BackLink from "@/components/app/BackLink"
import CountriesMapClient from "@/components/app/countries/CountriesMapClient"

// Passport — the web port of the iOS travel-stats screen (profile → Countries).
// Hero tiles (countries + % of world), flags collected, total travel time, a
// stat grid, and the countries-you've-visited list. The choropleth world map
// and "furthest from home" arc from iOS need per-place coordinates + a home
// location; those are a follow-up.

const WORLD_COUNTRIES = 195

export default async function CountriesPage() {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return null

  const { data: buddyRows } = await supabase
    .from("trip_buddies")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "accepted")
    .returns<TripBuddyRow[]>()
  const buddyTripIds = (buddyRows ?? []).map((b) => b.trip_id)

  const orFilter = buddyTripIds.length
    ? `user_id.eq.${user.id},id.in.(${buddyTripIds.join(",")})`
    : `user_id.eq.${user.id}`
  const { data: tripsRaw } = await supabase
    .from("trips")
    .select("*")
    .or(orFilter)
    .order("start_date", { ascending: false })
    .returns<TripRow[]>()
  const trips = tripsRaw ?? []
  const tripIds = trips.map((t) => t.id)

  const { count: stepsCount } = tripIds.length
    ? await supabase.from("steps").select("id", { count: "exact", head: true }).in("trip_id", tripIds)
    : { count: 0 }

  // country → the trips that touched it
  const byCountry = new Map<string, TripRow[]>()
  for (const t of trips) {
    for (const c of t.countries ?? []) {
      if (!c) continue
      const list = byCountry.get(c) ?? []
      list.push(t)
      byCountry.set(c, list)
    }
  }
  const countries = [...byCountry.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  const cities = new Set<string>()
  for (const t of trips) for (const c of t.cities ?? []) if (c) cities.add(c)

  // Total travel time — trip date ranges are day-precision, so this is whole days.
  const totalDays = trips.reduce((sum, t) => {
    const s = t.start_date?.slice(0, 10)
    const e = (t.end_date ?? t.start_date)?.slice(0, 10)
    if (!s || !e) return sum
    const d = Math.round((Date.parse(e) - Date.parse(s)) / 86_400_000) + 1
    return sum + Math.max(0, d)
  }, 0)
  const weeks = Math.floor(totalDays / 7)
  const worldPct = ((countries.length / WORLD_COUNTRIES) * 100).toFixed(1)
  const visitedCodes = [
    ...new Set(countries.map(([c]) => countryCode(c)).filter((x): x is string => !!x)),
  ]

  return (
    <div className="mx-auto w-full max-w-xl px-5 pb-32 pt-8 lg:pt-12">
      <BackLink href="/app" label="Home" className="mb-5" />

      {/* Hero tiles */}
      <div className="grid grid-cols-2 gap-3">
        {/* Countries */}
        <div
          className="relative flex aspect-square flex-col justify-end overflow-hidden rounded-[22px] p-5 text-white"
          style={{ background: "linear-gradient(160deg,#E0563B,rgb(140,82,0))" }}
        >
          {/* soft hills */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 opacity-90">
            <div className="absolute -bottom-8 -left-6 h-28 w-28 rounded-full bg-black/15" />
            <div className="absolute -bottom-10 right-2 h-24 w-24 rounded-full bg-black/10" />
          </div>
          <div className="relative">
            <p className="font-drift-display text-[46px] font-bold leading-none">
              {countries.length}
            </p>
            <p className="mt-1 text-[15px] font-medium text-white/85">countries</p>
          </div>
        </div>

        {/* % of the world — night sky */}
        <div
          className="relative flex aspect-square flex-col justify-end overflow-hidden rounded-[22px] p-5 text-white"
          style={{ background: "radial-gradient(120% 120% at 80% 10%, #24304d 0%, #141a2c 60%, #0e1220 100%)" }}
        >
          <div className="absolute right-4 top-4 h-16 w-16 rounded-full bg-[#3f9e8f]" />
          <Stars />
          <div className="relative">
            <p className="font-drift-display text-[40px] font-bold leading-none">{worldPct}%</p>
            <p className="mt-1 text-[15px] font-medium text-white/75">of the world</p>
          </div>
        </div>
      </div>

      {/* Countries visited — choropleth */}
      {visitedCodes.length > 0 && (
        <section className="mt-8">
          <h2 className="font-drift-display text-[22px] font-bold">Countries visited</h2>
          <div className="mt-3">
            <CountriesMapClient codes={visitedCodes} />
          </div>
          <div className="mt-2.5 flex items-center gap-4 text-[12.5px] text-drift-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-drift-coral" /> Visited
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#DEDAD2]" /> Not yet
            </span>
          </div>
        </section>
      )}

      {/* Flags collected */}
      {countries.length > 0 && (
        <section className="mt-8">
          <h2 className="font-drift-display text-[22px] font-bold">Flags collected</h2>
          <div className="mt-3 grid grid-cols-6 gap-y-4 rounded-2xl bg-white p-4 shadow-sm">
            {countries.map(([c]) => (
              <span key={c} className="text-center text-[26px]" title={c}>
                {countryFlagEmoji(c) ?? "🌍"}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Total travel time */}
      <section className="mt-8">
        <h2 className="font-drift-display text-[22px] font-bold">Total travel time</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <TimeTile value={totalDays} label={totalDays === 1 ? "day" : "days"} />
          <TimeTile value={weeks} label={weeks === 1 ? "week" : "weeks"} />
        </div>
      </section>

      {/* Stat grid */}
      <section className="mt-8 grid grid-cols-2 gap-3">
        <StatCard value={trips.length} label="Trips" />
        <StatCard value={stepsCount ?? 0} label="Steps" />
        <StatCard value={countries.length} label="Countries" />
        <StatCard value={cities.size} label="Cities" />
      </section>

      {/* Countries visited — the tap-through list */}
      {countries.length > 0 && (
        <section className="mt-8">
          <h2 className="font-drift-display text-[22px] font-bold">Where you&apos;ve been</h2>
          <ul className="mt-3 space-y-2">
            {countries.map(([country, countryTrips]) => (
              <li key={country} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="text-[26px]">{countryFlagEmoji(country) ?? "🌍"}</span>
                  <p className="flex-1 text-[16px] font-bold">{country}</p>
                  <span className="text-[12.5px] font-semibold text-drift-muted">
                    {countryTrips.length} {countryTrips.length === 1 ? "trip" : "trips"}
                  </span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {countryTrips.map((t) => (
                    <Link
                      key={t.id}
                      href={`/app/trips/${t.id}`}
                      className="rounded-full bg-drift-coral-50 px-3 py-1 text-[12.5px] font-semibold text-drift-coral transition-opacity hover:opacity-80"
                    >
                      {t.title}
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {countries.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-4xl opacity-30">🌍</p>
          <p className="mt-3 text-[14.5px] text-drift-muted">
            No countries yet — your travels will fill this in.
          </p>
        </div>
      )}
    </div>
  )
}

function TimeTile({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-2xl py-6 text-white"
      style={{ background: "linear-gradient(160deg,#E0563B,rgb(150,72,20))" }}
    >
      <p className="font-drift-display text-[40px] font-bold leading-none">{value}</p>
      <p className="mt-1.5 text-[14px] font-medium text-white/85">{label}</p>
    </div>
  )
}

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-drift-coral/25 bg-white py-7 shadow-sm">
      <p className="font-drift-display text-[34px] font-bold text-drift-coral">{value}</p>
      <p className="mt-1 text-[14px] text-drift-muted">{label}</p>
    </div>
  )
}

// A few static "stars" for the night-sky tile.
function Stars() {
  const dots = [
    [18, 22], [34, 55], [58, 30], [72, 62], [46, 78], [86, 44], [24, 70], [64, 16],
  ]
  return (
    <>
      {dots.map(([l, t], i) => (
        <span
          key={i}
          className="absolute h-[3px] w-[3px] rounded-full bg-white/70"
          style={{ left: `${l}%`, top: `${t}%` }}
        />
      ))}
    </>
  )
}
