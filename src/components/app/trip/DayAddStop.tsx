"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { resolvePlaceCandidates, type PlaceCandidate } from "@/lib/drift/chat"

// Direct "+ Add a stop" for a day (web port of the iOS day "+" add flow). Search
// a place → pick a time-of-day → insert a spot step parented to the destination
// on that day's date, then router.refresh() so the timeline reflects it. Reuses
// resolve-place search (same as the Where manager + new-trip flow).

const TIMES: Array<[string, string | null]> = [
  ["Morning", "09:00"],
  ["Afternoon", "13:00"],
  ["Evening", "19:00"],
  ["Anytime", null],
]

function countryFromAddress(c: PlaceCandidate): string | null {
  const parts = (c.address ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  const last = parts[parts.length - 1]
  if (!last || /\d/.test(last)) return null
  return last === c.name ? null : last
}

export default function DayAddStop({
  tripId,
  destId,
  dayDate,
}: {
  tripId: string
  destId: string
  dayDate: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState<PlaceCandidate | null>(null)
  const [time, setTime] = useState<string | null>("13:00")
  const [saving, setSaving] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2 || picked) {
      setCandidates([])
      return
    }
    const s = ++seq.current
    setSearching(true)
    const t = setTimeout(async () => {
      const r = await resolvePlaceCandidates(q)
      if (seq.current !== s) return
      setCandidates(r.slice(0, 6))
      setSearching(false)
    }, 350)
    return () => clearTimeout(t)
  }, [query, picked])

  function reset() {
    setOpen(false)
    setQuery("")
    setCandidates([])
    setPicked(null)
    setTime("13:00")
  }

  async function add() {
    if (!picked || saving) return
    setSaving(true)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any
    const hasCoord =
      picked.latitude != null && picked.longitude != null && !(picked.latitude === 0 && picked.longitude === 0)
    await sb.from("steps").insert({
      trip_id: tripId,
      parent_step_id: destId,
      date: dayDate,
      location_name: picked.name,
      step_type: "spot",
      latitude: hasCoord ? picked.latitude : null,
      longitude: hasCoord ? picked.longitude : null,
      country: countryFromAddress(picked),
      city: picked.name,
      scheduled_at: time ? `${dayDate}T${time}:00` : null,
      place_category: picked.primaryType ?? null,
    })
    setSaving(false)
    reset()
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-aurora-teal/45 bg-aurora-teal/10 py-3 text-[14px] font-semibold text-aurora-teal transition-colors hover:bg-aurora-teal/15"
      >
        + Add a stop
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={reset}>
      <div className="aurora-card w-full max-w-md overflow-hidden rounded-b-none rounded-t-hero sm:rounded-hero" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pb-2 pt-5 text-center">
          <h2 className="font-drift-display text-[20px] font-bold text-aurora-ink">Add a stop</h2>
          <p className="mt-0.5 text-[13px] text-aurora-ink2">Search a place to add to this day</p>
        </div>
        <div className="max-h-[62vh] overflow-y-auto px-5 pb-3">
          {!picked ? (
            <>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a place…"
                className="h-11 w-full rounded-xl border border-aurora-border bg-aurora-midnight2 px-3 text-[15px] text-aurora-ink outline-none focus:border-aurora-teal"
              />
              <div className="mt-2 space-y-1">
                {searching && <p className="px-1 py-1.5 text-[13px] text-aurora-ink3">Searching…</p>}
                {!searching &&
                  candidates.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setPicked(c)}
                      className="flex w-full items-center gap-3 rounded-xl bg-aurora-midnight2 p-2.5 text-left transition-colors hover:bg-aurora-glass2"
                    >
                      <span className="text-[15px]">📍</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-semibold text-aurora-ink">{c.name}</span>
                        {c.address && <span className="block truncate text-[12px] text-aurora-ink3">{c.address}</span>}
                      </span>
                    </button>
                  ))}
              </div>
            </>
          ) : (
            <div className="py-1">
              <div className="mb-3 flex items-center gap-3 rounded-xl bg-aurora-midnight2 p-3">
                <span className="text-[16px]">📍</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-aurora-ink">{picked.name}</span>
                  {picked.address && <span className="block truncate text-[12px] text-aurora-ink3">{picked.address}</span>}
                </span>
                <button onClick={() => setPicked(null)} className="text-[12px] font-semibold text-aurora-teal">Change</button>
              </div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-aurora-ink3">When</p>
              <div className="flex flex-wrap gap-2">
                {TIMES.map(([label, val]) => (
                  <button
                    key={label}
                    onClick={() => setTime(val)}
                    className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                      time === val
                        ? "bg-aurora-teal/20 text-aurora-teal ring-1 ring-aurora-teal/50"
                        : "bg-aurora-midnight2 text-aurora-ink2"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-aurora-border px-5 py-3">
          {picked ? (
            <button onClick={add} disabled={saving} className="aurora-cta h-11 w-full disabled:opacity-50">
              {saving ? "Adding…" : `Add ${picked.name}`}
            </button>
          ) : (
            <button onClick={reset} className="h-11 w-full rounded-full border border-aurora-border text-[14px] font-semibold text-aurora-ink2">
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
