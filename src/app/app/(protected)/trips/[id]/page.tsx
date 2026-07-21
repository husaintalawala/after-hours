import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { fetchTripDetail, destinationLabel } from "@/lib/drift/trip"
import { formatDayLabel } from "@/lib/drift/dates"
import type { TimelineItem } from "@/lib/drift/timeline"
import TripChat from "@/components/app/chat/TripChat"

export default async function TripDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createClient()
  const detail = await fetchTripDetail(supabase, params.id)
  if (!detail) notFound()

  const { trip, destinations } = detail

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6">
      <Link href="/app" className="text-sm text-drift-muted hover:text-drift-ink">
        ← Trips
      </Link>

      <header className="mt-3">
        <h1 className="font-drift-display text-3xl font-medium tracking-tight">
          {trip.title || "Untitled trip"}
        </h1>
        <p className="mt-1 text-drift-muted">{tripSubtitle(trip)}</p>
      </header>

      {destinations.length === 0 && (
        <p className="mt-8 text-drift-muted">
          No itinerary yet. Ask Drift below to start planning.
        </p>
      )}

      <div className="mt-6 space-y-8">
        {destinations.map(({ destination, days }) => (
          <section key={destination.id}>
            <h2 className="font-drift-display text-xl font-medium">
              {destinationLabel(destination)}
            </h2>
            <p className="text-sm text-drift-text-tertiary">
              {[
                destination.country,
                `${destination.nights ?? 0} night${
                  (destination.nights ?? 0) === 1 ? "" : "s"
                }`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>

            <div className="mt-4 space-y-6">
              {days.map((day) => (
                <div key={day.dayNumber}>
                  <div className="flex items-baseline gap-2">
                    <span className="font-drift-display text-base font-medium">
                      Day {day.dayNumber}
                    </span>
                    <span className="text-sm text-drift-text-tertiary">
                      {formatDayLabel(day.date)}
                    </span>
                  </div>

                  {day.items.length === 0 ? (
                    <p className="mt-2 text-sm text-drift-text-tertiary">
                      Nothing planned yet
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {day.items.map((item) => (
                        <TimelineRow key={item.id} item={item} />
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <TripChat
        tripId={trip.id}
        tripTitle={trip.title || "your trip"}
        tripStart={trip.start_date ?? null}
        destinations={destinations.map(({ destination }) => ({
          id: destination.id,
          date: destination.date,
          nights: destination.nights ?? 0,
          label: destinationLabel(destination),
        }))}
      />
    </main>
  )
}

function TimelineRow({ item }: { item: TimelineItem }) {
  return (
    <li className="flex gap-3 rounded-xl border border-drift-divider bg-white p-3">
      <div className="w-12 shrink-0 pt-0.5 text-right text-xs tabular-nums text-drift-text-tertiary">
        {item.startTimeMinutes != null ? minutesToLabel(item.startTimeMinutes) : "—"}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-drift-coral">
          {item.badge}
        </p>
        <p className="truncate font-medium">{item.title}</p>
        {item.subtitle && (
          <p className="truncate text-sm text-drift-muted">{item.subtitle}</p>
        )}
      </div>
    </li>
  )
}

function minutesToLabel(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const ampm = h < 12 ? "am" : "pm"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`
}

function tripSubtitle(trip: {
  cities?: string[] | null
  countries?: string[] | null
  start_date?: string | null
  end_date?: string | null
}): string {
  const place =
    trip.cities?.filter(Boolean).join(", ") ||
    trip.countries?.filter(Boolean).join(", ") ||
    ""
  const fmt = (iso?: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        })
      : ""
  const range = [fmt(trip.start_date), fmt(trip.end_date)].filter(Boolean).join(" – ")
  return [place, range].filter(Boolean).join(" · ")
}
