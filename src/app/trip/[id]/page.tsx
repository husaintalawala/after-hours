"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"

const SUPABASE_URL = "https://ykueoalpqeuqmhfbontz.supabase.co"
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrdWVvYWxwcWV1cW1oZmJvbnR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMjY0MTEsImV4cCI6MjA4OTgwMjQxMX0.Lzwvw2LfjGBI2CeSXzEbjr8gVoEgTgH3Wwx5gqmvSwE"

interface Trip {
  id: string
  title: string
  start_date: string
  end_date: string | null
  status: string
}

interface Step {
  id: string
}

// Required for static export with dynamic routes
export function generateStaticParams() {
  return []
}

export default function TripPage() {
  const params = useParams()
  const id = params?.id as string

  const [trip, setTrip] = useState<Trip | null>(null)
  const [stepCount, setStepCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return

    async function fetchTrip() {
      try {
        const headers = {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        }

        const tripRes = await fetch(
          `${SUPABASE_URL}/rest/v1/trips?id=eq.${id}&select=*`,
          { headers }
        )
        const trips = await tripRes.json()
        if (!trips.length) {
          setError("Trip not found")
          setLoading(false)
          return
        }
        setTrip(trips[0])

        const stepsRes = await fetch(
          `${SUPABASE_URL}/rest/v1/steps?trip_id=eq.${id}&select=id`,
          { headers }
        )
        const steps = await stepsRes.json()
        setStepCount(Array.isArray(steps) ? steps.length : 0)
      } catch {
        setError("Failed to load trip")
      }
      setLoading(false)
    }

    fetchTrip()
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !trip) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-white/60 text-lg">{error ?? "Trip not found"}</p>
          <a href="/" className="text-white/30 text-sm underline">
            ← back
          </a>
        </div>
      </div>
    )
  }

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
              trip.status === "active" ? "bg-red-500 animate-pulse" : "bg-white/20"
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
