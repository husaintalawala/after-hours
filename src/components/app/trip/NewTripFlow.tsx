"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { resolvePlaceCandidates, type PlaceCandidate } from "@/lib/drift/chat"
import BackLink from "@/components/app/BackLink"

// Web port of the iOS new-trip flow: TripTypeSheet ("What kind of trip?" —
// past / currently traveling / future) → destination search → title + dates →
// insert trips row + destination anchor step (same payloads as
// TripDetailFormView.createDestinationAnchor) → open the trip studio.

type TripType = "past" | "current" | "future"

const TYPE_OPTIONS: { type: TripType; icon: string; label: string; sub: string }[] = [
  { type: "past", icon: "🕰", label: "Add a past trip", sub: "Log where you've been" },
  { type: "current", icon: "🚶", label: "I'm currently traveling", sub: "Start tracking now" },
  { type: "future", icon: "📅", label: "Plan a future trip", sub: "Build the itinerary with Drift" },
]

function todayStr(): string {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, "0")
  const day = `${d.getDate()}`.padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}

function nightsBetween(start: string, end: string | null): number | null {
  if (!end) return null
  const ms = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()
  return Math.max(0, Math.round(ms / 86400000))
}

export default function NewTripFlow() {
  const router = useRouter()
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [tripType, setTripType] = useState<TripType | null>(null)

  // Destination search
  const [query, setQuery] = useState("")
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [place, setPlace] = useState<PlaceCandidate | null>(null)
  const searchSeq = useRef(0)

  // Details
  const [title, setTitle] = useState("")
  const [startDate, setStartDate] = useState(todayStr())
  const [endDate, setEndDate] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debounced destination search (resolve-place: POI cache → Google → OSM).
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setCandidates([])
      return
    }
    const seq = ++searchSeq.current
    setSearching(true)
    const t = setTimeout(async () => {
      const results = await resolvePlaceCandidates(q)
      if (searchSeq.current !== seq) return
      setCandidates(results.slice(0, 6))
      setSearching(false)
    }, 350)
    return () => clearTimeout(t)
  }, [query])

  function pickPlace(c: PlaceCandidate) {
    setPlace(c)
    setTitle((prev) => prev || c.name)
    setStep(2)
  }

  async function create() {
    if (!place || !tripType || creating) return
    setCreating(true)
    setError(null)
    try {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) throw new Error("Not signed in")

      // iOS stores the default-privacy preference locally (UserDefaults);
      // the web mirrors that in localStorage via the Settings page.
      const privacy =
        (typeof window !== "undefined" && localStorage.getItem("defaultTripPrivacy")) ||
        "public"

      const country = countryFromAddress(place)
      const city = place.name
      const start = startDate || todayStr()
      const end = tripType === "current" ? null : endDate || null

      // Same shape as iOS CreateTripWithSeeds (TripDetailFormView).
      const db = supabase as any
      const { data: trip, error: tripErr } = await db
        .from("trips")
        .insert({
          user_id: user.id,
          title: title.trim() || place.name,
          privacy,
          start_date: start,
          end_date: end,
          countries: country ? [country] : null,
          cities: city ? [city] : null,
          is_active: tripType === "current",
        })
        .select("id")
        .single()
      if (tripErr || !trip) throw new Error(tripErr?.message ?? "trip insert failed")

      // Destination anchor step — mirrors iOS createDestinationAnchor exactly.
      const hasCoord =
        place.latitude != null &&
        place.longitude != null &&
        !(place.latitude === 0 && place.longitude === 0)
      const { error: stepErr } = await db.from("steps").insert({
        trip_id: trip.id,
        date: start,
        location_name: place.name,
        step_type: "destination",
        latitude: hasCoord ? place.latitude : null,
        longitude: hasCoord ? place.longitude : null,
        country,
        city,
        nights: nightsBetween(start, end),
      })
      // Anchor failure is non-fatal on iOS too — the trip still exists.
      if (stepErr) console.warn("[NewTrip] destination anchor failed:", stepErr.message)

      router.push(`/app/trips/${trip.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-5 pb-32 pt-8 lg:pt-14">
      {/* ---------- Step 0: What kind of trip? ---------- */}
      {step === 0 && (
        <>
          <BackLink href="/app" label="Home" className="mb-5" />
          <h1 className="text-center font-drift-display text-[26px] font-bold">
            What kind of trip?
          </h1>
          <p className="mt-1.5 text-center text-[14px] text-drift-muted">
            You can change this later
          </p>

          <div className="mt-7 space-y-3">
            {TYPE_OPTIONS.map((o) => {
              const selected = tripType === o.type
              return (
                <button
                  key={o.type}
                  onClick={() => setTripType(o.type)}
                  className={`flex w-full items-center gap-4 rounded-2xl border-2 bg-aurora-glass p-4 text-left transition-all ${
                    selected
                      ? "border-drift-coral bg-drift-coral-50"
                      : "border-transparent hover:border-drift-divider"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      selected ? "border-drift-coral" : "border-drift-divider"
                    }`}
                  >
                    {selected && <span className="h-2.5 w-2.5 rounded-full bg-drift-coral" />}
                  </span>
                  <span className="text-[20px]">{o.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[15.5px] font-semibold">{o.label}</span>
                    <span className="block text-[12.5px] text-drift-muted">{o.sub}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <button
            disabled={!tripType}
            onClick={() => setStep(1)}
            className={`mt-6 h-[52px] w-full rounded-2xl text-[16px] font-bold transition-colors ${
              tripType
                ? "bg-drift-coral text-white shadow-md shadow-drift-coral/25"
                : "bg-aurora-glass text-drift-muted/60"
            }`}
          >
            Continue
          </button>
        </>
      )}

      {/* ---------- Step 1: Where to? ---------- */}
      {step === 1 && (
        <>
          <BackRow onBack={() => setStep(0)} />
          <h1 className="mt-4 font-drift-display text-[26px] font-bold">
            {tripType === "past" ? "Where did you go?" : "Where to?"}
          </h1>

          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a city or place…"
            className="mt-5 h-[52px] w-full rounded-2xl border border-drift-divider bg-aurora-glass px-4 text-[15.5px] outline-none focus:border-drift-coral"
          />

          <div className="mt-3 space-y-1.5">
            {searching && (
              <p className="px-1 py-2 text-[13px] text-drift-muted">Searching…</p>
            )}
            {!searching &&
              candidates.map((c) => (
                <button
                  key={c.id}
                  onClick={() => pickPlace(c)}
                  className="flex w-full items-center gap-3.5 rounded-2xl bg-aurora-glass p-3.5 text-left transition-colors hover:bg-drift-coral-50"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-drift-coral-50 text-[17px]">
                    📍
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold">{c.name}</span>
                    {c.address && (
                      <span className="block truncate text-[12.5px] text-drift-muted">
                        {c.address}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            {!searching && query.trim().length >= 2 && candidates.length === 0 && (
              <p className="px-1 py-2 text-[13px] text-drift-muted">
                No places found — try a city name.
              </p>
            )}
          </div>
        </>
      )}

      {/* ---------- Step 2: Title + dates ---------- */}
      {step === 2 && place && (
        <>
          <BackRow onBack={() => setStep(1)} />
          <h1 className="mt-4 font-drift-display text-[26px] font-bold">
            {tripType === "current" ? "Traveling now" : "Trip details"}
          </h1>
          <p className="mt-1 text-[14px] text-drift-muted">
            📍 {place.name}
            {countryFromAddress(place) ? ` · ${countryFromAddress(place)}` : ""}
          </p>

          <label className="mt-6 block text-[12px] font-bold uppercase tracking-wide text-drift-muted">
            Trip name
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={place.name}
            className="mt-1.5 h-[52px] w-full rounded-2xl border border-drift-divider bg-aurora-glass px-4 text-[15.5px] outline-none focus:border-drift-coral"
          />

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-bold uppercase tracking-wide text-drift-muted">
                {tripType === "current" ? "Started" : "Start date"}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1.5 h-[52px] w-full rounded-2xl border border-drift-divider bg-aurora-glass px-4 text-[15px] outline-none focus:border-drift-coral"
              />
            </div>
            {tripType !== "current" && (
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide text-drift-muted">
                  End date
                </label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1.5 h-[52px] w-full rounded-2xl border border-drift-divider bg-aurora-glass px-4 text-[15px] outline-none focus:border-drift-coral"
                />
              </div>
            )}
          </div>
          {tripType === "current" && (
            <p className="mt-2 text-[12.5px] text-drift-muted">
              We&apos;ll mark this trip as traveling now — set an end date when you&apos;re back.
            </p>
          )}

          {error && (
            <p className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-[13.5px] text-red-400">
              {error}
            </p>
          )}

          <button
            disabled={creating}
            onClick={create}
            className="mt-7 h-[52px] w-full rounded-2xl bg-drift-coral text-[16px] font-bold text-white shadow-md shadow-drift-coral/25 transition-transform hover:scale-[1.01] disabled:opacity-60"
          >
            {creating ? "Creating…" : "Create trip"}
          </button>
        </>
      )}
    </div>
  )
}

function BackRow({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="flex items-center gap-1 text-[13.5px] font-semibold text-drift-muted transition-colors hover:text-drift-ink"
    >
      ← Back
    </button>
  )
}

// resolve-place candidates carry a formatted address ("Reykjavík, Iceland") —
// the last comma component is the country, matching iOS placemark.country use.
function countryFromAddress(c: PlaceCandidate): string | null {
  const parts = (c.address ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  const last = parts[parts.length - 1]
  if (!last || /\d/.test(last)) return null
  return last === c.name ? null : last
}
