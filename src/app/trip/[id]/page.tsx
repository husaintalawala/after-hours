import type { Metadata } from "next"

const SUPABASE_URL = "https://ykueoalpqeuqmhfbontz.supabase.co"
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrdWVvYWxwcWV1cW1oZmJvbnR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMjY0MTEsImV4cCI6MjA4OTgwMjQxMX0.Lzwvw2LfjGBI2CeSXzEbjr8gVoEgTgH3Wwx5gqmvSwE"

const fetchHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
}

interface Trip {
  id: string
  title: string
  start_date: string
  end_date: string | null
  status: string
}

async function getTrip(id: string): Promise<Trip | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/trips?id=eq.${id}&select=*`,
      { headers: fetchHeaders, next: { revalidate: 60 } }
    )
    const trips = await res.json()
    return Array.isArray(trips) && trips.length > 0 ? trips[0] : null
  } catch {
    return null
  }
}

async function getStepCount(tripId: string): Promise<number> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/steps?trip_id=eq.${tripId}&select=id`,
      { headers: fetchHeaders, next: { revalidate: 60 } }
    )
    const steps = await res.json()
    return Array.isArray(steps) ? steps.length : 0
  } catch {
    return 0
  }
}

export async function generateMetadata({
  params,
}: {
  params: { id: string }
}): Promise<Metadata> {
  const trip = await getTrip(params.id)
  if (!trip) return { title: "Trip not found" }
  return {
    title: `${trip.title} — Drift`,
    description: `A trip recorded with Drift.`,
  }
}

export default async function TripPage({
  params,
}: {
  params: { id: string }
}) {
  const trip = await getTrip(params.id)

  if (!trip) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-white/60 text-lg">Trip not found</p>
          <p className="text-white/30 text-sm">
            This trip may be private or may have been removed.
          </p>
          <a href="/" className="text-white/30 text-sm underline">
            ← back
          </a>
        </div>
      </div>
    )
  }

  const stepCount = await getStepCount(params.id)

  const startDate = new Date(trip.start_date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })

  const endDate = trip.end_date
    ? new Date(trip.end_date).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-xl mx-auto px-6 py-20">
        <h1 className="text-3xl font-light text-white tracking-tight">
          {trip.title}
        </h1>

        <p className="mt-3 text-white/40 text-sm font-mono">
          {startDate}
          {endDate && ` → ${endDate}`}
        </p>

        <div className="mt-6 flex items-center gap-3">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              trip.status === "active"
                ? "bg-red-500 animate-pulse"
                : "bg-white/20"
            }`}
          />
          <span className="text-white/50 text-sm">
            {trip.status === "active" ? "Recording now" : "Completed"}
          </span>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-4">
          <div className="border border-white/10 rounded-xl p-5">
            <p className="text-2xl font-mono text-white">{stepCount}</p>
            <p className="text-xs text-white/30 mt-1">Steps</p>
          </div>
          <div className="border border-white/10 rounded-xl p-5">
            <p className="text-2xl font-mono text-white">
              {trip.status === "active" ? "—" : "✓"}
            </p>
            <p className="text-xs text-white/30 mt-1">Status</p>
          </div>
        </div>

        <div className="mt-16 text-center">
          <p className="text-white/20 text-xs font-mono tracking-widest uppercase">
            Shared via Drift
          </p>
        </div>
      </div>
    </div>
  )
}
