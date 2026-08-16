import type { Metadata } from "next"
import { notFound } from "next/navigation"

// Public trip share page — Drift's showcase for a demo-public trip. Server
// component, anon-key REST reads only. Anon RLS exposes trips/steps/media/
// expenses for demo-public trips; profiles are blocked, so no owner identity
// is ever rendered here.

const SUPABASE_URL = "https://ykueoalpqeuqmhfbontz.supabase.co"
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrdWVvYWxwcWV1cW1oZmJvbnR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMjY0MTEsImV4cCI6MjA4OTgwMjQxMX0.Lzwvw2LfjGBI2CeSXzEbjr8gVoEgTgH3Wwx5gqmvSwE"

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
}

const REVALIDATE = { next: { revalidate: 300 } }

interface Trip {
  id: string
  title: string
  cities: string[] | null
  countries: string[] | null
  start_date: string | null
  end_date: string | null
  privacy: string | null
  status: string | null
}

interface Step {
  id: string
  title: string | null
  location_name: string | null
  city: string | null
  nights: number | null
  transport_mode: string | null
  step_type: string | null
  parent_step_id: string | null
  scheduled_at: string | null
  place_category: string | null
  notes: string | null
  date: string | null
  display_order: number | null
  step_number: number | null
}

interface MediaItem {
  id: string
  url: string | null
  type: string | null
  created_at: string | null
}

interface Expense {
  id: string
  label: string | null
  amount: number | null
  currency: string | null
}

// --- Fetchers ---

async function fetchTrip(id: string): Promise<Trip | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/trips?id=eq.${encodeURIComponent(id)}&select=id,title,cities,countries,start_date,end_date,privacy,status`,
      { headers, ...REVALIDATE }
    )
    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data) && data.length > 0 ? (data[0] as Trip) : null
  } catch {
    return null
  }
}

async function fetchSteps(tripId: string): Promise<Step[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/steps?trip_id=eq.${encodeURIComponent(tripId)}&select=id,title,location_name,city,nights,transport_mode,step_type,parent_step_id,scheduled_at,place_category,notes,date,display_order,step_number&order=display_order.asc`,
      { headers, ...REVALIDATE }
    )
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? (data as Step[]) : []
  } catch {
    return []
  }
}

async function fetchMedia(tripId: string): Promise<MediaItem[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/media?trip_id=eq.${encodeURIComponent(tripId)}&select=id,url,type,created_at&order=created_at.asc`,
      { headers, ...REVALIDATE }
    )
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? (data as MediaItem[]) : []
  } catch {
    return []
  }
}

async function fetchExpenses(tripId: string): Promise<Expense[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/expenses?trip_id=eq.${encodeURIComponent(tripId)}&select=id,label,amount,currency`,
      { headers, ...REVALIDATE }
    )
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? (data as Expense[]) : []
  } catch {
    return []
  }
}

// --- Formatting ---
// scheduled_at / trip dates are stored as "floating wall clock" — the UTC
// value IS the destination-local time, so every formatter pins timeZone: UTC.

function formatDate(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

function formatDayShort(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

function formatTime(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  })
}

function formatCategory(raw: string): string {
  return raw
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${Math.round(amount)} ${currency}`
  }
}

// --- Itinerary grouping ---
// Destinations are top-level steps (step_type "destination"), ordered by
// step_number then display_order. Spots hang under them via parent_step_id and
// order by scheduled_at (unscheduled last), then date, then display_order.

interface DestinationGroup {
  destination: Step | null
  spots: Step[]
}

function spotSortKey(s: Step): string {
  if (s.scheduled_at) return s.scheduled_at
  if (s.date) return `${s.date}T23:59:59`
  return "9999-12-31"
}

function groupItinerary(steps: Step[]): DestinationGroup[] {
  const destinations = steps
    .filter((s) => s.step_type === "destination")
    .sort(
      (a, b) =>
        (a.step_number ?? a.display_order ?? 0) -
        (b.step_number ?? b.display_order ?? 0)
    )
  const spots = steps.filter((s) => s.step_type === "spot")
  const sortSpots = (list: Step[]) =>
    list.sort(
      (a, b) =>
        spotSortKey(a).localeCompare(spotSortKey(b)) ||
        (a.display_order ?? 0) - (b.display_order ?? 0)
    )

  const destinationIds = new Set(destinations.map((d) => d.id))
  const groups: DestinationGroup[] = destinations.map((d) => ({
    destination: d,
    spots: sortSpots(spots.filter((s) => s.parent_step_id === d.id)),
  }))
  const orphans = sortSpots(
    spots.filter(
      (s) => !s.parent_step_id || !destinationIds.has(s.parent_step_id)
    )
  )
  if (orphans.length > 0) groups.push({ destination: null, spots: orphans })
  return groups
}

// --- Metadata ---

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const [trip, media] = await Promise.all([fetchTrip(id), fetchMedia(id)])
  if (!trip || trip.privacy !== "public") return { title: "Trip Not Found" }

  const cities = (trip.cities ?? []).join(" · ")
  const dates = [formatDate(trip.start_date), formatDate(trip.end_date)]
    .filter(Boolean)
    .join(" – ")
  const description =
    [cities, dates].filter(Boolean).join(" — ") + ". Planned on Drift."
  const photo = media.find((m) => m.type === "photo" && m.url)

  return {
    title: `${trip.title} · Drift`,
    description,
    openGraph: {
      title: trip.title,
      description,
      siteName: "Drift",
      type: "article",
      ...(photo?.url
        ? { images: [{ url: photo.url, width: 1200, height: 800 }] }
        : {}),
    },
    twitter: {
      card: photo?.url ? "summary_large_image" : "summary",
      title: trip.title,
      description,
      ...(photo?.url ? { images: [photo.url] } : {}),
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
  if (!trip || trip.privacy !== "public") notFound()

  const [steps, media, expenses] = await Promise.all([
    fetchSteps(id),
    fetchMedia(id),
    fetchExpenses(id),
  ])

  const groups = groupItinerary(steps)
  const photos = media.filter((m) => m.type === "photo" && m.url).slice(0, 12)
  const dateRange = [formatDate(trip.start_date), formatDate(trip.end_date)]
    .filter(Boolean)
    .join(" – ")
  const citiesLine = (trip.cities ?? []).join(" · ")
  const countriesLine = (trip.countries ?? []).join(", ")

  const totalsByCurrency = expenses.reduce<Record<string, number>>(
    (acc, e) => {
      if (e.amount == null) return acc
      const cur = e.currency ?? "USD"
      acc[cur] = (acc[cur] ?? 0) + e.amount
      return acc
    },
    {}
  )

  return (
    <main className="min-h-screen bg-aurora-midnight font-drift-body text-aurora-ink overflow-x-hidden">
      {/* Fraunces (display) — Inter comes from the root layout. */}
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&display=swap"
        rel="stylesheet"
      />

      {/* Hero */}
      <header className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 0%, rgba(55,214,196,0.14), transparent 70%), radial-gradient(40% 40% at 85% 20%, rgba(107,92,255,0.10), transparent 70%)",
          }}
        />
        <div className="relative max-w-3xl mx-auto px-6 pt-16 pb-12 md:pt-24 md:pb-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-aurora-border bg-aurora-glass px-3.5 py-1.5 text-xs text-aurora-ink2">
            <span className="h-1.5 w-1.5 rounded-full bg-aurora-teal" />
            Public trip on Drift
          </span>
          <h1 className="font-drift-display text-4xl md:text-6xl font-semibold leading-[1.08] mt-5 mb-4">
            {trip.title}
          </h1>
          {dateRange && (
            <p className="text-sm text-aurora-ink2">{dateRange}</p>
          )}
          {citiesLine && (
            <p className="text-sm text-aurora-ink3 mt-1.5">
              {citiesLine}
              {countriesLine ? ` — ${countriesLine}` : ""}
            </p>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 pb-20 space-y-16">
        {/* Itinerary */}
        {groups.length > 0 && (
          <section>
            <SectionHeading>Itinerary</SectionHeading>
            <div className="space-y-10">
              {groups.map((group, gi) => (
                <div key={group.destination?.id ?? "orphans"}>
                  {/* Destination header */}
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="font-drift-display text-lg text-aurora-teal">
                      {String(gi + 1).padStart(2, "0")}
                    </span>
                    <h3 className="font-drift-display text-2xl font-medium">
                      {group.destination
                        ? group.destination.city ??
                          group.destination.title ??
                          "Destination"
                        : "More spots"}
                    </h3>
                    {group.destination?.nights != null &&
                      group.destination.nights > 0 && (
                        <span className="text-sm text-aurora-ink3">
                          {group.destination.nights}{" "}
                          {group.destination.nights === 1 ? "night" : "nights"}
                        </span>
                      )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 pl-9 text-xs text-aurora-ink3">
                    {group.destination?.date && (
                      <span>Arrive {formatDayShort(group.destination.date)}</span>
                    )}
                    {group.destination?.transport_mode && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-aurora-border px-2.5 py-0.5">
                        <TransportGlyph
                          mode={group.destination.transport_mode}
                        />
                        {formatCategory(group.destination.transport_mode)}
                      </span>
                    )}
                  </div>

                  {/* Spots */}
                  {group.spots.length > 0 && (
                    <ul className="mt-5 pl-3 md:pl-9 space-y-3">
                      {group.spots.map((spot) => (
                        <li
                          key={spot.id}
                          className="rounded-card border border-aurora-border bg-aurora-glass px-4 py-3.5 md:px-5"
                        >
                          <div className="flex items-start gap-3">
                            {spot.scheduled_at && (
                              <span className="shrink-0 w-16 pt-0.5 text-xs text-aurora-teal tabular-nums">
                                {formatTime(spot.scheduled_at)}
                              </span>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-aurora-ink">
                                  {spot.title ??
                                    spot.location_name ??
                                    "Stop"}
                                </span>
                                {spot.place_category && (
                                  <span className="rounded-full bg-aurora-glass2 border border-aurora-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-aurora-ink3">
                                    {formatCategory(spot.place_category)}
                                  </span>
                                )}
                              </div>
                              {spot.notes && (
                                <p className="text-sm text-aurora-ink2 mt-1 break-words">
                                  {spot.notes}
                                </p>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Photos */}
        {photos.length > 0 && (
          <section>
            <SectionHeading>Photos</SectionHeading>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {photos.map((m) => (
                <div
                  key={m.id}
                  className="aspect-square overflow-hidden rounded-xl border border-aurora-border bg-aurora-glass"
                >
                  {/* Plain <img>: CDN hosts here aren't in the OptimizedImg allow-list. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.url ?? ""}
                    alt={`Photo from ${trip.title}`}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Trip money */}
        {expenses.length > 0 && (
          <section>
            <SectionHeading>Trip money</SectionHeading>
            <div className="rounded-card border border-aurora-border bg-aurora-glass px-5 py-5 md:px-6">
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                {Object.entries(totalsByCurrency).map(([currency, total]) => (
                  <span
                    key={currency}
                    className="font-drift-display text-3xl font-medium"
                  >
                    {formatMoney(total, currency)}
                  </span>
                ))}
              </div>
              <p className="text-sm text-aurora-ink3 mt-2">
                {expenses.length}{" "}
                {expenses.length === 1 ? "expense" : "expenses"} tracked and
                split in the Drift app.
              </p>
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="rounded-hero border border-aurora-border bg-aurora-glass px-6 py-10 md:py-12 text-center relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(70% 80% at 50% 100%, rgba(55,214,196,0.12), transparent 70%)",
            }}
          />
          <div className="relative">
            <h2 className="font-drift-display text-2xl md:text-3xl font-medium mb-3">
              Plan your own trip with Drift
            </h2>
            <p className="text-sm text-aurora-ink2 mb-7 max-w-md mx-auto">
              Itineraries, bookings, and shared costs — one place for the whole
              group.
            </p>
            <a
              href="/app"
              className="inline-flex items-center gap-2 rounded-full bg-aurora-teal px-8 py-3.5 font-semibold text-aurora-teal-ink shadow-aurora-glow transition-transform hover:scale-[1.02]"
            >
              Start planning
            </a>
            <p className="mt-5">
              <a
                href="/"
                className="text-xs text-aurora-ink3 hover:text-aurora-ink2 transition-colors"
              >
                What is Drift?
              </a>
            </p>
          </div>
        </section>
      </div>

      <footer className="border-t border-aurora-border py-8 text-center">
        <p className="text-xs text-aurora-ink3">Drift</p>
      </footer>
    </main>
  )
}

// --- Bits ---

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="w-8 h-px bg-aurora-teal/50" />
      <h2 className="text-xs tracking-[0.25em] uppercase text-aurora-ink3">
        {children}
      </h2>
    </div>
  )
}

const TRANSPORT_PATHS: Record<string, string> = {
  train:
    "M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h12v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4zM6 8h5v3H6V8zm7 0h5v3h-5V8zm-5.5 8c-.83 0-1.5-.67-1.5-1.5S6.67 13 7.5 13s1.5.67 1.5 1.5S8.33 16 7.5 16zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z",
  plane:
    "M21.5 15.5v-2l-8-5v-5.5c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5V8.5l-8 5v2l8-2.5v5.5l-2 1.5v1.5l3.5-1 3.5 1V20l-2-1.5V13l8 2.5z",
  flight:
    "M21.5 15.5v-2l-8-5v-5.5c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5V8.5l-8 5v2l8-2.5v5.5l-2 1.5v1.5l3.5-1 3.5 1V20l-2-1.5V13l8 2.5z",
  car: "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z",
  drive:
    "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z",
  bus: "M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z",
  ferry:
    "M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42c-.26.08-.48.26-.6.5s-.15.52-.06.78L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z",
  boat: "M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42c-.26.08-.48.26-.6.5s-.15.52-.06.78L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z",
  walk: "M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7",
}

const DEFAULT_TRANSPORT_PATH =
  "M4 11h12.17l-5.59-5.59L12 4l8 8-8 8-1.42-1.41L16.17 13H4v-2z"

function TransportGlyph({ mode }: { mode: string }) {
  const path =
    TRANSPORT_PATHS[mode.toLowerCase()] ?? DEFAULT_TRANSPORT_PATH
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3 w-3 fill-current"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  )
}
