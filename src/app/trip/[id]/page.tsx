import { notFound } from "next/navigation"
import type { Metadata } from "next"

const SUPABASE_URL = "https://ykueoalpqeuqmhfbontz.supabase.co"
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrdWVvYWxwcWV1cW1oZmJvbnR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMjY0MTEsImV4cCI6MjA4OTgwMjQxMX0.Lzwvw2LfjGBI2CeSXzEbjr8gVoEgTgH3Wwx5gqmvSwE"

const headers = {
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
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/trips?id=eq.${id}&select=*`,
    { headers, next: { revalidate: 60 } }
  )
  const trips = await res.json()
  return Array.isArray(trips) && trips.length > 0 ? trips[0] : null
}

async function getStepCount(tripId: string): Promise<number> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/steps?trip_id=eq.${tripId}&select=id`,
    { headers, next: { revalidate: 60 } }
  )
  const steps = await res.json()
  return Array.isArray(steps) ? steps.length : 0
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const trip = await getTrip(id)
  if (!trip) return { title: "Trip not found" }
  return {
    title: `${trip.title} — Drift`,
    description: `A trip recorded with Drift.`,
  }
}

export default async function TripPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const trip = await getTrip(id)
  if (!trip) notFound()

  const stepCount = await getStepCount(id)

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
        {/* Title */}
        <h1 className="text-3xl font-light text-white tracking-tight">
          {trip.title}
        </h1>

        {/* Dates */}
        <p className="mt-3 text-white/40 text-sm font-mono">
          {startDate}
          {endDate && ` → ${endDate}`}
        </p>

        {/* Status */}
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

        {/* Stats */}
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

        {/* CTA */}
        <div className="mt-16 text-center">
          <p className="text-white/20 text-xs font-mono tracking-widest uppercase">
            Shared via Drift
          </p>
        </div>
      </div>
    </div>
  )
}
