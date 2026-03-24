import type { Metadata } from "next"
import { notFound } from "next/navigation"

const SUPABASE_URL = "https://ykueoalpqeuqmhfbontz.supabase.co"
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrdWVvYWxwcWV1cW1oZmJvbnR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMjY0MTEsImV4cCI6MjA4OTgwMjQxMX0.Lzwvw2LfjGBI2CeSXzEbjr8gVoEgTgH3Wwx5gqmvSwE"
const MAPBOX_TOKEN = process.env.MAPBOX_PUBLIC_TOKEN ?? ""

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
}

interface Trip {
  id: string
  title: string
  city: string | null
  country: string | null
  start_date: string | null
  end_date: string | null
  status: string
  privacy: string
  ai_story: string | null
  user_id: string
}

interface Step {
  id: string
  trip_id: string
  note: string | null
  latitude: number
  longitude: number
  altitude: number | null
  timestamp: string
}

async function fetchTrip(id: string): Promise<Trip | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/trips?id=eq.${id}&select=*`,
      { headers, next: { revalidate: 60 } }
    )
    const data = await res.json()
    return Array.isArray(data) && data.length > 0 ? data[0] : null
  } catch {
    return null
  }
}

async function fetchSteps(tripId: string): Promise<Step[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/steps?trip_id=eq.${tripId}&select=*&order=timestamp.asc`,
      { headers, next: { revalidate: 60 } }
    )
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function buildMapUrl(steps: Step[]): string {
  const base = "https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static"

  if (steps.length === 0) {
    return `${base}/0,20,1.5,0/1200x600@2x?access_token=${MAPBOX_TOKEN}`
  }

  const geojson = {
    type: "Feature",
    properties: { stroke: "#c9a227", "stroke-width": 3, "stroke-opacity": 0.9 },
    geometry: {
      type: "LineString",
      coordinates: steps.map((s) => [s.longitude, s.latitude]),
    },
  }
  const encoded = encodeURIComponent(JSON.stringify(geojson))

  const first = steps[0]
  const last = steps[steps.length - 1]
  const pins = `pin-s-a+c9a227(${first.longitude},${first.latitude}),pin-s-b+b87333(${last.longitude},${last.latitude})`

  return `${base}/geojson(${encoded}),${pins}/auto/1200x600@2x?padding=60&access_token=${MAPBOX_TOKEN}`
}

function formatDate(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function haversineKm(steps: Step[]): number {
  if (steps.length < 2) return 0
  let total = 0
  for (let i = 1; i < steps.length; i++) {
    const R = 6371
    const dLat = ((steps[i].latitude - steps[i - 1].latitude) * Math.PI) / 180
    const dLon =
      ((steps[i].longitude - steps[i - 1].longitude) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((steps[i - 1].latitude * Math.PI) / 180) *
        Math.cos((steps[i].latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2
    total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }
  return total
}

// --- Metadata ---

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const trip = await fetchTrip(id)
  if (!trip) return { title: "Trip Not Found" }

  const steps = await fetchSteps(id)
  const mapUrl = buildMapUrl(steps)
  const location = [trip.city, trip.country].filter(Boolean).join(", ")
  const description = trip.ai_story
    ? trip.ai_story.slice(0, 160) + "..."
    : `A trip${location ? ` through ${location}` : ""} recorded on Drift.`

  return {
    title: `${trip.title} | after-hours`,
    description,
    openGraph: {
      title: trip.title,
      description,
      images: [{ url: mapUrl, width: 1200, height: 600 }],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: trip.title,
      description,
      images: [mapUrl],
    },
  }
}

// --- Page ---

export default async function TripPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const trip = await fetchTrip(id)
  if (!trip) notFound()

  const steps = await fetchSteps(id)
  const mapUrl = buildMapUrl(steps)
  const distance = haversineKm(steps)
  const location = [trip.city, trip.country].filter(Boolean).join(", ")
  const dateRange = [formatDate(trip.start_date), formatDate(trip.end_date)]
    .filter(Boolean)
    .join(" \u2014 ")

  return (
    <main className="min-h-screen bg-midnight text-cream">
      {/* Map Hero */}
      <div className="relative w-full aspect-[2/1] max-h-[70vh] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mapUrl}
          alt={`Map of ${trip.title}`}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-midnight via-midnight/40 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-8 md:p-12">
          <div className="max-w-4xl mx-auto" style={{ animation: "fadeIn 0.8s ease-out forwards" }}>
            {location && (
              <p className="font-mono text-xs tracking-[0.25em] uppercase text-gold mb-3 opacity-80">
                {location}
              </p>
            )}
            <h1 className="font-display text-4xl md:text-6xl lg:text-7xl font-medium text-cream leading-[1.1] mb-4">
              {trip.title}
            </h1>
            {dateRange && (
              <p className="font-mono text-sm text-cream/40">{dateRange}</p>
            )}
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="border-y border-cream/[0.06]">
        <div className="max-w-4xl mx-auto px-8 md:px-12 py-6 flex gap-10 md:gap-16 overflow-x-auto">
          <Stat label="Distance" value={`${distance.toFixed(1)} km`} />
          <Stat label="Steps" value={String(steps.length)} />
          <Stat
            label="Status"
            value={trip.status === "completed" ? "Completed" : "In Progress"}
          />
          {trip.privacy && (
            <Stat
              label="Visibility"
              value={
                trip.privacy.charAt(0).toUpperCase() + trip.privacy.slice(1)
              }
            />
          )}
        </div>
      </div>

      {/* Content */}
      <div
        className="max-w-4xl mx-auto px-8 md:px-12 py-16 space-y-16"
        style={{ animation: "fadeInUp 0.8s ease-out 0.2s forwards", opacity: 0 }}
      >
        {/* AI Story */}
        {trip.ai_story && (
          <section>
            <SectionHeading>AI Story</SectionHeading>
            <div className="font-body text-lg md:text-xl leading-relaxed text-cream/80 whitespace-pre-line">
              {trip.ai_story}
            </div>
          </section>
        )}

        {/* Steps Timeline */}
        {steps.length > 0 && (
          <section>
            <SectionHeading>Timeline</SectionHeading>
            <div className="space-y-0">
              {steps.map((step, i) => (
                <div key={step.id} className="flex gap-4 group">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-gold/60 group-hover:bg-gold transition-colors mt-2 shrink-0" />
                    {i < steps.length - 1 && (
                      <div className="w-px flex-1 bg-cream/[0.06]" />
                    )}
                  </div>
                  <div className="pb-8">
                    {step.note && (
                      <p className="font-body text-cream/80 mb-1">
                        {step.note}
                      </p>
                    )}
                    <p className="font-mono text-xs text-cream/30">
                      {new Date(step.timestamp).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      <span className="ml-3 text-cream/15">
                        {step.latitude.toFixed(4)}, {step.longitude.toFixed(4)}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Open in Drift CTA */}
        <section className="text-center pt-8 pb-4">
          <a
            href={`drift://trip/${id}`}
            className="inline-flex items-center gap-3 px-8 py-4 bg-gold/10 border border-gold/20 rounded-full font-mono text-sm text-gold hover:bg-gold/20 hover:border-gold/40 transition-all duration-300"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            Open in Drift
          </a>
          <p className="font-mono text-xs text-cream/20 mt-4">
            View this trip in the Drift iOS app
          </p>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-cream/[0.06] py-8 text-center">
        <p className="font-mono text-xs text-cream/20">after-hours.app</p>
      </footer>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0 }
          to { opacity: 1 }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px) }
          to { opacity: 1; transform: translateY(0) }
        }
      `}</style>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="shrink-0">
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-cream/30 mb-1">
        {label}
      </p>
      <p className="font-display text-xl text-cream">{value}</p>
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-8">
      <div className="w-8 h-px bg-gold/40" />
      <h2 className="font-mono text-xs tracking-[0.25em] uppercase text-gold/70">
        {children}
      </h2>
    </div>
  )
}
