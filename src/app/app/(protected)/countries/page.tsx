import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import type { TripRow, TripBuddyRow } from "@/lib/db-types"
import { countryFlagEmoji } from "@/lib/drift/flags"

// Countries visited — reached from the home profile stats. Aggregates the
// countries across your trips (owned + accepted-buddy, same scope as home)
// with the trips that took you there.

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
  const { data: trips } = await supabase
    .from("trips")
    .select("*")
    .or(orFilter)
    .order("start_date", { ascending: false })
    .returns<TripRow[]>()

  // country → trips that touched it
  const byCountry = new Map<string, TripRow[]>()
  for (const t of trips ?? []) {
    for (const c of t.countries ?? []) {
      if (!c) continue
      const list = byCountry.get(c) ?? []
      list.push(t)
      byCountry.set(c, list)
    }
  }
  const countries = [...byCountry.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  )

  return (
    <div className="mx-auto w-full max-w-xl px-5 pb-32 pt-8 lg:pt-12">
      <h1 className="font-drift-display text-[28px] font-bold">Countries</h1>
      <p className="mt-1 text-[14px] text-drift-muted">
        {countries.length} {countries.length === 1 ? "country" : "countries"} across your
        trips
      </p>

      <ul className="mt-6 space-y-2">
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
