"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { resolvePlaceCandidates, type PlaceCandidate } from "@/lib/drift/chat"

// Trip-cover chips (web port of iOS coverChipsRow + TripCoverChipSheets +
// TripWhereSheet). Sits over the trip hero: Place → the "Where" destinations
// manager; Dates / Who / Budget → editor sheets that write straight to the
// trips row (columns already exist from the iOS migration). Every write does a
// router.refresh() so the server-rendered hero reflects the change.

export type WhereDest = {
  id: string
  label: string
  country: string | null
  lat: number | null
  lng: number | null
}

type Sheet = "place" | "dates" | "who" | "budget" | null

const BUDGET = ["Any", "$", "$$", "$$$", "$$$$"]

export default function TripCoverChips({
  tripId,
  placeName,
  startDate,
  endDate,
  adults,
  children,
  infants,
  pets,
  budgetLevel,
  destinations,
}: {
  tripId: string
  placeName: string
  startDate: string | null
  endDate: string | null
  adults: number
  children: number
  infants: number
  pets: number
  budgetLevel: number | null
  destinations: WhereDest[]
}) {
  const [sheet, setSheet] = useState<Sheet>(null)
  const travelerTotal = adults + children + infants + pets
  const dateText = fmtRange(startDate, endDate)

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        <Chip icon={<PinIcon />} filled={!!placeName} onClick={() => setSheet("place")}>
          {placeName || "Place"}
        </Chip>
        <Chip icon={<CalIcon />} filled={!!dateText} onClick={() => setSheet("dates")}>
          {dateText || "Dates"}
        </Chip>
        <Chip icon={<WhoIcon />} filled={travelerTotal > 0} onClick={() => setSheet("who")}>
          {travelerTotal > 0 ? String(travelerTotal) : "Who"}
        </Chip>
        <Chip icon={<DollarIcon />} filled={budgetLevel != null} onClick={() => setSheet("budget")}>
          {budgetLevel != null ? BUDGET[budgetLevel] ?? "Budget" : "Budget"}
        </Chip>
      </div>

      {sheet === "place" && (
        <WhereSheet tripId={tripId} destinations={destinations} onClose={() => setSheet(null)} />
      )}
      {sheet === "dates" && (
        <DatesSheet
          tripId={tripId}
          startDate={startDate}
          endDate={endDate}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "who" && (
        <WhoSheet
          tripId={tripId}
          adults={adults}
          childrenCount={children}
          infants={infants}
          pets={pets}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "budget" && (
        <BudgetSheet tripId={tripId} level={budgetLevel} onClose={() => setSheet(null)} />
      )}
    </>
  )
}

// ---------------------------------------------------------------- chip + modal

function Chip({
  icon,
  filled,
  onClick,
  children,
}: {
  icon: React.ReactNode
  filled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold backdrop-blur-md transition-colors ${
        filled
          ? "border-aurora-teal/60 bg-aurora-teal/20 text-aurora-teal"
          : "border-white/40 bg-black/30 text-white/90 hover:bg-black/40"
      }`}
    >
      <span className="opacity-90">{icon}</span>
      <span className="max-w-[160px] truncate">{children}</span>
    </button>
  )
}

function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="aurora-card w-full max-w-md overflow-hidden rounded-b-none rounded-t-hero sm:rounded-hero"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pb-2 pt-5 text-center">
          <h2 className="font-drift-display text-[20px] font-bold text-aurora-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-aurora-ink2">{subtitle}</p>}
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-5 pb-3">{children}</div>
        {footer && <div className="border-t border-aurora-border px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

function useTripUpdate(tripId: string) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const save = async (patch: Record<string, unknown>, done: () => void) => {
    setSaving(true)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("trips").update(patch).eq("id", tripId)
    setSaving(false)
    done()
    router.refresh()
  }
  return { save, saving }
}

// ---------------------------------------------------------------- Dates sheet

function DatesSheet({
  tripId,
  startDate,
  endDate,
  onClose,
}: {
  tripId: string
  startDate: string | null
  endDate: string | null
  onClose: () => void
}) {
  const { save, saving } = useTripUpdate(tripId)
  const [start, setStart] = useState(startDate?.slice(0, 10) ?? "")
  const [end, setEnd] = useState(endDate?.slice(0, 10) ?? "")
  return (
    <Modal title="Dates" subtitle="When are you going?" onClose={onClose}
      footer={
        <button
          disabled={saving || !start}
          onClick={() => save({ start_date: start || null, end_date: end || null }, onClose)}
          className="aurora-cta h-11 w-full disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-3 py-2">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-aurora-ink3">Start</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
            className="h-11 w-full rounded-xl border border-aurora-border bg-aurora-midnight2 px-3 text-[15px] text-aurora-ink outline-none focus:border-aurora-teal [color-scheme:dark]" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-aurora-ink3">End</span>
          <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)}
            className="h-11 w-full rounded-xl border border-aurora-border bg-aurora-midnight2 px-3 text-[15px] text-aurora-ink outline-none focus:border-aurora-teal [color-scheme:dark]" />
        </label>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- Who sheet

function WhoSheet({
  tripId,
  adults,
  childrenCount,
  infants,
  pets,
  onClose,
}: {
  tripId: string
  adults: number
  childrenCount: number
  infants: number
  pets: number
  onClose: () => void
}) {
  const { save, saving } = useTripUpdate(tripId)
  const [a, setA] = useState(adults)
  const [c, setC] = useState(childrenCount)
  const [i, setI] = useState(infants)
  const [p, setP] = useState(pets)
  const total = a + c + i
  return (
    <Modal title="Who" subtitle={total === 0 ? "Add travelers" : `${total} traveler${total === 1 ? "" : "s"}`} onClose={onClose}
      footer={
        <button
          disabled={saving}
          onClick={() =>
            save(
              { travelers_adults: a, travelers_children: c, travelers_infants: i, travelers_pets: p },
              onClose
            )
          }
          className="aurora-cta h-11 w-full disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      }
    >
      <Stepper label="Adults" sub="Ages 13+" value={a} set={setA} />
      <Divider />
      <Stepper label="Children" sub="Ages 2–12" value={c} set={setC} />
      <Divider />
      <Stepper label="Infants" sub="Under 2" value={i} set={setI} />
      <Divider />
      <Stepper label="Pets" sub="Service animals" value={p} set={setP} />
    </Modal>
  )
}

function Stepper({
  label,
  sub,
  value,
  set,
}: {
  label: string
  sub: string
  value: number
  set: (n: number) => void
}) {
  return (
    <div className="flex items-center py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-aurora-ink">{label}</p>
        <p className="text-[12px] text-aurora-ink3">{sub}</p>
      </div>
      <div className="flex items-center gap-4">
        <StepBtn sign="−" enabled={value > 0} onClick={() => value > 0 && set(value - 1)} />
        <span className="min-w-[16px] text-center text-[16px] font-semibold text-aurora-ink">{value}</span>
        <StepBtn sign="+" enabled onClick={() => set(value + 1)} />
      </div>
    </div>
  )
}

function StepBtn({ sign, enabled, onClick }: { sign: string; enabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!enabled}
      className={`flex h-8 w-8 items-center justify-center rounded-full border text-[16px] font-bold transition-colors ${
        enabled ? "border-aurora-teal/60 text-aurora-teal" : "border-aurora-border text-aurora-ink3"
      }`}
    >
      {sign}
    </button>
  )
}

// ---------------------------------------------------------------- Budget sheet

function BudgetSheet({
  tripId,
  level,
  onClose,
}: {
  tripId: string
  level: number | null
  onClose: () => void
}) {
  const { save, saving } = useTripUpdate(tripId)
  const [sel, setSel] = useState<number | null>(level)
  const opts = [
    { v: 0, sign: "", label: "Any budget" },
    { v: 1, sign: "$", label: "On a budget" },
    { v: 2, sign: "$$", label: "Sensibly priced" },
    { v: 3, sign: "$$$", label: "Upscale" },
    { v: 4, sign: "$$$$", label: "Luxury" },
  ]
  return (
    <Modal title="Budget" onClose={onClose}
      footer={
        <button disabled={saving} onClick={() => save({ budget_level: sel }, onClose)}
          className="aurora-cta h-11 w-full disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
      }
    >
      {opts.map((o, idx) => (
        <div key={o.v}>
          <button onClick={() => setSel(o.v)} className="flex w-full items-center gap-3 py-3.5 text-left">
            <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${sel === o.v ? "border-aurora-teal" : "border-aurora-ink3"}`}>
              {sel === o.v && <span className="h-2.5 w-2.5 rounded-full bg-aurora-teal" />}
            </span>
            {o.sign && <span className="text-[15px] font-bold text-aurora-teal">{o.sign}</span>}
            <span className="text-[15px] text-aurora-ink">{o.label}</span>
          </button>
          {idx < opts.length - 1 && <Divider />}
        </div>
      ))}
    </Modal>
  )
}

// ---------------------------------------------------------------- Where sheet

function WhereSheet({
  tripId,
  destinations,
  onClose,
}: {
  tripId: string
  destinations: WhereDest[]
  onClose: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState("")
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
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
  }, [query])

  async function remove(d: WhereDest) {
    if (!confirm(`Remove ${d.label}? This deletes its days, spots, and bookings.`)) return
    setBusy(d.id)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any
    await sb.from("steps").delete().eq("parent_step_id", d.id)
    await sb.from("steps").delete().eq("id", d.id)
    setBusy(null)
    router.refresh()
  }

  async function add(c: PlaceCandidate) {
    setBusy("add")
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any
    const country = countryFromAddress(c)
    const hasCoord = c.latitude != null && c.longitude != null && !(c.latitude === 0 && c.longitude === 0)
    // Seed after the last destination's date (fallback: today).
    await sb.from("steps").insert({
      trip_id: tripId,
      date: new Date().toISOString().slice(0, 10),
      location_name: c.name,
      step_type: "destination",
      latitude: hasCoord ? c.latitude : null,
      longitude: hasCoord ? c.longitude : null,
      country,
      city: c.name,
      nights: 1,
    })
    setBusy(null)
    setAdding(false)
    setQuery("")
    setCandidates([])
    router.refresh()
  }

  return (
    <Modal title="Where" subtitle={`${destinations.length} destination${destinations.length === 1 ? "" : "s"}`} onClose={onClose}
      footer={
        <button onClick={onClose} className="aurora-cta h-11 w-full">Done</button>
      }
    >
      <div className="space-y-2.5 py-1">
        {destinations.map((d) => (
          <div key={d.id} className="aurora-card-2 flex items-center gap-3 p-2.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-aurora-teal/25 to-aurora-midnight2 text-[18px]">
              📍
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-aurora-ink">{d.label}</p>
              {d.country && <p className="truncate text-[12.5px] text-aurora-ink2">{d.country}</p>}
            </div>
            <button
              onClick={() => remove(d)}
              disabled={busy === d.id}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-aurora-border bg-aurora-midnight2 text-aurora-ink3 disabled:opacity-40"
              aria-label={`Remove ${d.label}`}
            >
              ✕
            </button>
          </div>
        ))}

        {adding ? (
          <div className="pt-1">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a city or place…"
              className="h-11 w-full rounded-xl border border-aurora-border bg-aurora-midnight2 px-3 text-[15px] text-aurora-ink outline-none focus:border-aurora-teal"
            />
            <div className="mt-2 space-y-1">
              {searching && <p className="px-1 py-1.5 text-[13px] text-aurora-ink3">Searching…</p>}
              {!searching &&
                candidates.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => add(c)}
                    disabled={busy === "add"}
                    className="flex w-full items-center gap-3 rounded-xl bg-aurora-midnight2 p-2.5 text-left transition-colors hover:bg-aurora-glass2 disabled:opacity-50"
                  >
                    <span className="text-[15px]">📍</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold text-aurora-ink">{c.name}</span>
                      {c.address && <span className="block truncate text-[12px] text-aurora-ink3">{c.address}</span>}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-aurora-teal/45 bg-aurora-teal/10 py-3 text-[14px] font-semibold text-aurora-teal"
          >
            + Add location
          </button>
        )}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- helpers + icons

function Divider() {
  return <div className="h-px bg-aurora-border" />
}

function fmtRange(start: string | null, end: string | null): string {
  const f = (iso: string | null) => {
    if (!iso) return ""
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
  }
  return [f(start), f(end)].filter(Boolean).join(" – ")
}

function countryFromAddress(c: PlaceCandidate): string | null {
  const parts = (c.address ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  const last = parts[parts.length - 1]
  if (!last || /\d/.test(last)) return null
  return last === c.name ? null : last
}

function PinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  )
}
function CalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}
function WhoIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" />
    </svg>
  )
}
function DollarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  )
}
