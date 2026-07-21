"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { DestinationDay, TimelineItem } from "@/lib/drift/timeline"
import { formatDayLabel } from "@/lib/drift/dates"
import { staticMapUrl } from "@/lib/drift/staticMap"
import { applyRemoveStep } from "@/lib/drift/quickOp"

// The trip planning studio. Desktop: itinerary on the left, Ask Drift docked
// full-height on the right — the agent is the co-pilot pane, always visible.
// Clicking an itinerary item flips the right pane to an inspector (mini-map,
// details, Ask-Drift-about-this, Remove); closing hands the pane back to chat.
// Mobile keeps the stacked layout; the inspector becomes a bottom sheet.

export interface DestinationVM {
  id: string
  label: string
  country: string | null
  nights: number
  heroUrl: string | null
  days: DestinationDay[]
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
}

export interface KitItemVM {
  id: string
  title: string
  category: string
  phase: string
  state: string
  quantity: number
}

type Tab = "plan" | "kit" | "expenses" | "track"

export default function TripTabs({
  tripId,
  destinations,
  stepDetails,
  bookingDetails,
  expenses,
  kitItems,
  children,
}: {
  tripId: string
  destinations: DestinationVM[]
  stepDetails: Record<string, StepDetailVM>
  bookingDetails: Record<string, BookingDetailVM>
  expenses: ExpenseVM[]
  kitItems: KitItemVM[]
  children?: React.ReactNode // the Ask-Drift chat (single mounted instance)
}) {
  const [tab, setTab] = useState<Tab>("plan")
  const [selected, setSelected] = useState<TimelineItem | null>(null)

  const selStep = selected?.linkedStepId ? stepDetails[selected.linkedStepId] : null
  const selBooking =
    selected && !selected.linkedStepId ? bookingDetails[selected.id] : null

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

  return (
    <div>
      {/* Tab strip */}
      <div className="mt-5 flex gap-1.5 rounded-full bg-drift-alt-bg p-1 lg:max-w-md">
        {(
          [
            ["plan", "Plan"],
            ["kit", "Kit"],
            ["expenses", "Expenses"],
            ["track", "Track"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 rounded-full py-2 text-[13.5px] font-semibold transition-colors ${
              tab === key ? "bg-white text-drift-ink shadow-sm" : "text-drift-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "plan" && (
        <div className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-6">
          {/* Itinerary column */}
          <div className="space-y-8">
            {destinations.length === 0 && (
              <p className="text-drift-muted">
                No itinerary yet. Ask Drift to start planning.
              </p>
            )}
            {destinations.map((d) => (
              <DestinationSection
                key={d.id}
                destination={d}
                selectedId={selected?.id ?? null}
                onSelect={setSelected}
              />
            ))}
          </div>

          {/* Right pane: chat (default) / inspector (when an item is open) */}
          <div className="mt-8 lg:sticky lg:top-4 lg:mt-0 lg:h-[calc(100vh-7.5rem)]">
            {/* Desktop inspector takes the pane */}
            {inspector && <div className="hidden h-full lg:block">{inspector}</div>}
            <div className={`h-full ${inspector ? "lg:hidden" : ""}`}>{children}</div>
          </div>

          {/* Mobile inspector: bottom sheet */}
          {inspector && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div
                className="absolute inset-0 bg-black/40"
                onClick={() => setSelected(null)}
              />
              <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-[24px] bg-white p-1 shadow-2xl">
                {inspector}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "kit" && <KitTab items={kitItems} />}
      {tab === "expenses" && <ExpensesTab expenses={expenses} />}
      {tab === "track" && <TrackTab />}
    </div>
  )
}

// ---- Inspector: the item detail that borrows the agent's pane ----

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
      new CustomEvent("drift:ask-about", { detail: `Tell me about ${name} — and is it worth the time we've given it?` })
    )
    onClose()
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-drift-divider bg-white">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-drift-divider px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-drift-coral">
            {item.badge}
          </p>
          <p className="truncate font-drift-display text-[19px] font-semibold">
            {step?.title ?? booking?.title ?? item.title}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded-full p-1.5 text-drift-muted hover:bg-drift-alt-bg"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {map && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={map}
            alt=""
            className="h-[150px] w-full rounded-xl object-cover"
          />
        )}

        <dl className="mt-4 space-y-3">
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
                className="rounded-full bg-drift-coral px-3.5 py-2 text-[13px] font-semibold text-white"
              >
                Booking
              </a>
            )}
            {step?.websiteUrl && (
              <a
                href={step.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-drift-divider px-3.5 py-2 text-[13px] font-medium"
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

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-drift-divider p-3">
        <button
          onClick={askDrift}
          className="flex-1 rounded-full bg-drift-coral py-2.5 text-[13.5px] font-semibold text-white"
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
                className="rounded-full border border-drift-divider px-3 py-2.5 text-[13px]"
              >
                Keep
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingRemove(true)}
              className="rounded-full border border-drift-divider px-3.5 py-2.5 text-[13px] font-medium text-drift-muted hover:text-drift-coral-deep"
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
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-drift-text-tertiary">
        {label}
      </dt>
      <dd className="mt-0.5 text-[14px] leading-snug">{children}</dd>
    </div>
  )
}

function durationLabel(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}

// ---- Plan column: destination hero + day filmstrip + timeline ----

function DestinationSection({
  destination: d,
  selectedId,
  onSelect,
}: {
  destination: DestinationVM
  selectedId: string | null
  onSelect: (item: TimelineItem) => void
}) {
  const [selectedDay, setSelectedDay] = useState<number | "overview">("overview")
  const days =
    selectedDay === "overview" ? d.days : d.days.filter((x) => x.dayNumber === selectedDay)

  return (
    <section>
      <div className="relative h-40 overflow-hidden rounded-2xl">
        {d.heroUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.heroUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(135deg,#E0563B,rgb(140,82,0))" }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, transparent 35%, rgba(0,0,0,0.6))" }}
        />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="font-drift-display text-[22px] font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
            {d.label}
          </p>
          <p className="text-[12px] text-white/80 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
            {[d.country, `${d.nights} night${d.nights === 1 ? "" : "s"}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <FilmstripPill
          active={selectedDay === "overview"}
          onClick={() => setSelectedDay("overview")}
        >
          Overview
        </FilmstripPill>
        {d.days.map((day) => (
          <FilmstripPill
            key={day.dayNumber}
            active={selectedDay === day.dayNumber}
            onClick={() => setSelectedDay(day.dayNumber)}
          >
            Day {day.dayNumber}
          </FilmstripPill>
        ))}
      </div>

      <div className="mt-3 space-y-5">
        {days.map((day) => (
          <div key={day.dayNumber}>
            <div className="flex items-baseline gap-2">
              <span className="font-drift-display text-[16px] font-semibold">
                Day {day.dayNumber}
              </span>
              <span className="text-[12.5px] text-drift-text-tertiary">
                {formatDayLabel(day.date)}
              </span>
            </div>
            {day.items.length === 0 ? (
              <p className="mt-1.5 text-[13.5px] text-drift-text-tertiary">
                Nothing planned yet
              </p>
            ) : (
              <ul className="mt-2">
                {day.items.map((item, i) => (
                  <TimelineRow
                    key={item.id}
                    item={item}
                    isLast={i === day.items.length - 1}
                    isSelected={selectedId === item.id}
                    onClick={() => onSelect(item)}
                  />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function FilmstripPill({
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
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
        active
          ? "bg-drift-coral text-white"
          : "border border-drift-divider bg-white text-drift-muted"
      }`}
    >
      {children}
    </button>
  )
}

const TYPE_STYLE: Record<TimelineItem["type"], { bg: string; fg: string; icon: string }> = {
  stay: { bg: "#EEF0FE", fg: "#5B6CF0", icon: "M3 18v-6a2 2 0 012-2h14a2 2 0 012 2v6M3 18h18M6 10V7a2 2 0 012-2h8a2 2 0 012 2v3" },
  spot: { bg: "#FEEDE8", fg: "#E0563B", icon: "M7 3v7a2 2 0 002 2v9M11 3v5M7 3v5m8 2c0-4 1.5-7 3-7v18" },
  activity: { bg: "#E9F7EE", fg: "#3E9B5F", icon: "M13 5a2 2 0 100-4 2 2 0 000 4zM9 22l2-7-3-2 1-6 4-1 3 4 3 1M6 12l1-4" },
  transportInbound: { bg: "#F1F1F3", fg: "#6B6B72", icon: "M5 12h14m0 0l-5-5m5 5l-5 5" },
  transportOutbound: { bg: "#F1F1F3", fg: "#6B6B72", icon: "M5 12h14m0 0l-5-5m5 5l-5 5" },
}

function TimelineRow({
  item,
  isLast,
  isSelected,
  onClick,
}: {
  item: TimelineItem
  isLast: boolean
  isSelected: boolean
  onClick: () => void
}) {
  const s = TYPE_STYLE[item.type]
  const showSubtitle = item.subtitle && item.subtitle !== item.title
  return (
    <li className="flex gap-3">
      <div className="w-11 shrink-0 pt-2 text-right text-[11px] tabular-nums text-drift-text-tertiary">
        {item.startTimeMinutes != null ? minutesLabel(item.startTimeMinutes) : "—"}
      </div>
      <div className="flex flex-col items-center">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: s.bg }}
        >
          <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }} fill="none" stroke={s.fg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d={s.icon} />
          </svg>
        </div>
        {!isLast && <div className="w-px flex-1 bg-drift-divider" />}
      </div>
      <button
        onClick={onClick}
        className={`mb-3 min-w-0 flex-1 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
          isSelected
            ? "border-drift-coral bg-drift-coral-50/60"
            : "border-drift-divider bg-white hover:border-drift-coral/40"
        }`}
      >
        <p className="text-[10.5px] font-bold uppercase tracking-wide text-drift-coral">
          {item.badge}
        </p>
        <p className="truncate text-[15px] font-medium">{item.title}</p>
        {showSubtitle && (
          <p className="truncate text-[13px] text-drift-muted">{item.subtitle}</p>
        )}
      </button>
    </li>
  )
}

function minutesLabel(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const ampm = h < 12 ? "am" : "pm"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`
}

// ---- Kit (read view) ----

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
    <div className="mt-5 space-y-6 lg:max-w-2xl">
      {groups.map((g) => (
        <div key={g.state}>
          <h3 className="font-drift-display text-[17px] font-semibold">
            {KIT_STATE_LABEL[g.state] ?? g.state}{" "}
            <span className="text-[13px] font-normal text-drift-text-tertiary">
              {g.items.length}
            </span>
          </h3>
          <ul className="mt-2 space-y-1.5">
            {g.items.map((i) => (
              <li
                key={i.id}
                className="flex items-center gap-3 rounded-xl border border-drift-divider bg-white px-3.5 py-2.5"
              >
                <span
                  className={`h-4 w-4 rounded-full border-2 ${
                    i.state === "packed" || i.state === "bought"
                      ? "border-drift-coral bg-drift-coral"
                      : "border-drift-divider"
                  }`}
                />
                <span className="min-w-0 flex-1 truncate text-[14.5px]">{i.title}</span>
                {i.quantity > 1 && (
                  <span className="text-[12px] text-drift-muted">×{i.quantity}</span>
                )}
                <span className="rounded-full bg-drift-alt-bg px-2 py-0.5 text-[11px] text-drift-muted">
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

// ---- Expenses (read view) ----

const CATEGORY_EMOJI: Record<string, string> = {
  stays: "🏨",
  flights: "✈️",
  transport: "🚗",
  food: "🍽",
  activities: "🎟",
  shopping: "🛍",
  other: "💳",
}

function ExpensesTab({ expenses }: { expenses: ExpenseVM[] }) {
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
    <div className="mt-5 lg:max-w-2xl">
      <div className="rounded-2xl bg-drift-alt-bg p-4">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-drift-text-tertiary">
          Trip total
        </p>
        <p className="mt-1 font-drift-display text-[26px] font-bold">
          {[...totals.entries()].map(([cur, amt]) => formatMoney(amt, cur)).join(" + ")}
        </p>
      </div>
      <ul className="mt-4 space-y-1.5">
        {sorted.map((e) => (
          <li
            key={e.id}
            className="flex items-center gap-3 rounded-xl border border-drift-divider bg-white px-3.5 py-2.5"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-drift-alt-bg text-[16px]">
              {CATEGORY_EMOJI[e.category] ?? "💳"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] font-medium">{e.label}</p>
              <p className="truncate text-[12px] text-drift-muted">
                {[e.subtitle, shortExpenseDate(e.expense_date)].filter(Boolean).join(" · ")}
              </p>
            </div>
            <span className="text-[14.5px] font-semibold tabular-nums">
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

// ---- Track ----

function TrackTab() {
  return (
    <div className="mt-8 text-center">
      <p className="text-4xl opacity-40">📍</p>
      <p className="mt-3 font-drift-display text-[18px] font-semibold">
        Tracking happens on your phone
      </p>
      <p className="mx-auto mt-1 max-w-xs text-[13.5px] text-drift-muted">
        Record your route with the Drift iOS app — the trip&rsquo;s story and
        globe pins fill in here automatically.
      </p>
    </div>
  )
}
