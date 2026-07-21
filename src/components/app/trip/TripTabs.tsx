"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { DestinationDay, TimelineItem } from "@/lib/drift/timeline"
import { formatDayLabel } from "@/lib/drift/dates"
import { staticMapUrl } from "@/lib/drift/staticMap"
import { applyRemoveStep } from "@/lib/drift/quickOp"
import DestinationGuide from "./DestinationGuide"
import FindBookings from "./FindBookings"
import BackLink from "@/components/app/BackLink"

// The trip workspace, aligned with iOS:
//  Plan (trip level)  = trip hero + "Your stops" destination cards
//  Plan (drill-in)    = destination hero + Overview·Guide / Day-N pills
//  Overview           = the GUIDE (top things, tours & tickets) — not days
//  Track              = recorded (flat) steps, read-only
// Ask Drift stays docked right on desktop; the inspector borrows its pane.

export interface DestinationVM {
  id: string
  label: string
  country: string | null
  nights: number
  heroUrl: string | null
  dateRange: string
  plansCount: number
  bookedChip: string | null
  lat: number | null
  lng: number | null
  days: DestinationDay[]
}

export interface TripMetaVM {
  title: string
  flag: string | null
  dateRange: string
  statusLine: string
  cover: string | null
}

export interface TrackStepVM {
  id: string
  title: string
  subtitle: string | null
  dateLabel: string
}

export interface StepDetailVM {
  id: string
  title: string
  badge: string
  dateLabel: string | null
  timeLabel: string | null
  durationMinutes: number | null
  notes: string | null
  address: string | null
  lat: number | null
  lng: number | null
  bookingUrl: string | null
  websiteUrl: string | null
  importProvider: string | null
  confirmationNumber: string | null
  guestCount: number | null
}

export interface BookingDetailVM {
  id: string
  title: string
  modeLabel: string
  route: string | null
  departLabel: string | null
  arriveLabel: string | null
  confirmation: string | null
  seat: string | null
  provider: string | null
  bookingUrl: string | null
}

export interface ExpenseVM {
  id: string
  label: string
  subtitle: string | null
  amount: number
  currency: string
  category: string
  expense_date: string
  payer?: string | null
}

export interface LedgerVM {
  rows: Array<{ label: string; mine: boolean; netMinor: number }>
  transfers: Array<{ from: string; to: string; amountMinor: number }>
}

type Tab = "plan" | "kit" | "expenses" | "track"
const TABS: [Tab, string][] = [
  ["plan", "Plan"],
  ["kit", "Kit"],
  ["expenses", "Expenses"],
  ["track", "Track"],
]

export interface KitItemVM {
  id: string
  title: string
  category: string
  phase: string
  state: string
  quantity: number
}

export default function TripTabs({
  tripId,
  tripMeta,
  destinations,
  stepDetails,
  bookingDetails,
  expenses,
  kitItems,
  trackSteps = [],
  ledger = null,
  children,
}: {
  tripId: string
  tripMeta: TripMetaVM
  destinations: DestinationVM[]
  stepDetails: Record<string, StepDetailVM>
  bookingDetails: Record<string, BookingDetailVM>
  expenses: ExpenseVM[]
  kitItems: KitItemVM[]
  trackSteps?: TrackStepVM[]
  ledger?: LedgerVM | null
  children?: React.ReactNode
}) {
  const [tab, setTab] = useState<Tab>("plan")
  const [selectedDestId, setSelectedDestId] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<number | "overview">("overview")
  const [selected, setSelected] = useState<TimelineItem | null>(null)

  const dest = destinations.find((d) => d.id === selectedDestId) ?? null
  const inDest = tab === "plan" && dest != null

  const selStep = selected?.linkedStepId ? stepDetails[selected.linkedStepId] : null
  const selBooking = selected && !selected.linkedStepId ? bookingDetails[selected.id] : null
  const inspector =
    selected && (selStep || selBooking) ? (
      <Inspector
        tripId={tripId}
        item={selected}
        step={selStep ?? null}
        booking={selBooking ?? null}
        onClose={() => setSelected(null)}
      />
    ) : null

  const segmented = (glass: boolean) => (
    <div
      className={`hidden gap-0.5 rounded-full p-1 md:flex ${
        glass ? "border border-white/25 bg-white/15 backdrop-blur-xl" : "bg-white/90 shadow-sm"
      }`}
    >
      {TABS.map(([key, label]) => (
        <button
          key={key}
          onClick={() => setTab(key)}
          className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
            tab === key
              ? glass
                ? "bg-white text-drift-ink"
                : "bg-drift-coral text-white"
              : glass
                ? "text-white/85"
                : "text-drift-muted"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )

  const openDest = (id: string) => {
    setSelectedDestId(id)
    setSelectedDay("overview")
    setSelected(null)
  }

  return (
    <div>
      {/* ---------- Hero: destination (drill-in) or trip ---------- */}
      {inDest && dest ? (
        <div className="relative mt-3 h-[240px] overflow-hidden rounded-[26px] shadow-[0_24px_60px_-24px_rgba(31,31,36,0.35)] md:h-[300px] lg:mt-0">
          {dest.heroUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dest.heroUrl} alt="" fetchPriority="high" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#E0563B,rgb(140,82,0))" }} />
          )}
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(to top, rgba(12,10,9,.72) 0%, rgba(12,10,9,.18) 45%, rgba(12,10,9,.12) 100%)" }}
          />
          <div className="absolute inset-0 flex flex-col justify-between p-5 md:p-7">
            <div className="flex items-start justify-between gap-3">
              <button
                onClick={() => setSelectedDestId(null)}
                className="rounded-full border border-white/25 bg-white/15 px-3.5 py-1.5 text-[13px] font-semibold text-white backdrop-blur-xl"
              >
                ← Your stops
              </button>
              {segmented(true)}
            </div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/75">
                  {tripMeta.title} {tripMeta.flag ?? ""} · {dest.dateRange}
                </p>
                <h1 className="mt-0.5 font-drift-display text-[36px] font-semibold leading-[1.02] tracking-tight text-white [text-shadow:0_2px_18px_rgba(0,0,0,0.35)] md:text-[50px]">
                  {dest.label}
                </h1>
                <p className="mt-1 text-[14px] text-white/90">
                  {[dest.country, `${dest.nights} night${dest.nights === 1 ? "" : "s"}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <GlassPill active={selectedDay === "overview"} onClick={() => setSelectedDay("overview")}>
                  Overview <span className="ml-1 text-[10.5px] font-medium opacity-75">Guide</span>
                </GlassPill>
                {dest.days.map((d) => (
                  <GlassPill
                    key={d.dayNumber}
                    active={selectedDay === d.dayNumber}
                    onClick={() => setSelectedDay(d.dayNumber)}
                  >
                    Day {d.dayNumber}
                    <span className="ml-1 text-[10.5px] font-medium opacity-75">
                      {shortDay(d.date)}
                    </span>
                  </GlassPill>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative mt-3 h-[240px] overflow-hidden rounded-[26px] shadow-[0_24px_60px_-24px_rgba(31,31,36,0.35)] md:h-[300px] lg:mt-0">
          {tripMeta.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tripMeta.cover} alt="" fetchPriority="high" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#E0563B,rgb(140,82,0))" }} />
          )}
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(to top, rgba(12,10,9,.72) 0%, rgba(12,10,9,.18) 45%, rgba(12,10,9,.12) 100%)" }}
          />
          <div className="absolute inset-0 flex flex-col justify-between p-5 md:p-7">
            <div className="flex items-start justify-between gap-3">
              <BackLink href="/app" label="Home" />
              {segmented(true)}
            </div>
            <div>
              <h1 className="font-drift-display text-[40px] font-semibold leading-[1.02] tracking-tight text-white [text-shadow:0_2px_18px_rgba(0,0,0,0.35)] md:text-[54px]">
                {tripMeta.title} {tripMeta.flag ?? ""}
              </h1>
              <p className="mt-1.5 text-[15px] text-white/90">{tripMeta.dateRange}</p>
              {tripMeta.statusLine && (
                <p className="mt-0.5 text-[13.5px] text-white/75">{tripMeta.statusLine}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile tab strip */}
      <div className="mt-4 flex gap-1.5 rounded-full bg-white p-1 shadow-sm md:hidden">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 rounded-full py-2 text-[13px] font-semibold ${
              tab === key ? "bg-drift-coral text-white" : "text-drift-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ---------- Plan ---------- */}
      {tab === "plan" && (
        <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_430px] lg:items-start lg:gap-7">
          <div>
            {!inDest ? (
              /* -------- Your stops (trip level) -------- */
              <div>
                <div className="flex items-baseline gap-2.5">
                  <h2 className="font-drift-display text-[26px] font-semibold tracking-tight">
                    Your stops
                  </h2>
                  <span className="text-[17px] font-semibold text-drift-text-tertiary">
                    {destinations.length}
                  </span>
                  <span className="ml-auto">
                    <FindBookings tripId={tripId} />
                  </span>
                </div>
                {destinations.length === 0 && (
                  <p className="mt-3 text-drift-muted">
                    No itinerary yet. Ask Drift to start planning.
                  </p>
                )}
                <ul className="mt-3.5 space-y-3">
                  {destinations.map((d) => (
                    <li key={d.id}>
                      <button
                        onClick={() => openDest(d.id)}
                        className="flex w-full items-center gap-4 rounded-[20px] border border-[#EBE7E1] bg-white p-3.5 text-left shadow-[0_1px_2px_rgba(31,31,36,0.04)] transition-all duration-150 hover:-translate-y-0.5 hover:border-drift-coral/35 hover:shadow-[0_14px_34px_-18px_rgba(31,31,36,0.28)]"
                      >
                        {d.heroUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={d.heroUrl}
                            alt=""
                            loading="lazy"
                            className="h-[72px] w-[72px] shrink-0 rounded-2xl object-cover"
                          />
                        ) : (
                          <div
                            className="h-[72px] w-[72px] shrink-0 rounded-2xl"
                            style={{ background: "linear-gradient(135deg,#E0563B,rgb(140,82,0))" }}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-drift-display text-[19px] font-semibold tracking-tight">
                            {d.label}
                          </p>
                          <p className="mt-0.5 text-[13.5px] text-drift-muted">{d.dateRange}</p>
                          <p className="mt-1 text-[12.5px] text-drift-text-tertiary">
                            {d.plansCount} plan{d.plansCount === 1 ? "" : "s"}
                          </p>
                        </div>
                        {d.bookedChip && (
                          <span className="shrink-0 rounded-full bg-[#E7F4F1] px-3 py-1.5 text-[12px] font-semibold text-[#2E7D6F]">
                            ● {d.bookedChip}
                          </span>
                        )}
                        <span className="shrink-0 text-[18px] text-[#C9C4BC]">›</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : selectedDay === "overview" && dest ? (
              /* -------- Overview = the Guide -------- */
              <DestinationGuide
                label={dest.label}
                country={dest.country}
                lat={dest.lat}
                lng={dest.lng}
              />
            ) : (
              /* -------- One day's timeline -------- */
              dest &&
              dest.days
                .filter((d) => d.dayNumber === selectedDay)
                .map((day) => (
                  <DaySection
                    key={day.dayNumber}
                    day={day}
                    selectedId={selected?.id ?? null}
                    bookingDetails={bookingDetails}
                    stepDetails={stepDetails}
                    onSelect={setSelected}
                  />
                ))
            )}
          </div>

          <div className="mt-8 lg:sticky lg:top-[76px] lg:mt-0 lg:h-[calc(100vh-108px)]">
            {inspector && <div className="hidden h-full lg:block">{inspector}</div>}
            <div className={`h-full ${inspector ? "lg:hidden" : ""}`}>{children}</div>
          </div>

          {inspector && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div className="absolute inset-0 bg-black/40" onClick={() => setSelected(null)} />
              <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-[24px] bg-white p-1 shadow-2xl">
                {inspector}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "kit" && <KitTab items={kitItems} />}
      {tab === "expenses" && <ExpensesTab expenses={expenses} ledger={ledger} />}
      {tab === "track" && <TrackTab steps={trackSteps} />}
    </div>
  )
}

function shortDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  if (!y) return ""
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

function GlassPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-4 py-2 text-[13.5px] font-semibold transition-colors ${
        active
          ? "bg-drift-coral text-white shadow-[0_6px_18px_-6px_rgba(224,86,59,0.65)]"
          : "border border-white/25 bg-white/15 text-white backdrop-blur-xl"
      }`}
    >
      {children}
    </button>
  )
}

// ---------- Day timeline ----------

function DaySection({
  day,
  selectedId,
  stepDetails,
  bookingDetails,
  onSelect,
}: {
  day: DestinationDay
  selectedId: string | null
  stepDetails: Record<string, StepDetailVM>
  bookingDetails: Record<string, BookingDetailVM>
  onSelect: (item: TimelineItem) => void
}) {
  const last = [...day.items].reverse().find((i) => i.startTimeMinutes != null)
  const summary = day.items.length
    ? `${day.items.length} stop${day.items.length === 1 ? "" : "s"}${
        last?.startTimeMinutes != null
          ? ` · ends ${minutesLabel(last.startTimeMinutes).join(" ")}`
          : ""
      }`
    : null

  return (
    <div className="mb-4">
      <div className="mb-3.5 flex items-baseline gap-3">
        <span className="font-drift-display text-[26px] font-semibold tracking-tight">
          Day {day.dayNumber}
        </span>
        <span className="text-[14px] font-medium text-drift-text-tertiary">
          {formatDayLabel(day.date)}
        </span>
        {summary && (
          <span className="ml-auto text-[12.5px] text-drift-text-tertiary">{summary}</span>
        )}
      </div>

      {day.items.length === 0 ? (
        <p className="text-[14px] text-drift-text-tertiary">
          Nothing planned yet — ask Drift for ideas.
        </p>
      ) : (
        <ul>
          {day.items.map((item, i) => (
            <TimelineRow
              key={item.id}
              item={item}
              isLast={i === day.items.length - 1}
              isSelected={selectedId === item.id}
              chip={chipFor(item, stepDetails, bookingDetails)}
              onClick={() => onSelect(item)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function chipFor(
  item: TimelineItem,
  steps: Record<string, StepDetailVM>,
  bookings: Record<string, BookingDetailVM>
): string | null {
  if (!item.linkedStepId) {
    const b = bookings[item.id]
    return b?.confirmation ? `Conf ${b.confirmation}` : null
  }
  const s = steps[item.linkedStepId]
  if (s?.durationMinutes) return durationLabel(s.durationMinutes)
  return null
}

const DOT_BG: Record<TimelineItem["type"], string> = {
  stay: "#EEF0FE",
  spot: "#FEEDE8",
  activity: "#E9F7EE",
  transportInbound: "#F1F1F3",
  transportOutbound: "#F1F1F3",
}

function dotEmoji(item: TimelineItem): string {
  const b = item.badge.toUpperCase()
  if (item.type === "stay") return "🛏️"
  if (item.type === "transportInbound" || item.type === "transportOutbound") {
    if (b.includes("FLIGHT")) return "✈️"
    if (b.includes("TRAIN")) return "🚆"
    if (b.includes("BUS")) return "🚌"
    if (b.includes("FERRY")) return "⛴️"
    if (b.includes("DRIVE")) return "🚗"
    return "➡️"
  }
  if (b.includes("DINNER") || b.includes("RESTAURANT")) return "🍽️"
  if (b.includes("CAFÉ") || b.includes("CAFE") || b.includes("BAKERY")) return "☕"
  if (b.includes("BAR")) return "🍸"
  if (b.includes("CHURCH")) return "⛪"
  if (b.includes("MUSEUM")) return "🖼️"
  if (b.includes("PARK") || b.includes("GARDEN")) return "🌳"
  if (b.includes("BEACH")) return "🏖️"
  if (b.includes("VIEWPOINT")) return "🌄"
  if (b.includes("SHOPPING")) return "🛍️"
  if (b.includes("LANDMARK") || b.includes("CASTLE")) return "🏛️"
  if (item.type === "activity") return "🥾"
  return "📍"
}

function TimelineRow({
  item,
  isLast,
  isSelected,
  chip,
  onClick,
}: {
  item: TimelineItem
  isLast: boolean
  isSelected: boolean
  chip: string | null
  onClick: () => void
}) {
  const showSubtitle = item.subtitle && item.subtitle !== item.title
  const time = item.startTimeMinutes != null ? minutesLabel(item.startTimeMinutes) : null

  return (
    <li className="flex gap-4">
      <div className="w-[52px] shrink-0 pt-[19px] text-right text-[13px] font-semibold tabular-nums text-drift-muted">
        {time ? (
          <>
            {time[0]}
            <br />
            <span className="font-medium text-drift-text-tertiary">{time[1]}</span>
          </>
        ) : (
          <span className="text-drift-text-tertiary">—</span>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-center">
        <div
          className="mt-2 flex h-11 w-11 items-center justify-center rounded-full text-[19px] shadow-[inset_0_0_0_1px_rgba(31,31,36,0.05)]"
          style={{ background: DOT_BG[item.type] }}
        >
          {dotEmoji(item)}
        </div>
        {!isLast && <div className="w-[2px] flex-1 bg-drift-divider" />}
      </div>

      <button
        onClick={onClick}
        className={`mb-3.5 flex min-w-0 flex-1 items-center gap-4 rounded-[18px] border bg-white px-5 py-4 text-left transition-all duration-150 ${
          isSelected
            ? "border-drift-coral shadow-[0_14px_34px_-18px_rgba(224,86,59,0.4)]"
            : "border-[#EBE7E1] shadow-[0_1px_2px_rgba(31,31,36,0.04)] hover:-translate-y-0.5 hover:border-drift-coral/35 hover:shadow-[0_14px_34px_-18px_rgba(31,31,36,0.28)]"
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-bold tracking-[0.12em] text-drift-coral">
            {item.badge}
          </p>
          <p className="mt-0.5 truncate text-[17px] font-semibold tracking-tight">
            {item.title}
          </p>
          {showSubtitle && (
            <p className="mt-0.5 truncate text-[14px] text-drift-muted">{item.subtitle}</p>
          )}
        </div>
        {chip && (
          <span className="shrink-0 rounded-full border border-[#EBE7E1] bg-[#FAF8F5] px-3 py-1.5 text-[12px] font-semibold text-drift-muted">
            {chip}
          </span>
        )}
        <span className="shrink-0 text-[18px] text-[#C9C4BC]">›</span>
      </button>
    </li>
  )
}

function minutesLabel(mins: number): [string, string] {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const ampm = h < 12 ? "am" : "pm"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return [m === 0 ? `${h12}:00` : `${h12}:${String(m).padStart(2, "0")}`, ampm]
}

function durationLabel(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h} h`
  return `${m} min`
}

// ---------- Inspector ----------

function Inspector({
  tripId,
  item,
  step,
  booking,
  onClose,
}: {
  tripId: string
  item: TimelineItem
  step: StepDetailVM | null
  booking: BookingDetailVM | null
  onClose: () => void
}) {
  const router = useRouter()
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lat = step?.lat ?? item.latitude
  const lng = step?.lng ?? item.longitude
  const map = lat != null && lng != null ? staticMapUrl(lat, lng) : null

  async function remove() {
    if (!step) return
    setRemoving(true)
    setError(null)
    try {
      await applyRemoveStep(tripId, step.id)
      onClose()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove that.")
      setRemoving(false)
    }
  }

  function askDrift() {
    const name = step?.title ?? booking?.title ?? item.title
    window.dispatchEvent(
      new CustomEvent("drift:ask-about", {
        detail: `Tell me about ${name} — and is it worth the time we've given it?`,
      })
    )
    onClose()
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[22px] border border-[#EBE7E1] bg-white shadow-[0_24px_60px_-30px_rgba(31,31,36,0.25)]">
      <div className="flex items-start justify-between gap-3 border-b border-[#EBE7E1] px-5 py-4">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold tracking-[0.12em] text-drift-coral">
            {item.badge}
          </p>
          <p className="truncate font-drift-display text-[20px] font-semibold tracking-tight">
            {step?.title ?? booking?.title ?? item.title}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded-full p-1.5 text-drift-muted hover:bg-[#FAF8F5]"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {map && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={map} alt="" loading="lazy" decoding="async" className="h-[150px] w-full rounded-2xl object-cover" />
        )}

        <dl className="mt-4 space-y-3.5">
          {step?.dateLabel && (
            <Field label="When">
              {step.dateLabel}
              {step.timeLabel ? ` · ${step.timeLabel}` : ""}
              {step.durationMinutes ? ` · ${durationLabel(step.durationMinutes)}` : ""}
            </Field>
          )}
          {booking?.route && <Field label="Route">{booking.route}</Field>}
          {booking?.departLabel && <Field label="Departs">{booking.departLabel}</Field>}
          {booking?.arriveLabel && <Field label="Arrives">{booking.arriveLabel}</Field>}
          {(step?.address || (item.subtitle && item.subtitle !== item.title)) && (
            <Field label="Where">{step?.address ?? item.subtitle}</Field>
          )}
          {step?.notes && <Field label="Notes">{step.notes}</Field>}
          {(step?.importProvider || booking?.provider) && (
            <Field label="Source">
              Imported from {step?.importProvider ?? booking?.provider}
              {(step?.confirmationNumber ?? booking?.confirmation) &&
                ` · Conf ${step?.confirmationNumber ?? booking?.confirmation}`}
            </Field>
          )}
          {booking?.seat && <Field label="Seat">{booking.seat}</Field>}
          {step?.guestCount != null && step.guestCount > 0 && (
            <Field label="Guests">{step.guestCount}</Field>
          )}
        </dl>

        {(step?.bookingUrl || step?.websiteUrl || booking?.bookingUrl) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {(step?.bookingUrl ?? booking?.bookingUrl) && (
              <a
                href={(step?.bookingUrl ?? booking?.bookingUrl)!}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-drift-coral px-4 py-2 text-[13px] font-semibold text-white"
              >
                Booking
              </a>
            )}
            {step?.websiteUrl && (
              <a
                href={step.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-[#EBE7E1] px-4 py-2 text-[13px] font-medium"
              >
                Website
              </a>
            )}
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-lg bg-drift-coral-50 px-3 py-2 text-[13px] text-drift-coral-deep">
            {error}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-[#EBE7E1] p-3.5">
        <button
          onClick={askDrift}
          className="flex-1 rounded-full bg-drift-coral py-2.5 text-[13.5px] font-semibold text-white shadow-[0_8px_18px_-8px_rgba(224,86,59,0.65)]"
        >
          ✦ Ask Drift about this
        </button>
        {step &&
          (confirmingRemove ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={remove}
                disabled={removing}
                className="rounded-full bg-drift-coral-deep px-3 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
              >
                {removing ? "…" : "Remove"}
              </button>
              <button
                onClick={() => setConfirmingRemove(false)}
                className="rounded-full border border-[#EBE7E1] px-3 py-2.5 text-[13px]"
              >
                Keep
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingRemove(true)}
              className="rounded-full border border-[#EBE7E1] px-4 py-2.5 text-[13px] font-medium text-drift-muted hover:text-drift-coral-deep"
            >
              Remove
            </button>
          ))}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-drift-text-tertiary">
        {label}
      </dt>
      <dd className="mt-1 text-[14.5px] leading-snug">{children}</dd>
    </div>
  )
}

// ---------- Kit ----------

const KIT_STATE_ORDER = ["suggested", "in_kit", "bought", "packed"]
const KIT_STATE_LABEL: Record<string, string> = {
  suggested: "Suggested",
  in_kit: "In kit",
  bought: "Bought",
  packed: "Packed",
}

function KitTab({ items }: { items: KitItemVM[] }) {
  const groups = KIT_STATE_ORDER.map((state) => ({
    state,
    items: items.filter((i) => i.state === state),
  })).filter((g) => g.items.length)

  if (!groups.length) {
    return (
      <p className="mt-6 text-drift-muted">
        No packing kit yet — ask Drift to suggest one for this trip.
      </p>
    )
  }

  return (
    <div className="mt-6 space-y-6 lg:max-w-2xl">
      {groups.map((g) => (
        <div key={g.state}>
          <h3 className="font-drift-display text-[19px] font-semibold">
            {KIT_STATE_LABEL[g.state] ?? g.state}{" "}
            <span className="text-[13px] font-normal text-drift-text-tertiary">
              {g.items.length}
            </span>
          </h3>
          <ul className="mt-2 space-y-1.5">
            {g.items.map((i) => (
              <li
                key={i.id}
                className="flex items-center gap-3 rounded-2xl border border-[#EBE7E1] bg-white px-4 py-3"
              >
                <span
                  className={`h-4 w-4 rounded-full border-2 ${
                    i.state === "packed" || i.state === "bought"
                      ? "border-drift-coral bg-drift-coral"
                      : "border-drift-divider"
                  }`}
                />
                <span className="min-w-0 flex-1 truncate text-[15px]">{i.title}</span>
                {i.quantity > 1 && (
                  <span className="text-[12px] text-drift-muted">×{i.quantity}</span>
                )}
                <span className="rounded-full bg-[#FAF8F5] px-2.5 py-0.5 text-[11.5px] text-drift-muted">
                  {i.category}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

// ---------- Expenses ----------

const CATEGORY_EMOJI: Record<string, string> = {
  stays: "🏨",
  flights: "✈️",
  transport: "🚗",
  food: "🍽",
  activities: "🎟",
  shopping: "🛍",
  other: "💳",
}

function ExpensesTab({
  expenses,
  ledger,
}: {
  expenses: ExpenseVM[]
  ledger: LedgerVM | null
}) {
  if (!expenses.length) {
    return (
      <p className="mt-6 text-drift-muted">
        No expenses yet — add one from chat (&ldquo;dinner 6400 ISK&rdquo;).
      </p>
    )
  }

  const totals = new Map<string, number>()
  for (const e of expenses) totals.set(e.currency, (totals.get(e.currency) ?? 0) + e.amount)
  const sorted = [...expenses].sort((a, b) => b.expense_date.localeCompare(a.expense_date))

  return (
    <div className="mt-6 lg:max-w-2xl">
      <div className="rounded-[22px] border border-[#EBE7E1] bg-white p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-drift-text-tertiary">
          Trip total
        </p>
        <p className="mt-1 font-drift-display text-[30px] font-semibold tracking-tight">
          {[...totals.entries()].map(([cur, amt]) => formatMoney(amt, cur)).join(" + ")}
        </p>
      </div>

      {ledger && (
        <div className="mt-4 rounded-[22px] border border-[#EBE7E1] bg-white p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-drift-text-tertiary">
            Balances
          </p>
          <ul className="mt-2.5 space-y-2">
            {ledger.rows.map((r) => (
              <li key={r.label} className="flex items-baseline justify-between">
                <span className={`text-[15px] ${r.mine ? "font-semibold" : ""}`}>{r.label}</span>
                <span
                  className={`text-[15px] font-semibold tabular-nums ${
                    r.netMinor > 0
                      ? "text-[#3E9B5F]"
                      : r.netMinor < 0
                        ? "text-drift-coral-deep"
                        : "text-drift-text-tertiary"
                  }`}
                >
                  {r.netMinor === 0
                    ? "settled"
                    : `${r.netMinor > 0 ? "gets back" : "owes"} ${usd(Math.abs(r.netMinor))}`}
                </span>
              </li>
            ))}
          </ul>

          {ledger.transfers.length > 0 && (
            <>
              <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.1em] text-drift-text-tertiary">
                Settle up
              </p>
              <ul className="mt-2.5 space-y-2">
                {ledger.transfers.map((t, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between rounded-xl bg-[#FAF8F5] px-3.5 py-2.5"
                  >
                    <span className="text-[14.5px]">
                      <span className="font-semibold">{t.from}</span> pays{" "}
                      <span className="font-semibold">{t.to}</span>
                    </span>
                    <span className="text-[15px] font-bold tabular-nums">
                      {usd(t.amountMinor)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11.5px] leading-snug text-drift-text-tertiary">
                Drift never moves money — settle over Venmo, Cash App or cash, then
                record it in the iOS app.
              </p>
            </>
          )}
        </div>
      )}

      <ul className="mt-4 space-y-1.5">
        {sorted.map((e) => (
          <li
            key={e.id}
            className="flex items-center gap-3.5 rounded-2xl border border-[#EBE7E1] bg-white px-4 py-3"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FAF8F5] text-[17px]">
              {CATEGORY_EMOJI[e.category] ?? "💳"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">{e.label}</p>
              <p className="truncate text-[12.5px] text-drift-muted">
                {[
                  e.payer ? `${e.payer} paid` : null,
                  e.subtitle,
                  shortExpenseDate(e.expense_date),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <span className="text-[15px] font-semibold tabular-nums">
              {formatMoney(e.amount, e.currency)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function shortExpenseDate(iso: string): string {
  const d = iso.slice(0, 10)
  const [y, mo, day] = d.split("-").map(Number)
  if (!y || !mo || !day) return d
  return new Date(Date.UTC(y, mo - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

function usd(minor: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100)
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

// ---------- Track: the recorded journey ----------

function TrackTab({ steps }: { steps: TrackStepVM[] }) {
  if (!steps.length) {
    return (
      <div className="mt-10 text-center">
        <p className="text-4xl opacity-40">📍</p>
        <p className="mt-3 font-drift-display text-[19px] font-semibold">
          Tracking happens on your phone
        </p>
        <p className="mx-auto mt-1 max-w-xs text-[14px] text-drift-muted">
          Record your route with the Drift iOS app — the trip&rsquo;s recorded
          moments show up here.
        </p>
      </div>
    )
  }

  // Group recorded steps by day.
  const byDay = new Map<string, TrackStepVM[]>()
  for (const s of steps) {
    const arr = byDay.get(s.dateLabel) ?? []
    arr.push(s)
    byDay.set(s.dateLabel, arr)
  }

  return (
    <div className="mt-6 lg:max-w-2xl">
      <p className="text-[13.5px] text-drift-muted">
        Recorded with the Drift tracker on your phone.
      </p>
      <div className="mt-4 space-y-6">
        {[...byDay.entries()].map(([dateLabel, items]) => (
          <div key={dateLabel}>
            <h3 className="font-drift-display text-[17px] font-semibold">{dateLabel}</h3>
            <ul className="mt-2 space-y-1.5">
              {items.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 rounded-2xl border border-[#EBE7E1] bg-white px-4 py-3"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FEEDE8] text-[15px]">
                    📍
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium">{s.title}</p>
                    {s.subtitle && s.subtitle !== s.title && (
                      <p className="truncate text-[12.5px] text-drift-muted">{s.subtitle}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
