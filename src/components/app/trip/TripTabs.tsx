"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { resolvePlace, placePhotoUrl } from "@/lib/drift/chat"
import type { DestinationDay, TimelineItem } from "@/lib/drift/timeline"
import type {
  BookingDetailVM,
  DestinationVM,
  ExpenseVM,
  KitItemVM,
  LedgerVM,
  StepDetailVM,
  TrackReadinessVM,
  TrackStepVM,
  TripMetaVM,
} from "@/lib/drift/tripViewModels"
import { formatDayLabel } from "@/lib/drift/dates"
import { staticMapUrl } from "@/lib/drift/staticMap"
import CoverCredit from "@/components/app/CoverCredit"
import { applyRemoveStep, applyRemoveTransport, isConfirmedBookingRefusal } from "@/lib/drift/quickOp"
import { createClient } from "@/lib/supabase/client"
const TrackMap = dynamic(() => import("./TrackMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-aurora-glass2" />,
})

import FindBookings from "./FindBookings"
import ScanStatus from "./ScanStatus"
import CompleteYourTrip, { type StayGap } from "./CompleteYourTrip"
import TripCoverChips from "./TripCoverChips"
import TripWeather from "./TripWeather"
import DayAddStop from "./DayAddStop"
import type { TripMapPoint } from "./TripMap"
import MediaSection from "./MediaSection"
import ExportItinerary from "./ExportItinerary"
import MomentViewer from "./MomentViewer"
import BackLink from "@/components/app/BackLink"
import OptimizedImg from "@/components/app/OptimizedImg"
import Link from "next/link"
import TripBuddiesPanel, { type TripBuddy } from "./TripBuddiesPanel"
import TripNotesPanel from "./TripNotesPanel"
import { countTripNotes, splitNoteURL, isMapsURL, type TripNote, type TripNoteGroup } from "@/lib/drift/tripNotes"

// Mapbox GL is ~heavy; keep it OUT of the trip page's first-load bundle. Lazy-
// load the map (client-only) so it downloads only when a map actually renders —
// the same pattern Discover/Home already use to stay small.
const TripMap = dynamic(() => import("./TripMap"), { ssr: false })
const TripMapView = dynamic(() => import("./TripMapView"), { ssr: false })
// The destination Guide (top sights/tours) renders only when a destination's
// Overview is opened — not on the trip page's first paint. Split it out so its
// ~400 lines download on demand instead of bloating the trip First Load.
const DestinationGuide = dynamic(() => import("./DestinationGuide"))

// The trip workspace, aligned with iOS:
//  Plan (trip level)  = trip hero + "Your stops" destination cards
//  Plan (drill-in)    = destination hero + Overview·Guide / Day-N pills
//  Overview           = the GUIDE (top things, tours & tickets) — not days
//  Track              = recorded (flat) steps, read-only
// Ask Drift stays docked right on desktop; the inspector borrows its pane.

// TripMapView still imports these two from here; re-exported so moving the
// contract out of this client file stays invisible to it.
export type { DestinationVM, StepDetailVM }

type Tab = "plan" | "kit" | "expenses" | "track"
const TABS: [Tab, string][] = [
  ["plan", "Plan"],
  ["kit", "Kit"],
  ["expenses", "Expenses"],
  ["track", "Track"],
]

export default function TripTabs({
  tripId,
  meId,
  members,
  tripBuddies = [],
  tripNotes = [],
  noteStops = [],
  isOwner,
  tripMeta,
  destinations,
  stepDetails,
  bookingDetails,
  expenses,
  kitItems,
  trackSteps = [],
  trackReadiness,
  ledger = null,
  stayGaps = [],
  budget = null,
  chipData,
  children,
}: {
  tripId: string
  meId: string
  members: { id: string; name: string }[]
  tripBuddies?: TripBuddy[]
  tripNotes?: TripNoteGroup[]
  /** Every stop, so a note can be written on a trip with none yet. */
  noteStops?: { id: string; label: string; startDate: string | null }[]
  isOwner: boolean
  tripMeta: TripMetaVM
  chipData?: {
    placeName: string
    startDate: string | null
    endDate: string | null
    adults: number
    children: number
    infants: number
    pets: number
    budgetLevel: number | null
  }
  destinations: DestinationVM[]
  stepDetails: Record<string, StepDetailVM>
  bookingDetails: Record<string, BookingDetailVM>
  expenses: ExpenseVM[]
  kitItems: KitItemVM[]
  trackSteps?: TrackStepVM[]
  trackReadiness?: TrackReadinessVM
  ledger?: LedgerVM | null
  stayGaps?: StayGap[]
  budget?: { amountUsd: number | null; startDate: string | null; endDate: string | null } | null
  children?: React.ReactNode
}) {
  const [showBuddies, setShowBuddies] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const notesTotal = countTripNotes(tripNotes)
  // Web has no viewerMode/canEdit concept — the only role-shaped props here are
  // isOwner and tripBuddies. A member is the owner or an accepted buddy, which
  // is exactly who RLS lets insert a step on this trip.
  const canWriteNotes = isOwner || tripBuddies.some((b) => b.isMe)
  /// Day notes for one stop+day, taken from the rollup groups already computed
  /// server-side — so the day view and the Notes screen cannot disagree about
  /// what exists, and no extra query is made.
  const notesForDay = (destId: string, date: string): TripNote[] => {
    const g = tripNotes.find((x) => x.destId === destId)
    if (!g) return []
    const key = date.slice(0, 10)
    return g.notes.filter((n) => n.kind === "note" && n.date?.slice(0, 10) === key)
  }
  const [tab, setTab] = useState<Tab>("plan")
  const [selectedDestId, setSelectedDestId] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<number | "overview">("overview")
  const [selected, setSelected] = useState<TimelineItem | null>(null)
  // Full-screen Map: the day number it opened on, or null when closed.
  const [mapOpenDay, setMapOpenDay] = useState<number | null>(null)
  // Background-scan wiring: bumping scanNonce wakes the ScanStatus chip after a
  // scan is kicked off; bumping reviewSignal opens the bookings sheet to review.
  const [scanNonce, setScanNonce] = useState(0)
  const [reviewSignal, setReviewSignal] = useState(0)
  const [reviewBatchId, setReviewBatchId] = useState<string | null>(null)

  // Lazy destination hero photos. The SSR page no longer blocks on a
  // resolve-place→Google lookup per destination (that made opening a trip
  // slow); we hydrate the heroes here after mount instead, so the page paints
  // immediately with the amber gradient and photos fill in. Keyed by dest id.
  const [lazyHeroes, setLazyHeroes] = useState<Record<string, string | null>>({})
  useEffect(() => {
    let cancelled = false
    const toResolve = destinations.filter(
      (d) => d.id !== "unassigned" && lazyHeroes[d.id] === undefined
    )
    if (toResolve.length === 0) return
    ;(async () => {
      // Resolved together, not one after another. These are independent lookups
      // against the same API — serialising them made a trip with five
      // destinations wait five round trips before the last hero appeared.
      const resolved = await Promise.all(
        toResolve.map(async (d) => [d.id, placePhotoUrl(
          await resolvePlace(d.label, d.label, d.country ?? undefined), 1200,
        )] as const),
      )
      if (cancelled) return
      setLazyHeroes((prev) => ({ ...prev, ...Object.fromEntries(resolved) }))
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinations])
  const heroFor = (d: DestinationVM): string | null => lazyHeroes[d.id] ?? null

  // Lazy trip-level cover. Same rationale as the destination heroes above:
  // trips usually have no cover_url/media, so rather than an SSR photo lookup on
  // the critical path we resolve the trip's lead city here after mount and let
  // the photo fill in over the amber gradient.
  const [lazyCover, setLazyCover] = useState<string | null>(null)
  // Keyed on the lead destination's IDENTITY, not on the destinations array.
  //
  // That array gets a new reference on every render, and this effect had no
  // already-resolved guard — only `if (tripMeta.cover) return` — so every
  // router.refresh() re-ran the lookup. Ticking one packing item re-issued a
  // Google place request for the trip cover.
  const coverDest = destinations.find((x) => x.id !== "unassigned")
  const coverKey = coverDest
    ? `${coverDest.id}|${coverDest.label}|${coverDest.country ?? ""}`
    : ""
  useEffect(() => {
    if (tripMeta.cover || !coverKey || lazyCover) return
    const d = destinations.find((x) => x.id !== "unassigned")
    if (!d) return
    let cancelled = false
    ;(async () => {
      const cand = await resolvePlace(d.label, d.label, d.country ?? undefined)
      if (!cancelled) setLazyCover(placePhotoUrl(cand, 1200))
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripMeta.cover, coverKey, lazyCover])

  // Lead destination with coords → the trip-cover weather pill (iOS parity).
  const weatherDest = destinations.find(
    (d) => d.id !== "unassigned" && d.lat != null && d.lng != null
  ) ?? null

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
      className={`hidden gap-0.5 rounded-full p-1 md:flex lg:hidden ${
        glass ? "border border-white/25 bg-white/15 backdrop-blur-xl" : "bg-aurora-glass/95 shadow-sm"
      }`}
    >
      {TABS.map(([key, label]) => (
        <button
          key={key}
          onClick={() => setTab(key)}
          className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
            tab === key
              ? glass
                ? "bg-white text-aurora-midnight"
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

  // Desktop-only day/section rail — a vertical index of the trip that drives the
  // SAME tab/destination/day state as the mobile hero pills + tab bar. Purely
  // additive: hidden below lg, so the mobile iOS trip screen is untouched.
  const desktopSidebar = (
    <aside className="hidden lg:sticky lg:top-6 lg:block lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto">
      <div className="rounded-[22px] border border-aurora-border bg-aurora-glass p-2.5">
        <div className="px-2.5 pb-1.5 pt-1">
          <div className="truncate font-drift-display text-[16px] font-semibold leading-tight">
            {tripMeta.title} {tripMeta.flag ?? ""}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-drift-text-tertiary">{tripMeta.dateRange}</div>
        </div>

        <SidebarLink
          active={tab === "plan" && !selectedDestId}
          onClick={() => {
            setTab("plan")
            setSelectedDestId(null)
            setSelected(null)
          }}
        >
          Overview
        </SidebarLink>

        <div className="px-2.5 pb-1 pt-3 text-[10.5px] font-bold uppercase tracking-wider text-drift-text-tertiary">
          Itinerary
        </div>
        {destinations.map((d) => (
          <div key={d.id}>
            {destinations.length > 1 && (
              <SidebarLink
                active={tab === "plan" && selectedDestId === d.id && selectedDay === "overview"}
                onClick={() => {
                  setTab("plan")
                  openDest(d.id)
                }}
              >
                {d.label}
              </SidebarLink>
            )}
            {d.days.map((day) => (
              <SidebarLink
                key={day.dayNumber}
                indent={destinations.length > 1}
                badge={day.dayNumber}
                active={tab === "plan" && selectedDestId === d.id && selectedDay === day.dayNumber}
                onClick={() => {
                  setTab("plan")
                  setSelectedDestId(d.id)
                  setSelectedDay(day.dayNumber)
                  setSelected(null)
                }}
              >
                {shortDay(day.date)}
              </SidebarLink>
            ))}
            {destinations.length === 1 && (
              <SidebarLink
                indent
                active={tab === "plan" && selectedDestId === d.id && selectedDay === "overview"}
                onClick={() => {
                  setTab("plan")
                  openDest(d.id)
                }}
              >
                Guide
              </SidebarLink>
            )}
          </div>
        ))}

        <div className="px-2.5 pb-1 pt-3 text-[10.5px] font-bold uppercase tracking-wider text-drift-text-tertiary">
          Trip
        </div>
        <SidebarLink active={tab === "kit"} onClick={() => setTab("kit")}>
          Kit
        </SidebarLink>
        <SidebarLink active={tab === "expenses"} onClick={() => setTab("expenses")}>
          Expenses
        </SidebarLink>
        <SidebarLink active={tab === "track"} onClick={() => setTab("track")}>
          Track
        </SidebarLink>
      </div>
    </aside>
  )

  return (
    <div className="lg:grid lg:grid-cols-[228px_minmax(0,1fr)] lg:items-start lg:gap-6">
      {dest && (
        <TripMapView
          open={mapOpenDay != null}
          initialDay={mapOpenDay ?? 1}
          onClose={() => setMapOpenDay(null)}
          tripId={tripId}
          dest={dest}
          stepDetails={stepDetails}
        />
      )}
      {desktopSidebar}
      <div className="min-w-0">
        {/* ---------- Hero: destination (drill-in) or trip ---------- */}
      {inDest && dest ? (
        <div className="relative mt-3 h-[240px] overflow-hidden rounded-[26px] shadow-[0_24px_60px_-24px_rgba(31,31,36,0.35)] md:h-[300px] lg:mt-0">
          {heroFor(dest) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroFor(dest)!} alt="" fetchPriority="high" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#16222F,#0B1A25)" }} />
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
              {/* Parity with the iOS chrome Map button: one tap to the
                  full-screen map from anywhere in the destination. */}
              <button
                onClick={() => setMapOpenDay(selectedDay === "overview" ? 1 : selectedDay)}
                aria-label="Open trip map"
                className="flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1.5 text-[13px] font-semibold text-white backdrop-blur-xl"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 4L3 7v13l6-3 6 3 6-3V4l-6 3-6-3zM9 4v13M15 7v13" />
                </svg>
                Map
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
        <div className="relative -mx-5 -mt-4 h-[300px] overflow-hidden shadow-[0_24px_60px_-24px_rgba(31,31,36,0.35)] md:mx-0 md:mt-3 md:h-[300px] md:rounded-[26px] lg:mt-0">
          {tripMeta.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <>
              <OptimizedImg
                src={tripMeta.cover}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 700px"
                className="object-cover"
              />
              {/* The credit is rendered in flow under the chips below, not
                  floated here, so it cannot land on them. */}
            </>
          ) : lazyCover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={lazyCover}
              alt=""
              fetchPriority="high"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#16222F,#0B1A25)" }} />
          )}
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(to top, rgba(12,10,9,.72) 0%, rgba(12,10,9,.18) 45%, rgba(12,10,9,.12) 100%)" }}
          />
          {/* Bottom blend — melt the full-bleed mobile hero into the Aurora
              ground (#08131D) so there's no hard card edge. Desktop keeps its
              rounded card, so the blend is mobile-only. */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-28 md:hidden"
            style={{ background: "linear-gradient(to bottom, rgba(8,19,29,0) 35%, #08131D 100%)" }}
          />
          {weatherDest && (
            <div className="absolute right-5 top-[62px] z-10 md:right-7 md:top-[80px]">
              <TripWeather lat={weatherDest.lat!} lng={weatherDest.lng!} place={weatherDest.label} />
            </div>
          )}
          <div className="absolute inset-0 flex flex-col justify-between p-5 md:p-7">
            <div className="flex items-start justify-between gap-3">
              <BackLink href="/app" label="Home" />
              <div className="flex items-center gap-2">
                {segmented(true)}
                {/* Trip settings. Shown to every MEMBER, not just the owner: an
                    accepted buddy genuinely has UPDATE on the trip row, and the
                    settings page itself decides whether the bottom of the page
                    offers "Delete trip" or "Leave trip". Hiding it from buddies
                    would withhold edits the database actually permits. */}
                <Link
                  href={`/app/trips/${tripId}/settings`}
                  aria-label="Trip settings"
                  title="Trip settings"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white/90 backdrop-blur transition-colors hover:bg-black/50 hover:text-white"
                >
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.2.6.74 1 1.38 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </Link>
              </div>
            </div>
            <div>
              <h1 className="font-drift-display text-[40px] font-semibold leading-[1.02] tracking-tight text-white [text-shadow:0_2px_18px_rgba(0,0,0,0.35)] md:text-[54px]">
                {tripMeta.title} {tripMeta.flag ?? ""}
              </h1>
              <p className="mt-1.5 text-[15px] text-white/90">{tripMeta.dateRange}</p>
              {tripMeta.statusLine && (
                <p className="mt-0.5 text-[13.5px] text-white/75">{tripMeta.statusLine}</p>
              )}

              {/* Travel buddies + Invite, ON THE COVER — where iOS puts them.
                  The invite link spent one commit buried in Trip Settings,
                  which is not where anyone looks for it and is not what the
                  phone does. Shown to every member: an accepted buddy may mint
                  an invite (create_trip_invite permits owner OR buddy), and the
                  panel itself hides the owner-only controls. */}
              <button
                onClick={() => setShowBuddies(true)}
                aria-label="Travel buddies and invite link"
                className="mt-3 flex items-center gap-2 rounded-full bg-black/35 py-1.5 pl-1.5 pr-3.5 backdrop-blur transition-colors hover:bg-black/50"
              >
                {tripBuddies.slice(0, 4).map((b, i) => (
                  <span
                    key={b.id}
                    className="-ml-2 flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-[#08131D] bg-aurora-teal/25 text-[11px] font-bold text-white first:ml-0"
                    style={{ zIndex: 10 - i }}
                  >
                    {b.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      b.name.slice(0, 1).toUpperCase()
                    )}
                  </span>
                ))}
                <span className="text-[13px] font-semibold text-white">
                  {tripBuddies.length > 1 ? `${tripBuddies.length} · Invite` : "Invite"}
                </span>
              </button>
              {chipData && (
                <TripCoverChips
                  tripId={tripId}
                  placeName={chipData.placeName}
                  startDate={chipData.startDate}
                  endDate={chipData.endDate}
                  adults={chipData.adults}
                  children={chipData.children}
                  infants={chipData.infants}
                  pets={chipData.pets}
                  budgetLevel={chipData.budgetLevel}
                  destinations={destinations
                    .filter((d) => d.id !== "unassigned")
                    .map((d) => ({ id: d.id, label: d.label, country: d.country, lat: d.lat, lng: d.lng }))}
                />
              )}
              {tripMeta.coverCredit && (
                <CoverCredit
                  text={tripMeta.coverCredit.text}
                  href={tripMeta.coverCredit.href}
                  placement="inline"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile tab strip */}
      <div className="mt-4 flex gap-1.5 rounded-full bg-aurora-glass p-1 shadow-sm md:hidden">
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
                    <FindBookings
                      tripId={tripId}
                      tripTitle={tripMeta.title}
                      tripStart={chipData?.startDate ?? null}
                      tripEnd={chipData?.endDate ?? null}
                      openSignal={reviewSignal}
                      reviewBatchId={reviewBatchId}
                      onScanStarted={() => setScanNonce((n) => n + 1)}
                    />
                  </span>
                </div>
                <ScanStatus
                  tripId={tripId}
                  refreshNonce={scanNonce}
                  onReview={(batchId) => {
                    setReviewBatchId(batchId)
                    setReviewSignal((s) => s + 1)
                  }}
                />
                {/* Directly under Find bookings, as on iOS: renders the plan
                    to a designed PDF + share/download. */}
                <ExportItinerary tripId={tripId} />
                <MediaSection tripId={tripId} />
                {/* Every note in the trip, compiled. Matches the MediaSection
                    row anatomy exactly so the Plan tab reads as one list. */}
                <button
                  onClick={() => setShowNotes(true)}
                  className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-aurora-border bg-aurora-glass p-3.5 text-left transition-colors hover:border-aurora-teal/40"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-aurora-teal/10 text-aurora-teal">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h13l3 3v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
                      <path d="M7 9h9M7 13h9M7 17h5" />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-drift-ink">Notes</span>
                    <span className="block truncate text-[12.5px] text-drift-text-tertiary">
                      {notesTotal === 0
                        ? "Notes from every stop, together"
                        : `${notesTotal} ${notesTotal === 1 ? "note" : "notes"} across this trip`}
                    </span>
                  </span>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-drift-text-tertiary" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
                {destinations.length === 0 && (
                  <p className="mt-3 text-drift-muted">
                    No itinerary yet. Ask Drift to start planning.
                  </p>
                )}
                <ul className="mt-3.5 space-y-3">
                  {destinations.map((d) => (
                    <li key={d.id}>
                      <OverviewStopCard
                        dest={d}
                        hero={heroFor(d)}
                        stepDetails={stepDetails}
                        onOpen={() => openDest(d.id)}
                      />
                    </li>
                  ))}
                </ul>
                <CompleteYourTrip gaps={stayGaps} />
              </div>
            ) : selectedDay === "overview" && dest ? (
              /* -------- Overview = the Guide -------- */
              <DestinationGuide
                tripId={tripId}
                label={dest.label}
                country={dest.country}
                lat={dest.lat}
                lng={dest.lng}
                month={monthFromDate(dest.days[0]?.date)}
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
                    tripId={tripId}
                    destId={dest.id}
                    selectedId={selected?.id ?? null}
                    bookingDetails={bookingDetails}
                    stepDetails={stepDetails}
                    dayNotes={notesForDay(dest.id, day.date)}
                    canWriteNotes={canWriteNotes}
                    onSelect={setSelected}
                    onExpandMap={() => setMapOpenDay(day.dayNumber)}
                  />
                ))
            )}
          </div>

          {/* Desktop-only Ask Drift panel — on mobile the docked composer (page
              level) replaces this, so the chat isn't a big block below the plan. */}
          <div className="hidden lg:sticky lg:top-6 lg:block lg:h-[calc(100vh-3rem)]">
            {inspector && <div className="hidden h-full lg:block">{inspector}</div>}
            <div className={`h-full ${inspector ? "lg:hidden" : ""}`}>{children}</div>
          </div>

          {inspector && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div className="absolute inset-0 bg-black/40" onClick={() => setSelected(null)} />
              <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-[24px] bg-aurora-glass p-1 shadow-aurora-glow">
                {inspector}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "kit" && (
        <KitTab items={kitItems} startDate={chipData?.startDate ?? null} tripId={tripId} />
      )}
      {tab === "expenses" && (
        <ExpensesTab
          expenses={expenses}
          ledger={ledger}
          budget={budget}
          tripId={tripId}
          meId={meId}
          members={members}
          isOwner={isOwner}
        />
      )}
      {tab === "track" && (
        <TrackTab steps={trackSteps} readiness={trackReadiness} tripId={tripId} />
      )}
      </div>

      {showNotes && (
        <TripNotesPanel
          tripId={tripId}
          groups={tripNotes}
          stops={noteStops}
          total={notesTotal}
          canWrite={canWriteNotes}
          meId={meId}
          isOwner={isOwner}
          onClose={() => setShowNotes(false)}
        />
      )}

      {showBuddies && (
        <TripBuddiesPanel
          tripId={tripId}
          buddies={tripBuddies}
          viewerIsOwner={isOwner}
          onClose={() => setShowBuddies(false)}
        />
      )}
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

// 1…12 month from a yyyy-MM-dd date string (the destination's first day) — feeds
// the guide's weather chip + best-time marker. null when the date is absent.
function monthFromDate(iso: string | undefined): number | null {
  if (!iso || iso.startsWith("1970")) return null // 1970 = dateless-trip sentinel
  const m = Number(iso.slice(5, 7))
  return m >= 1 && m <= 12 ? m : null
}

// One row in the desktop day/section sidebar.
function SidebarLink({
  active,
  indent,
  badge,
  onClick,
  children,
}: {
  active: boolean
  indent?: boolean
  badge?: React.ReactNode
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl py-2 pr-3 text-left text-[13.5px] transition-colors ${
        indent ? "pl-9" : "pl-3"
      } ${active ? "bg-aurora-glass2 font-semibold text-aurora-ink" : "text-drift-muted hover:text-aurora-ink"}`}
    >
      {badge != null && (
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold tabular-nums ${
            active ? "bg-drift-coral text-white" : "bg-aurora-glass2 text-drift-text-tertiary"
          }`}
        >
          {badge}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  )
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

// ---------- Overview: expandable stop card (iOS "Your stops" parity) ----------

function OverviewStopCard({
  dest,
  hero,
  stepDetails,
  onOpen,
}: {
  dest: DestinationVM
  hero: string | null
  stepDetails: Record<string, StepDetailVM>
  onOpen: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const items = dest.days.flatMap((d) => d.items)
  const shown = items.slice(0, 4)
  const moreCount = items.length - shown.length

  return (
    <div className="overflow-hidden rounded-[20px] border border-aurora-border bg-aurora-glass">
      <div className="flex w-full items-stretch">
        {/* Tapping the destination opens its guide directly (iOS parity). */}
        <button
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-4 p-3.5 text-left transition-colors hover:bg-aurora-glass2"
        >
          {hero ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero} alt="" loading="lazy" className="h-[72px] w-[72px] shrink-0 rounded-2xl object-cover" />
          ) : (
            <div className="h-[72px] w-[72px] shrink-0 rounded-2xl" style={{ background: "linear-gradient(135deg,#16222F,#0B1A25)" }} />
          )}
          {/* The chip used to be a shrink-0 sibling of this column, so it took
              ~120px off the title before the title got to measure itself. On a
              phone that left about 100px: "Reykjavík" became "Reykj…" while the
              LONGER "Egilsstaðir" fit fine one row down, because that row has no
              chip. It rides with the plans count now, so the title always gets
              the full width and the row reads the same in a narrow ≥lg pane. */}
          <div className="min-w-0 flex-1">
            <p className="truncate font-drift-display text-[19px] font-semibold tracking-tight">{dest.label}</p>
            {/* truncate, not wrap: this is a range, and breaking it put the "3"
                of "Jul 2 – Jul 3" alone on a second line. */}
            <p className="mt-0.5 truncate text-[13.5px] text-drift-muted">{dest.dateRange}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[12.5px] text-drift-text-tertiary">
                {dest.plansCount} plan{dest.plansCount === 1 ? "" : "s"}
              </span>
              {dest.bookedChip && (
                <span className="rounded-full bg-aurora-indigo/20 px-2.5 py-1 text-[11.5px] font-semibold text-aurora-indigo">
                  ● {dest.bookedChip}
                </span>
              )}
            </div>
          </div>
        </button>
        {/* Separate chevron just previews the stops inline. */}
        {items.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse stops" : "Expand stops"}
            className="flex shrink-0 items-center px-4 text-[18px] text-aurora-ink3 transition-colors hover:bg-aurora-glass2"
          >
            <span className={`inline-block transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}>›</span>
          </button>
        )}
      </div>

      {expanded && (
        <div className="border-t border-aurora-border px-3.5 pb-2.5 pt-1">
          {shown.length === 0 ? (
            <p className="py-2 text-[13px] text-aurora-ink3">Nothing planned yet — ask Drift for ideas.</p>
          ) : (
            shown.map((item) => (
              <InlineDayItem key={item.id} item={item} stepDetails={stepDetails} onOpen={onOpen} />
            ))
          )}
          {moreCount > 0 && (
            <button onClick={onOpen} className="mt-1 px-1 py-1 text-[13px] font-semibold text-aurora-teal">
              +{moreCount} more
            </button>
          )}
          <button
            onClick={onOpen}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-aurora-border py-2 text-[13px] font-semibold text-aurora-teal transition-colors hover:bg-aurora-teal/10"
          >
            Open guide · Overview + Day ›
          </button>
        </div>
      )}
    </div>
  )
}

function InlineDayItem({
  item,
  stepDetails,
  onOpen,
}: {
  item: TimelineItem
  stepDetails: Record<string, StepDetailVM>
  onOpen: () => void
}) {
  const time = item.startTimeMinutes != null ? minutesLabel(item.startTimeMinutes).join(" ") : null
  const s = item.linkedStepId ? stepDetails[item.linkedStepId] : null
  const booked = !!(s?.confirmationNumber || s?.importProvider)
  const showSub = item.subtitle && item.subtitle !== item.title

  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 py-2 text-left">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-aurora-midnight2 text-[15px]">
        {dotEmoji(item)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[14.5px] font-semibold text-aurora-ink">{item.title}</span>
          {booked && (
            <span className="shrink-0 rounded bg-aurora-indigo/25 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-aurora-indigo">
              Booked
            </span>
          )}
        </span>
        {showSub && <span className="block truncate text-[12px] text-aurora-ink3">{item.subtitle}</span>}
      </span>
      {time && <span className="shrink-0 text-[12.5px] font-medium text-aurora-ink2">{time}</span>}
      <span className="shrink-0 text-[14px] text-aurora-ink3">›</span>
    </button>
  )
}

// ---------- Day timeline ----------

function DaySection({
  day,
  tripId,
  destId,
  selectedId,
  stepDetails,
  bookingDetails,
  dayNotes,
  canWriteNotes,
  onSelect,
  onExpandMap,
}: {
  day: DestinationDay
  tripId: string
  destId: string
  selectedId: string | null
  stepDetails: Record<string, StepDetailVM>
  bookingDetails: Record<string, BookingDetailVM>
  /** Notes pinned to THIS day. Note steps never reach `day.items` — the day
   *  timeline's mapStepType drops step_type='note' — so they arrive separately. */
  dayNotes: TripNote[]
  canWriteNotes: boolean
  onSelect: (item: TimelineItem) => void
  onExpandMap?: () => void
}) {
  const router = useRouter()

  // Local copy of the day's items so drag-to-reorder can apply optimistically.
  // We reconcile against the server order whenever `day.items` changes (after a
  // router.refresh), keyed by the ordered id signature so a local reorder — which
  // only mutates `items`, not `day.items` — doesn't get wiped mid-drag.
  const [items, setItems] = useState<TimelineItem[]>(day.items)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const orderSig = day.items.map((i) => i.id).join("|")
  useEffect(() => {
    setItems(day.items)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderSig])

  const last = [...items].reverse().find((i) => i.startTimeMinutes != null)
  const summary = items.length
    ? `${items.length} stop${items.length === 1 ? "" : "s"}${
        last?.startTimeMinutes != null
          ? ` · ends ${minutesLabel(last.startTimeMinutes).join(" ")}`
          : ""
      }`
    : null

  // Day map: the day's stops that carry coordinates, numbered in itinerary order.
  const mapPoints: TripMapPoint[] = []
  items.forEach((it) => {
    const s = it.linkedStepId ? stepDetails[it.linkedStepId] : null
    if (s?.lat != null && s?.lng != null) {
      mapPoints.push({ id: it.id, lat: s.lat, lng: s.lng, label: it.title, n: mapPoints.length + 1 })
    }
  })

  // Persist the new order: rewrite display_order (spaced by 10) for every
  // step-backed item in visual order. Bookings carry no step, so they keep their
  // nature-based slot (see timeline.ts). router.refresh() reconciles after.
  async function persistOrder(order: TimelineItem[]) {
    const stepIds = order
      .filter((i) => i.linkedStepId)
      .map((i) => i.linkedStepId as string)
    if (stepIds.length === 0) return
    try {
      const supabase = createClient()
      // throwOnError, for the same reason the Kit and Inspector writes carry it:
      // postgrest-js resolves with { error } rather than rejecting, so a refused
      // reorder took the success path with nothing said. And nothing corrected it
      // afterwards either: the reconcile effect above is keyed on `orderSig`,
      // which is built from the SERVER order — a refused update leaves that
      // string identical, the effect never re-runs, and the user's unsaved order
      // sat there looking saved until the next full remount.
      await Promise.all(
        stepIds.map((id, idx) =>
          supabase.from("steps").update({ display_order: idx * 10 }).eq("id", id).throwOnError()
        )
      )
    } catch (e) {
      // Put the server's order back on screen. Promise.all rejects on the first
      // failure but does not cancel the rest, so some rows may have been
      // rewritten — router.refresh() below fetches whatever actually landed, and
      // this makes the local copy stop asserting the version that did not.
      setItems(day.items)
      alert(
        e instanceof Error
          ? `Couldn't save the new order: ${e.message}`
          : "Couldn't save the new order."
      )
    } finally {
      router.refresh()
    }
  }

  function reorder(fromId: string, toId: string) {
    setDragId(null)
    setOverId(null)
    const from = items.findIndex((i) => i.id === fromId)
    const to = items.findIndex((i) => i.id === toId)
    if (from < 0 || to < 0 || from === to) return
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setItems(next) // optimistic
    void persistOrder(next)
  }

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

      {mapPoints.length > 0 && (
        <div className="mb-4">
          <TripMap points={mapPoints} onExpand={onExpandMap} />
        </div>
      )}

      {/* Day notes. These are step_type='note' rows, which the day timeline
          drops (mapStepType returns null for them) — so before this they were
          invisible on the day screen on both platforms, and the only way to
          write one was a menu nobody opens. Rendered above the stops because a
          note is usually context for the whole day. */}
      <DayNotes
        notes={dayNotes}
        tripId={tripId}
        destId={destId}
        date={day.date}
        canWrite={canWriteNotes}
      />

      {items.length === 0 ? (
        <p className="text-[14px] text-drift-text-tertiary">
          Nothing planned yet — ask Drift for ideas.
        </p>
      ) : (
        <ul>
          {items.map((item, i) => (
            <TimelineRow
              key={item.id}
              item={item}
              isLast={i === items.length - 1}
              isSelected={selectedId === item.id}
              chip={chipFor(item, stepDetails, bookingDetails)}
              onClick={() => onSelect(item)}
              reorderable={!!item.linkedStepId}
              dragging={dragId === item.id}
              dropIndicator={overId === item.id && dragId != null && dragId !== item.id}
              onGripDragStart={(e) => {
                setDragId(item.id)
                e.dataTransfer.effectAllowed = "move"
                e.dataTransfer.setData("text/plain", item.id) // Firefox needs data to start a drag
              }}
              onGripDragEnd={() => {
                setDragId(null)
                setOverId(null)
              }}
              onRowDragEnter={() => {
                if (dragId && item.linkedStepId && dragId !== item.id) setOverId(item.id)
              }}
              onRowDragOver={(e) => {
                if (dragId && item.linkedStepId) e.preventDefault() // allow drop
              }}
              onRowDrop={(e) => {
                if (dragId && item.linkedStepId) {
                  e.preventDefault()
                  reorder(dragId, item.id)
                }
              }}
            />
          ))}
        </ul>
      )}
      <DayAddStop tripId={tripId} destId={destId} dayDate={day.date} />
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
  reorderable = false,
  dragging = false,
  dropIndicator = false,
  onGripDragStart,
  onGripDragEnd,
  onRowDragEnter,
  onRowDragOver,
  onRowDrop,
}: {
  item: TimelineItem
  isLast: boolean
  isSelected: boolean
  chip: string | null
  onClick: () => void
  reorderable?: boolean
  dragging?: boolean
  dropIndicator?: boolean
  onGripDragStart?: (e: React.DragEvent) => void
  onGripDragEnd?: (e: React.DragEvent) => void
  onRowDragEnter?: (e: React.DragEvent) => void
  onRowDragOver?: (e: React.DragEvent) => void
  onRowDrop?: (e: React.DragEvent) => void
}) {
  const showSubtitle = item.subtitle && item.subtitle !== item.title
  const time = item.startTimeMinutes != null ? minutesLabel(item.startTimeMinutes) : null

  return (
    <li
      className={`flex gap-4 ${dragging ? "opacity-40" : ""}`}
      onDragEnter={onRowDragEnter}
      onDragOver={onRowDragOver}
      onDrop={onRowDrop}
    >
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
        className={`relative mb-3.5 flex min-w-0 flex-1 items-center gap-4 rounded-[18px] border bg-aurora-glass px-5 py-4 text-left transition-all duration-150 ${
          dropIndicator
            ? "border-aurora-teal ring-2 ring-aurora-teal"
            : isSelected
              ? "border-drift-coral shadow-[0_14px_34px_-18px_rgba(224,86,59,0.4)]"
              : "border-aurora-border shadow-[0_1px_2px_rgba(31,31,36,0.04)] hover:-translate-y-0.5 hover:border-drift-coral/35 hover:shadow-[0_14px_34px_-18px_rgba(31,31,36,0.28)]"
        }`}
      >
        {reorderable && (
          // eslint-disable-next-line jsx-a11y/no-static-element-interactions
          <span
            draggable
            onDragStart={onGripDragStart}
            onDragEnd={onGripDragEnd}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            title="Drag to reorder"
            aria-label="Drag to reorder"
            className="absolute left-1 top-1/2 -translate-y-1/2 cursor-grab select-none px-0.5 text-[15px] leading-none text-aurora-ink3 active:cursor-grabbing hover:text-aurora-teal"
          >
            ⠿
          </span>
        )}
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
          <span className="shrink-0 rounded-full border border-aurora-border bg-aurora-midnight px-3 py-1.5 text-[12px] font-semibold text-drift-muted">
            {chip}
          </span>
        )}
        <span className="shrink-0 text-[18px] text-aurora-ink3">›</span>
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
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [eTime, setETime] = useState(step?.rawTime ?? "")
  const [eDur, setEDur] = useState(step?.durationMinutes != null ? String(step.durationMinutes) : "")
  const [eNotes, setENotes] = useState(step?.notes ?? "")

  async function save() {
    if (!step) return
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      // throwOnError, or the catch below is dead code: postgrest-js resolves with
      // { error } rather than rejecting, so an RLS denial or a bad value took the
      // success path — the sheet closed, the edit was reported as saved, and the
      // next refresh quietly restored the old values.
      await supabase
        .from("steps")
        .update({
          scheduled_at: eTime && step.rawDate ? `${step.rawDate}T${eTime}:00` : null,
          duration_minutes: eDur.trim() ? Number(eDur) : null,
          notes: eNotes.trim() || null,
        })
        .eq("id", step.id)
        .throwOnError()
      setEditing(false)
      onClose()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.")
      setSaving(false)
    }
  }

  const lat = step?.lat ?? item.latitude
  const lng = step?.lng ?? item.longitude
  const map = lat != null && lng != null ? staticMapUrl(lat, lng) : null

  /** The server refuses to remove a CONFIRMED booking unless the caller
   *  acknowledges the risk. That guard is aimed at the assistant acting on its
   *  own initiative, not at a person: reaching here means the user already
   *  pressed Remove and then confirmed against Keep, which is precisely the
   *  acknowledgement the flag represents. Without passing it, a confirmed
   *  booking cannot be removed on web at all — the button just returns
   *  "remove_step: refused to touch confirmed booking" into the UI. */
  async function remove() {
    // A row is either step-backed (stays, spots, activities) or a transport
    // booking (flights, trains, cars) — never both, and they live in different
    // tables, so removal needs the matching op.
    if (!step && !booking) return
    setRemoving(true)
    setError(null)
    try {
      if (step) await applyRemoveStep(tripId, step.id, true)
      else await applyRemoveTransport(tripId, booking!.id, true)
      onClose()
      router.refresh()
    } catch (e) {
      setError(
        isConfirmedBookingRefusal(e)
          ? "This booking is protected and couldn't be removed. Try again from the booking itself."
          : e instanceof Error
            ? e.message
            : "Couldn't remove that."
      )
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
    <div className="flex h-full flex-col overflow-hidden rounded-[22px] border border-aurora-border bg-aurora-glass shadow-[0_24px_60px_-30px_rgba(31,31,36,0.25)]">
      <div className="flex items-start justify-between gap-3 border-b border-aurora-border px-5 py-4">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold tracking-[0.12em] text-drift-coral">
            {item.badge}
          </p>
          <p className="truncate font-drift-display text-[20px] font-semibold tracking-tight">
            {step?.title ?? booking?.title ?? item.title}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {step && !editing && (
            <button
              onClick={() => setEditing(true)}
              aria-label="Edit"
              className="rounded-full px-2.5 py-1 text-[12.5px] font-semibold text-aurora-teal hover:bg-aurora-teal/10"
            >
              Edit
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-drift-muted hover:bg-aurora-glass2"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {map && (
          // eslint-disable-next-line @next/next/no-img-element
          <OptimizedImg
            src={map}
            width={600}
            height={280}
            sizes="(max-width: 1024px) 100vw, 380px"
            className="h-[150px] w-full rounded-2xl object-cover"
          />
        )}

        {editing && step && (
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-aurora-ink3">Time</span>
              <input type="time" value={eTime} onChange={(e) => setETime(e.target.value)}
                className="h-11 w-full rounded-xl border border-aurora-border bg-aurora-midnight2 px-3 text-[15px] text-aurora-ink outline-none focus:border-aurora-teal [color-scheme:dark]" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-aurora-ink3">Duration (minutes)</span>
              <input type="number" min={0} value={eDur} onChange={(e) => setEDur(e.target.value)} placeholder="e.g. 90"
                className="h-11 w-full rounded-xl border border-aurora-border bg-aurora-midnight2 px-3 text-[15px] text-aurora-ink outline-none focus:border-aurora-teal" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-aurora-ink3">Notes</span>
              <textarea value={eNotes} onChange={(e) => setENotes(e.target.value)} rows={3} placeholder="Add a note…"
                className="w-full rounded-xl border border-aurora-border bg-aurora-midnight2 px-3 py-2 text-[15px] text-aurora-ink outline-none focus:border-aurora-teal" />
            </label>
            <div className="flex gap-2">
              <button onClick={save} disabled={saving} className="aurora-cta h-10 flex-1 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
              <button onClick={() => { setEditing(false); setETime(step.rawTime ?? ""); setEDur(step.durationMinutes != null ? String(step.durationMinutes) : ""); setENotes(step.notes ?? "") }}
                className="h-10 rounded-full border border-aurora-border px-4 text-[14px] font-semibold text-aurora-ink2">Cancel</button>
            </div>
          </div>
        )}

        {!editing && (
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
        )}

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
                className="rounded-full border border-aurora-border px-4 py-2 text-[13px] font-medium"
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

      <div className="flex items-center gap-2 border-t border-aurora-border p-3.5">
        <button
          onClick={askDrift}
          className="flex-1 rounded-full bg-drift-coral py-2.5 text-[13.5px] font-semibold text-white shadow-[0_8px_18px_-8px_rgba(224,86,59,0.65)]"
        >
          ✦ Ask Drift about this
        </button>
        {(step || booking) &&
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
                className="rounded-full border border-aurora-border px-3 py-2.5 text-[13px]"
              >
                Keep
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingRemove(true)}
              className="rounded-full border border-aurora-border px-4 py-2.5 text-[13px] font-medium text-drift-muted hover:text-drift-coral-deep"
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

// Preferred category display order; unknown categories fall to the end.
const KIT_CATEGORY_ORDER = [
  "documents", "electronics", "clothing", "toiletries",
  "health", "gear", "activities", "other",
]

// Phase decides an item's "done" target: pack/prep finish at packed, buy at bought.
function kitDone(i: KitItemVM): boolean {
  if (i.phase === "buy") return i.state === "bought" || i.state === "packed"
  return i.state === "packed" || i.state === "bought"
}
function kitToggleTarget(i: KitItemVM): "in_kit" | "packed" | "bought" {
  if (kitDone(i)) return "in_kit"
  return i.phase === "buy" ? "bought" : "packed"
}

function KitTab({
  items,
  startDate,
  tripId,
}: {
  items: KitItemVM[]
  startDate: string | null
  tripId: string
}) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [local, setLocal] = useState<KitItemVM[]>(items)
  useEffect(() => setLocal(items), [items])
  const [building, setBuilding] = useState(false)

  // Each of these updates local state optimistically, writes, then refreshes.
  // The writes were unchecked, and postgrest-js resolves with { error } rather
  // than rejecting — so a rejected write let the optimistic state stand until
  // router.refresh() silently undid it. The user saw their change appear and then
  // revert a moment later with no explanation. throwOnError + a reason.
  const toggle = async (i: KitItemVM) => {
    const target = kitToggleTarget(i)
    setLocal((prev) => prev.map((x) => (x.id === i.id ? { ...x, state: target } : x)))
    try {
      await supabase.from("kit_items").update({ state: target }).eq("id", i.id).throwOnError()
    } catch (e) {
      alert(e instanceof Error ? `Couldn't update that item: ${e.message}` : "Couldn't update that item.")
    }
    router.refresh()
  }
  const remove = async (id: string) => {
    setLocal((prev) => prev.filter((x) => x.id !== id))
    try {
      await supabase.from("kit_items").delete().eq("id", id).throwOnError()
    } catch (e) {
      alert(e instanceof Error ? `Couldn't remove that item: ${e.message}` : "Couldn't remove that item.")
    }
    router.refresh()
  }
  const add = async (category: string, title: string) => {
    const t = title.trim()
    if (!t) return
    // The optimistic row carries a tmp id that no server row has, and everything
    // downstream (the progress bar, the category counts) counts it. If the insert
    // is refused we retract it here rather than leaving it on screen for the
    // refresh to sweep up — a refused insert changes nothing server-side, so the
    // refresh can re-render the identical list and strand the phantom.
    const tmpId = `tmp-${Date.now()}`
    setLocal((prev) => [
      ...prev,
      { id: tmpId, title: t, category, phase: "pack", state: "in_kit", quantity: 1 },
    ])
    try {
      await supabase.from("kit_items").insert({
        trip_id: tripId,
        title: t,
        category,
        quantity: 1,
        phase: "pack",
        state: "in_kit",
        source: "manual",
      }).throwOnError()
    } catch (e) {
      setLocal((prev) => prev.filter((x) => x.id !== tmpId))
      alert(e instanceof Error ? `Couldn't add "${t}": ${e.message}` : `Couldn't add "${t}".`)
    }
    router.refresh()
  }
  const build = async () => {
    setBuilding(true)
    try {
      await supabase.functions.invoke("derive-kit", { body: { trip_id: tripId } })
    } catch {
      /* derive-kit is idempotent; the refresh shows whatever landed */
    }
    router.refresh()
    setBuilding(false)
  }

  if (!local.length) {
    return (
      <div className="mt-6 lg:max-w-2xl">
        <div className="rounded-[22px] border border-aurora-border bg-aurora-glass p-8 text-center">
          <p className="font-drift-display text-[19px] font-semibold">Nothing packed yet</p>
          <p className="mx-auto mt-1.5 max-w-xs text-[14px] text-drift-muted">
            Let Drift build a packing list from your trip, or add items yourself.
          </p>
          <button
            onClick={build}
            disabled={building}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-aurora-teal px-5 py-2.5 text-[14px] font-semibold text-aurora-ink transition-opacity disabled:opacity-60"
          >
            {building ? "Building…" : "✦ Build my packing list"}
          </button>
        </div>
        <div className="mt-3">
          <KitAddRow category="other" onAdd={add} placeholder="Add an item…" />
        </div>
      </div>
    )
  }

  const active = local
  const packedCount = active.filter(kitDone).length
  const toPack = active.length - packedCount
  const pct = active.length ? Math.round((packedCount / active.length) * 100) : 0

  // Group by CATEGORY; done-ness is a row treatment (an item never jumps buckets).
  const byCat = new Map<string, KitItemVM[]>()
  for (const i of active) {
    const key = (i.category || "other").toLowerCase()
    const arr = byCat.get(key)
    if (arr) arr.push(i)
    else byCat.set(key, [i])
  }
  const cats = [...byCat.entries()]
    .map(([key, arr]) => ({
      key,
      packed: arr.filter(kitDone).length,
      total: arr.length,
      items: [...arr].sort((a, b) => (kitDone(a) ? 1 : 0) - (kitDone(b) ? 1 : 0)),
    }))
    .sort((a, b) => {
      const ua = a.total - a.packed
      const ub = b.total - b.packed
      if (ua !== ub) return ub - ua
      const ia = KIT_CATEGORY_ORDER.indexOf(a.key)
      const ib = KIT_CATEGORY_ORDER.indexOf(b.key)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })

  const days = daysUntilDeparture(startDate)

  return (
    <div className="mt-6 lg:max-w-2xl">
      {/* Action-queue header — what's LEFT, not a vanity percentage. */}
      <div className="flex items-baseline gap-2">
        <h2 className="font-drift-display text-[24px] font-semibold tracking-tight">
          {toPack > 0 ? (
            <>
              {toPack} <span className="text-drift-text-tertiary">left to pack</span>
            </>
          ) : (
            "All packed"
          )}
        </h2>
        {toPack === 0 && <span className="text-[19px]">✓</span>}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-aurora-glass2">
          <span
            className="block h-full rounded-full bg-aurora-teal transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="shrink-0 text-[12px] tabular-nums text-drift-muted">
          {packedCount} of {active.length}
        </span>
      </div>
      {days != null && (
        <p className="mt-1.5 text-[12px] font-medium" style={{ color: "#F0C48A" }}>
          You leave {days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}
        </p>
      )}

      {/* Category sections */}
      <div className="mt-6 space-y-6">
        {cats.map((c) => (
          <div key={c.key}>
            <div className="flex items-baseline gap-2">
              <h3 className="text-[15px] font-semibold capitalize">{c.key}</h3>
              <span className="text-[12.5px] tabular-nums text-drift-text-tertiary">
                {c.packed}/{c.total}
              </span>
            </div>
            <ul className="mt-2 space-y-1.5">
              {c.items.map((i) => {
                const done = kitDone(i)
                return (
                  <li
                    key={i.id}
                    className="group flex items-center gap-3 rounded-2xl border border-aurora-border bg-aurora-glass px-4 py-3"
                  >
                    <button
                      onClick={() => toggle(i)}
                      aria-label={done ? "Mark not packed" : "Mark packed"}
                      className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        done
                          ? "border-aurora-teal bg-aurora-teal"
                          : "border-drift-divider hover:border-aurora-teal"
                      }`}
                    >
                      {done && (
                        <svg
                          viewBox="0 0 24 24"
                          className="h-3.5 w-3.5"
                          fill="none"
                          stroke="#04231f"
                          strokeWidth={3.2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M5 12l5 5L20 6" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => toggle(i)}
                      className={`min-w-0 flex-1 truncate text-left text-[15px] ${
                        done ? "text-drift-text-tertiary line-through" : ""
                      }`}
                    >
                      {i.title}
                    </button>
                    {i.phase === "buy" && !kitDone(i) && (
                      <span className="rounded-full bg-aurora-glass2 px-2 py-0.5 text-[10.5px] text-drift-muted">
                        to buy
                      </span>
                    )}
                    {i.quantity > 1 && (
                      <span className="text-[12px] tabular-nums text-drift-muted">×{i.quantity}</span>
                    )}
                    <button
                      onClick={() => remove(i.id)}
                      aria-label="Remove item"
                      className="shrink-0 text-drift-text-tertiary opacity-0 transition-opacity hover:text-[#E7614B] group-hover:opacity-100"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </li>
                )
              })}
            </ul>
            <div className="mt-1.5">
              <KitAddRow category={c.key} onAdd={add} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <KitAddRow category="other" onAdd={add} placeholder="Add an item…" />
      </div>
    </div>
  )
}

// Inline "add an item" input — used at the end of each Kit category and the empty state.
function KitAddRow({
  category,
  onAdd,
  placeholder,
}: {
  category: string
  onAdd: (category: string, title: string) => void
  placeholder?: string
}) {
  const [text, setText] = useState("")
  const submit = () => {
    if (!text.trim()) return
    onAdd(category, text)
    setText("")
  }
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-dashed border-aurora-border px-4 py-2">
      <span className="text-[16px] leading-none text-drift-text-tertiary">+</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit()
        }}
        placeholder={placeholder ?? `Add to ${category}…`}
        className="min-w-0 flex-1 bg-transparent text-[14px] placeholder:text-drift-text-tertiary focus:outline-none"
      />
      {text.trim() && (
        <button onClick={submit} className="shrink-0 text-[13px] font-semibold text-aurora-teal">
          Add
        </button>
      )}
    </div>
  )
}

// Whole days until departure, only within a 3-week pre-trip window (else null).
function daysUntilDeparture(startDate: string | null): number | null {
  const d = startDate?.slice(0, 10)
  if (!d) return null
  const [y, m, day] = d.split("-").map(Number)
  if (!y || !m || !day) return null
  const start = Date.UTC(y, m - 1, day)
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const diff = Math.round((start - today) / 86_400_000)
  return diff >= 0 && diff <= 21 ? diff : null
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

const CATEGORY_COLOR: Record<string, string> = {
  stays: "#37D6C4",
  food: "#E7614B",
  activities: "#7F77DD",
  transport: "#378ADD",
  flights: "#E7A24B",
  shopping: "#D4537E",
  other: "#5F5E5A",
}

function ExpensesTab({
  expenses,
  ledger,
  budget,
  tripId,
  meId,
  members,
  isOwner,
}: {
  expenses: ExpenseVM[]
  ledger: LedgerVM | null
  budget: { amountUsd: number | null; startDate: string | null; endDate: string | null } | null
  tripId: string
  meId: string
  members: { id: string; name: string }[]
  isOwner: boolean
}) {
  const [facet, setFacet] = useState<"date" | "category">("date")
  const [editing, setEditing] = useState<ExpenseVM | "new" | null>(null)

  // Who can change a row: the person who paid it, or the trip owner (RLS-mirrored).
  const canEdit = (e: ExpenseVM) => isOwner || (e.payerUserId ?? null) === meId
  const openEdit = (e: ExpenseVM) => {
    if (canEdit(e)) setEditing(e)
  }

  if (!expenses.length) {
    return (
      <div className="mt-6 lg:max-w-2xl">
        <div className="rounded-[22px] border border-aurora-border bg-aurora-glass p-8 text-center">
          <p className="font-drift-display text-[19px] font-semibold">Track the trip&rsquo;s money</p>
          <p className="mx-auto mt-1.5 max-w-xs text-[14px] text-drift-muted">
            Add expenses as you go — Drift splits them and shows who owes whom.
          </p>
          <button
            onClick={() => setEditing("new")}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-aurora-teal px-5 py-2.5 text-[14px] font-semibold text-aurora-ink"
          >
            + Add an expense
          </button>
        </div>
        {editing && (
          <ExpenseForm
            expense={editing === "new" ? null : editing}
            tripId={tripId}
            meId={meId}
            members={members}
            canDelete={editing !== "new"}
            onClose={() => setEditing(null)}
          />
        )}
      </div>
    )
  }

  // Per-currency totals — never invent an FX rate.
  const totals = new Map<string, number>()
  for (const e of expenses) totals.set(e.currency, (totals.get(e.currency) ?? 0) + e.amount)
  const totalLabel = [...totals.entries()].map(([c, a]) => formatMoney(a, c)).join(" + ")
  const primaryCurrency = [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD"

  // My net + settle summary from the ledger (already in USD minor units).
  const myRow = ledger?.rows.find((r) => r.mine) ?? null
  const myNet = myRow?.netMinor ?? 0
  const settleCTA = buildSettleCTA(ledger, myNet)

  // Category breakdown within the primary currency (mixing currencies is meaningless).
  const catTotals = new Map<string, number>()
  for (const e of expenses)
    if (e.currency === primaryCurrency)
      catTotals.set(e.category, (catTotals.get(e.category) ?? 0) + e.amount)
  const catList = [...catTotals.entries()].sort((a, b) => b[1] - a[1])
  const primaryTotal = totals.get(primaryCurrency) ?? 0

  // Budget rail — USD budget vs USD spend, only when both are present.
  const spentUsd = expenses.filter((e) => e.currency === "USD").reduce((s, e) => s + e.amount, 0)
  const budgetUsd = budget?.amountUsd ?? 0
  const showBudget = budgetUsd > 0 && spentUsd > 0
  const budgetPct = showBudget ? Math.min(100, Math.round((spentUsd / budgetUsd) * 100)) : 0
  const pacePct = tripPacePct(budget?.startDate, budget?.endDate)

  const sorted = [...expenses].sort((a, b) => b.expense_date.localeCompare(a.expense_date))

  return (
    <div className="mt-6 lg:max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-drift-display text-[22px] font-semibold tracking-tight">Expenses</h2>
        <button
          onClick={() => setEditing("new")}
          className="rounded-full bg-aurora-teal px-4 py-2 text-[13px] font-semibold text-aurora-ink"
        >
          + Add
        </button>
      </div>
      {/* Hero — the personal question first: am I up or down? */}
      {myRow ? (
        <div className="rounded-[22px] border border-aurora-border bg-aurora-glass p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-drift-text-tertiary">
            Your household · {myNet > 0 ? "you get back" : myNet < 0 ? "you owe" : "all square"}
          </p>
          {myNet === 0 ? (
            <p className="mt-1 flex items-center gap-2 font-drift-display text-[26px] font-semibold">
              All square <span className="text-[19px]">✓</span>
            </p>
          ) : (
            <p className="mt-1 flex items-center gap-2">
              <span
                className="font-drift-display text-[34px] font-semibold tabular-nums"
                style={{ color: myNet > 0 ? "#37D6C4" : "#E7614B" }}
              >
                {usd(Math.abs(myNet))}
              </span>
              <span className="text-[20px]" style={{ color: myNet > 0 ? "#37D6C4" : "#E7614B" }}>
                {myNet > 0 ? "↗" : "↘"}
              </span>
            </p>
          )}
          {settleCTA && <p className="mt-3 text-[13px] text-drift-muted">{settleCTA}</p>}
          <p className="mt-2 text-[11px] text-drift-text-tertiary">
            Trip total {totalLabel}
            {ledger && ledger.rows.length > 1 ? ` · ${ledger.rows.length} households` : ""}
            {totals.size > 1 ? ` · ${totals.size} currencies` : ""}
          </p>
        </div>
      ) : (
        <div className="rounded-[22px] border border-aurora-border bg-aurora-glass p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-drift-text-tertiary">
            Trip total
          </p>
          <p className="mt-1 font-drift-display text-[30px] font-semibold tracking-tight tabular-nums">
            {totalLabel}
          </p>
        </div>
      )}

      {/* Budget burn-down with a pace tick (itinerary dates × actuals). */}
      {showBudget && (
        <div className="mt-4 rounded-[22px] border border-aurora-border bg-aurora-glass p-5">
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-drift-text-tertiary">
              Budget
            </p>
            <p className="text-[13px] font-semibold tabular-nums">
              {usd(Math.round(spentUsd * 100))}{" "}
              <span className="font-normal text-drift-text-tertiary">
                of {usd(Math.round(budgetUsd * 100))}
              </span>
            </p>
          </div>
          <div className="relative mt-3 h-2.5 rounded-full bg-aurora-midnight">
            <span
              className="block h-full rounded-full"
              style={{ width: `${budgetPct}%`, background: budgetPct >= 100 ? "#E7614B" : "#37D6C4" }}
            />
            {pacePct != null && (
              <span
                className="absolute -top-1 h-[18px] w-0.5 rounded bg-aurora-ink"
                style={{ left: `${pacePct}%` }}
              />
            )}
          </div>
          <p className="mt-2 text-[11.5px] text-drift-muted">
            {budgetPct}% used
            {pacePct != null ? ` · ${budgetPct > pacePct ? "ahead of pace" : "under pace"}` : ""}
          </p>
        </div>
      )}

      {/* Where it went — one stacked bar, labelled beside the values. */}
      {catList.length > 1 && (
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-drift-text-tertiary">
            Where it went{totals.size > 1 ? ` · in ${primaryCurrency}` : ""}
          </p>
          <div className="mt-2.5 flex h-2.5 gap-[2px] overflow-hidden rounded-full">
            {catList.map(([cat, amt]) => (
              <span key={cat} style={{ flexGrow: amt, background: CATEGORY_COLOR[cat] ?? "#5F5E5A" }} />
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1.5">
            {catList.slice(0, 5).map(([cat, amt]) => (
              <span key={cat} className="text-[11.5px] text-drift-muted">
                <span style={{ color: CATEGORY_COLOR[cat] ?? "#5F5E5A" }}>●</span> {humanCat(cat)}
                {primaryTotal ? ` · ${Math.round((amt / primaryTotal) * 100)}%` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Settle up — the minimum set of real payments. */}
      {ledger && ledger.transfers.length > 0 && (
        <div className="mt-4 rounded-[22px] border border-aurora-border bg-aurora-glass p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-drift-text-tertiary">
            Settle up · {ledger.transfers.length} payment{ledger.transfers.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-2.5 space-y-2">
            {ledger.transfers.map((t, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-xl bg-aurora-midnight px-3.5 py-2.5"
              >
                <span className="text-[14px]">
                  <span className="font-semibold">{t.from}</span> pays{" "}
                  <span className="font-semibold">{t.to}</span>
                </span>
                <span className="text-[15px] font-bold tabular-nums">{usd(t.amountMinor)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11.5px] leading-snug text-drift-text-tertiary">
            Drift never moves money — settle over Venmo, Cash App or cash, then record it in the iOS app.
          </p>
        </div>
      )}

      {/* The trip's spending diary — faceted, grouped, with running subtotals. */}
      <div className="mt-5 flex gap-1.5 rounded-xl bg-aurora-midnight p-1">
        {(["date", "category"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFacet(f)}
            className={`flex-1 rounded-lg py-1.5 text-[12.5px] font-medium transition-colors ${
              facet === f ? "bg-aurora-glass2 text-drift-ink" : "text-drift-muted"
            }`}
          >
            {f === "date" ? "By date" : "By category"}
          </button>
        ))}
      </div>
      <div className="mt-3">
        {facet === "date"
          ? renderByDate(sorted, openEdit, canEdit)
          : renderByCategory(sorted, openEdit, canEdit)}
      </div>

      {editing && (
        <ExpenseForm
          expense={editing === "new" ? null : editing}
          tripId={tripId}
          meId={meId}
          members={members}
          canDelete={editing !== "new"}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function ExpenseRow({
  e,
  onEdit,
  editable,
}: {
  e: ExpenseVM
  onEdit: (e: ExpenseVM) => void
  editable: boolean
}) {
  const inner = (
    <>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-aurora-midnight text-[17px]">
        {CATEGORY_EMOJI[e.category] ?? "💳"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{e.label}</p>
        <p className="truncate text-[12.5px] text-drift-muted">
          {[e.payer ? `${e.payer} paid` : null, e.subtitle, shortDay(e.expense_date.slice(0, 10))]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <span className="text-[15px] font-semibold tabular-nums">{formatMoney(e.amount, e.currency)}</span>
    </>
  )
  if (!editable) {
    return (
      <li className="flex items-center gap-3.5 rounded-2xl border border-aurora-border bg-aurora-glass px-4 py-3">
        {inner}
      </li>
    )
  }
  return (
    <li>
      <button
        onClick={() => onEdit(e)}
        className="flex w-full items-center gap-3.5 rounded-2xl border border-aurora-border bg-aurora-glass px-4 py-3 text-left transition-colors hover:border-aurora-teal/50"
      >
        {inner}
      </button>
    </li>
  )
}

function renderByDate(
  sorted: ExpenseVM[],
  onEdit: (e: ExpenseVM) => void,
  canEdit: (e: ExpenseVM) => boolean
) {
  const groups: { day: string; items: ExpenseVM[] }[] = []
  for (const e of sorted) {
    const day = e.expense_date.slice(0, 10)
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.items.push(e)
    else groups.push({ day, items: [e] })
  }
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.day}>
          <div className="flex items-baseline justify-between px-1 pb-1.5">
            <span className="text-[11.5px] font-semibold text-drift-muted">{formatDayLabel(g.day)}</span>
            <span className="text-[11.5px] tabular-nums text-drift-text-tertiary">
              {subtotalLabel(g.items)}
            </span>
          </div>
          <ul className="space-y-1.5">
            {g.items.map((e) => (
              <ExpenseRow key={e.id} e={e} onEdit={onEdit} editable={canEdit(e)} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function renderByCategory(
  sorted: ExpenseVM[],
  onEdit: (e: ExpenseVM) => void,
  canEdit: (e: ExpenseVM) => boolean
) {
  const byCat = new Map<string, ExpenseVM[]>()
  for (const e of sorted) {
    const arr = byCat.get(e.category)
    if (arr) arr.push(e)
    else byCat.set(e.category, [e])
  }
  const cats = [...byCat.entries()].sort((a, b) => b[1].length - a[1].length)
  return (
    <div className="space-y-4">
      {cats.map(([cat, items]) => (
        <div key={cat}>
          <div className="flex items-baseline justify-between px-1 pb-1.5">
            <span className="text-[11.5px] font-semibold text-drift-muted">
              {CATEGORY_EMOJI[cat] ?? "💳"} {humanCat(cat)}
            </span>
            <span className="text-[11.5px] tabular-nums text-drift-text-tertiary">
              {subtotalLabel(items)}
            </span>
          </div>
          <ul className="space-y-1.5">
            {items.map((e) => (
              <ExpenseRow key={e.id} e={e} onEdit={onEdit} editable={canEdit(e)} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function subtotalLabel(items: ExpenseVM[]): string {
  const m = new Map<string, number>()
  for (const e of items) m.set(e.currency, (m.get(e.currency) ?? 0) + e.amount)
  return [...m.entries()].map(([c, a]) => formatMoney(a, c)).join(" + ")
}

// "Collect from Maya and Ravi" / "Pay Sam's household" — derived from the ledger's
// minimal transfers, from the current user's ("You") perspective.
function buildSettleCTA(ledger: LedgerVM | null, myNet: number): string | null {
  if (!ledger || myNet === 0) return null
  if (myNet > 0) {
    const names = ledger.transfers.filter((t) => t.to === "You").map((t) => t.from)
    return names.length ? `Collect from ${humanList(names)}` : null
  }
  const names = ledger.transfers.filter((t) => t.from === "You").map((t) => t.to)
  return names.length ? `Pay ${humanList(names)}` : null
}

function humanList(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? ""
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`
}

// How far through the trip we are, 0–100, for the budget pace tick.
function tripPacePct(start: string | null | undefined, end: string | null | undefined): number | null {
  const s = start?.slice(0, 10)
  const e = end?.slice(0, 10)
  if (!s || !e) return null
  const sd = Date.parse(s)
  const ed = Date.parse(e)
  if (Number.isNaN(sd) || Number.isNaN(ed) || ed <= sd) return null
  const now = Date.now()
  if (now <= sd) return 0
  if (now >= ed) return 100
  return Math.round(((now - sd) / (ed - sd)) * 100)
}

function humanCat(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1)
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

// The 7 category values allowed by the expenses.category CHECK constraint.
const EXPENSE_CATEGORIES = [
  "food", "stays", "transport", "flights", "activities", "shopping", "other",
] as const

// Add / edit / delete an expense. Writes directly via the browser client
// (RLS: insert = any member own-paid; update/delete = payer or trip owner).
// Equal split is materialized by the DB trigger for split_mode='all_households'.
function ExpenseForm({
  expense,
  tripId,
  meId,
  members,
  canDelete,
  onClose,
}: {
  expense: ExpenseVM | null
  tripId: string
  meId: string
  members: { id: string; name: string }[]
  canDelete: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [label, setLabel] = useState(expense?.label ?? "")
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "")
  const [category, setCategory] = useState<string>(expense?.category ?? "food")
  const [date, setDate] = useState(
    (expense?.expense_date ?? new Date().toISOString()).slice(0, 10)
  )
  const [payer, setPayer] = useState<string>(expense?.payerUserId ?? meId)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const amt = Number(amount)
  const valid = label.trim().length > 0 && Number.isFinite(amt) && amt > 0

  const save = async () => {
    if (!valid || busy) return
    setBusy(true)
    setErr(null)
    const payload = {
      label: label.trim(),
      amount: Math.round(amt * 100) / 100,
      currency: "USD",
      category,
      expense_date: `${date}T12:00:00.000Z`,
      payer_user_id: payer,
    }
    const sb = supabase
    const res = expense
      ? await sb.from("expenses").update(payload).eq("id", expense.id).select("id")
      : await sb
          .from("expenses")
          .insert({ ...payload, trip_id: tripId, user_id: meId, source: "manual", split_mode: "all_households" })
          .select("id")
    if (res.error || !res.data?.length) {
      setErr("Couldn't save — only who paid or the trip owner can change an expense.")
      setBusy(false)
      return
    }
    router.refresh()
    onClose()
  }
  const del = async () => {
    if (!expense || busy) return
    setBusy(true)
    setErr(null)
    const res = await supabase.from("expenses").delete().eq("id", expense.id).select("id")
    if (res.error || !res.data?.length) {
      setErr("Couldn't delete — only who paid or the trip owner can remove an expense.")
      setBusy(false)
      return
    }
    router.refresh()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-[26px] border border-aurora-border bg-aurora-ink p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] [color-scheme:dark] sm:rounded-[26px] sm:pb-5"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-drift-display text-[19px] font-semibold">
            {expense ? "Edit expense" : "New expense"}
          </h3>
          <button onClick={onClose} className="text-[18px] text-drift-muted" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {EXPENSE_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
                category === c ? "bg-aurora-teal text-aurora-ink" : "bg-aurora-glass2 text-drift-muted"
              }`}
            >
              {CATEGORY_EMOJI[c]} {humanCat(c)}
            </button>
          ))}
        </div>

        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="What for? (e.g. Dinner at Septime)"
          className="mt-3 w-full rounded-xl border border-aurora-border bg-aurora-glass px-3.5 py-2.5 text-[15px] focus:border-aurora-teal focus:outline-none"
        />

        <div className="mt-2.5 flex gap-2.5">
          <div className="flex flex-1 items-center rounded-xl border border-aurora-border bg-aurora-glass px-3.5">
            <span className="text-[15px] text-drift-muted">$</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder="0.00"
              className="w-full bg-transparent py-2.5 pl-1 text-[15px] tabular-nums focus:outline-none"
            />
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border border-aurora-border bg-aurora-glass px-3 py-2.5 text-[14px] focus:border-aurora-teal focus:outline-none"
          />
        </div>

        {members.length > 1 && (
          <div className="mt-3">
            <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-drift-text-tertiary">
              Paid by
            </label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setPayer(m.id)}
                  className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
                    payer === m.id
                      ? "bg-aurora-glass2 text-drift-ink ring-1 ring-aurora-teal"
                      : "bg-aurora-glass2 text-drift-muted"
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] text-drift-text-tertiary">
              Split equally across {members.length} travelers.
            </p>
          </div>
        )}

        {err && <p className="mt-3 text-[12.5px] text-[#E7614B]">{err}</p>}

        <div className="mt-4 flex items-center gap-2">
          {canDelete && (
            <button
              onClick={del}
              disabled={busy}
              className="rounded-full px-4 py-2.5 text-[14px] font-semibold text-[#E7614B] disabled:opacity-50"
            >
              Delete
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="rounded-full px-4 py-2.5 text-[14px] font-semibold text-drift-muted">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!valid || busy}
            className="rounded-full bg-aurora-teal px-5 py-2.5 text-[14px] font-semibold text-aurora-ink disabled:opacity-50"
          >
            {busy ? "Saving…" : expense ? "Save" : "Add expense"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------- Track: the recorded journey ----------

// Mosaic grain for a moment's contact-sheet plate. Every class is spelled out
// as a literal: Tailwind's JIT scans source text, so `grid-cols-${n}` compiles
// to no CSS and the plate silently collapses to one column at natural height.
const BAND: Record<number, string> = {
  1: "grid-cols-1 grid-rows-1",
  2: "grid-cols-2 grid-rows-1",
  3: "grid-cols-3 grid-rows-2",
  4: "grid-cols-2 grid-rows-2",
  5: "grid-cols-4 grid-rows-2",
}
// Tile 0 spans 2x2 at 3 and 5 so auto-placement fills the rest exactly:
// n=3 -> hero + two stacked in col 3; n=5 -> hero + four across cols 3-4.
const heroSpan = (shown: number) =>
  shown === 3 || shown === 5 ? "col-span-2 row-span-2" : ""

function sizeFor(shown: number, i: number) {
  if (shown === 1) return "(max-width:1024px) 100vw, 500px"
  if (shown === 2 || shown === 4 || i === 0) return "(max-width:1024px) 50vw, 250px"
  return "(max-width:1024px) 25vw, 130px"
}

// Evaluated inside handlers, never at render — SSR has no window.
const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

function scrollToMoment(id: string, block: ScrollLogicalPosition) {
  document
    .getElementById(`moment-${id}`)
    ?.scrollIntoView({ block, behavior: prefersReduced() ? "auto" : "smooth" })
}

function TrackTab({
  steps,
  readiness,
  tripId,
}: {
  steps: TrackStepVM[]
  readiness?: TrackReadinessVM
  tripId: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const [placing, setPlacing] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [viewer, setViewer] = useState<{ stepId: string; i: number } | null>(null)
  const [day, setDay] = useState<string | "all">("all")

  // Group into days, preserving the server's chronological order.
  const days: { key: string; label: string; items: TrackStepVM[] }[] = []
  for (const s of steps) {
    const last = days[days.length - 1]
    if (last && last.key === s.dayKey) last.items.push(s)
    else days.push({ key: s.dayKey, label: s.dateLabel, items: [s] })
  }

  const visible = day === "all" ? steps : (days.find((d) => d.key === day)?.items ?? [])
  const located = visible.filter((s) => s.lat != null && s.lng != null)
  const points = located.map((s, i) => ({
    id: s.id,
    lat: s.lat as number,
    lng: s.lng as number,
    index: i + 1,
  }))
  const busiest = Math.max(1, ...days.map((d) => d.items.length))
  const tripPhotos = steps.reduce((a, s) => a + s.photoUrls.length, 0)

  // Keyboard review: ↑/↓ walk the journey. Reviewing twenty moments with the
  // keyboard is meaningfully faster than reaching for twenty tap targets, and
  // it is the kind of affordance a phone cannot offer at all.
  function onKey(e: React.KeyboardEvent) {
    // While the viewer is open the arrows belong to it, not the list.
    if (viewer) return
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    e.preventDefault()
    const idx = visible.findIndex((s) => s.id === selected)
    const next =
      e.key === "ArrowDown"
        ? Math.min(visible.length - 1, idx + 1)
        : Math.max(0, idx - 1)
    const target = visible[idx === -1 ? 0 : next]
    if (!target) return
    setSelected(target.id)
    scrollToMoment(target.id, "nearest")
  }

  // Drag a photo onto the map to place a moment where it was dropped.
  //
  // The moment is created FIRST and the upload attempted second, deliberately:
  // the coordinate and the photo's timestamp are the information worth keeping,
  // and a failed upload (browser→S3 needs bucket CORS) should not cost you the
  // moment. If the upload fails the moment still stands and we say so.
  //
  // The step is inserted DIRECTLY rather than through applyCreateStep/quick-op.
  // quick-op is a Plan-tab writer: its validator hard-requires a resolvable
  // destination_ref, and apply-quick-op then always stamps parent_step_id onto
  // the row. Track lists only UNPARENTED steps, so a quick-op step is
  // structurally invisible here — it cannot produce a Track moment at all.
  // The direct insert is not a privilege escalation: the steps INSERT policy is
  // owner-or-accepted-buddy, the same rule apply-quick-op re-implements by hand
  // with the service role.
  async function placeFromPhoto(file: File, lat: number, lng: number) {
    if (placing) return
    setPlacing("Placing moment…")
    try {
      const taken = new Date(file.lastModified)
      const day = taken.toISOString().slice(0, 10)
      const time = taken.toTimeString().slice(0, 5)
      // media.user_id is NOT NULL and its RLS pins it to auth.uid(), so an
      // expired session has to fail here rather than at the wire.
      const { data: userRes } = await supabase.auth.getUser()
      const userId = userRes?.user?.id
      if (!userId) throw new Error("no session")

      const { data: step, error: stepErr } = await supabase
        .from("steps")
        .insert({
          trip_id: tripId,
          date: day,
          title: file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Moment",
          latitude: lat,
          longitude: lng,
          // Floating wall clock (the iOS StepClock contract) — the literal
          // HH:mm IS the destination's time, so write it with a Z offset and
          // never convert.
          scheduled_at: `${day}T${time}:00+00:00`,
          nights: 0,
        })
        .select("id")
        .single()
      if (stepErr || !step?.id) throw stepErr ?? new Error("no step id")

      setPlacing("Uploading photo…")
      try {
        // Send a key-SAFE filename, never file.name. generate-upload-url signs
        // the raw key (`${user.id}/${filename}`) — unlike its own read branch,
        // which encodes each segment because "S3 requires single encoding" —
        // while the browser percent-encodes the URL path before sending. Any
        // space or '#' therefore signs one path and requests another, and S3
        // answers 403 SignatureDoesNotMatch. Dropped files are precisely where
        // odd names live ("Screenshot 2026-08-06 at 10.14.32.png").
        //
        // Keying on the step id also makes the object unique, so two photos
        // that happen to share a name cannot overwrite each other in S3.
        const ext = file.name.match(/\.[A-Za-z0-9]+$/)?.[0].toLowerCase() ?? ""
        const res = await fetch("/api/drift/upload-url", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            filename: `track-${step.id}${ext}`,
            contentType: file.type,
          }),
        })
        if (!res.ok) throw new Error(String(res.status))
        // The route returns { presignedUrl, cdnUrl } — NOT uploadUrl.
        const { presignedUrl, cdnUrl } = await res.json()
        if (!presignedUrl || !cdnUrl) throw new Error("no presigned url")
        const put = await fetch(presignedUrl, {
          method: "PUT",
          headers: { "content-type": file.type },
          body: file,
        })
        if (!put.ok) throw new Error(`PUT ${put.status}`)
        // Link the photo to the moment — ONLY after the bytes have landed. A
        // media row whose url points at a missing object renders a broken image
        // on Track and can be picked up as the trip cover. Plain .insert, never
        // .upsert: media has no UPDATE policy, so ON CONFLICT DO UPDATE is a
        // 42501, and the id is server-generated so there is nothing to conflict
        // on. Omitted columns take their defaults (id, type='photo', now()).
        const { error: mediaErr } = await supabase.from("media").insert({
          trip_id: tripId,
          step_id: step.id,
          user_id: userId,
          url: cdnUrl,
        })
        if (mediaErr) throw mediaErr
      } catch {
        setPlacing("Moment placed — the photo could not be saved")
        setTimeout(() => setPlacing(null), 3200)
        router.refresh()
        return
      }
      setPlacing(null)
      setSelected(step.id)
      router.refresh()
    } catch {
      setPlacing("Could not place that moment — try again")
      setTimeout(() => setPlacing(null), 3200)
    }
  }

  // Before a trip there is no journey to show, so Track shows READINESS —
  // the same four categories and countdown as the iOS UpcomingTrackHero,
  // widened into a row instead of stacked.
  if (!steps.length) {
    const upcoming =
      readiness != null &&
      readiness.nightsUntilStart != null &&
      readiness.nightsUntilStart > 0
    if (upcoming && readiness) {
      const pct = Math.round(readiness.pct * 100)
      const missing = readiness.categories.filter((c) => !c.done)
      return (
        <div className="mt-6 max-w-3xl">
          <p className="font-drift-display text-[28px] font-semibold tracking-tight">
            {readiness.nightsUntilStart} night
            {readiness.nightsUntilStart === 1 ? "" : "s"} until you wander
          </p>
          <p className="mt-1 text-[14px] text-drift-muted">
            {pct >= 100
              ? "You're trip-ready."
              : missing.length === 1
                ? `Almost there — ${missing[0].label.toLowerCase()} still to sort.`
                : `${missing.length} things still to sort.`}
          </p>

          <div className="mt-4 flex items-center gap-3">
            <div
              className="h-2 flex-1 overflow-hidden rounded-full bg-aurora-glass2"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Trip readiness"
            >
              <div
                className="h-2 rounded-full bg-drift-coral transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[13px] font-bold tabular-nums">{pct}%</span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {readiness.categories.map((c) => (
              <div
                key={c.key}
                className={`rounded-xl border p-3 ${
                  c.done
                    ? "border-aurora-border bg-aurora-glass"
                    : "border-dashed border-drift-coral/45 bg-drift-coral/5"
                }`}
              >
                <p className="text-[12px] font-semibold text-drift-text-tertiary">
                  {c.label}
                </p>
                <p
                  className={`mt-0.5 text-[14px] font-bold ${
                    c.done ? "text-aurora-teal" : "text-drift-coral"
                  }`}
                >
                  {c.done ? "Ready" : "Not yet"}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-6 text-[13px] text-drift-text-tertiary">
            Once you are travelling, your recorded moments appear here as a
            journey — recording itself happens in the iOS app.
          </p>
        </div>
      )
    }
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

  return (
    <div className="mt-5">
      <div className="flex items-baseline gap-2">
        <h2 className="font-drift-display text-[24px] font-semibold tracking-tight">
          Your journey
        </h2>
        <span className="text-[13px] tabular-nums text-drift-text-tertiary">
          {steps.length} moment{steps.length === 1 ? "" : "s"} · {days.length} day
          {days.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Day scrubber — each pill carries its own density, so where the trip
          was busy reads at a glance rather than needing a click. */}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        <ScrubPill
          on={day === "all"}
          label="All days"
          sub={`${steps.length} moments`}
          fill={1}
          onClick={() => setDay("all")}
        />
        {days.map((d, i) => (
          <ScrubPill
            key={d.key || i}
            on={day === d.key}
            label={`Day ${i + 1}`}
            sub={`${d.label} · ${d.items.length}`}
            fill={d.items.length / busiest}
            onClick={() => setDay(d.key)}
          />
        ))}
      </div>

      {/* Linked two-pane. On a phone the map stacks above the list; from lg it
          sits beside it and both halves share one selection. */}
      {placing && (
        <p
          role="status"
          className="mt-3 rounded-lg border border-aurora-border bg-aurora-glass px-3 py-2 text-[13px]"
        >
          {placing}
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div
          tabIndex={0}
          onKeyDown={onKey}
          aria-label="Journey moments. Use up and down arrows to review."
          className="order-2 max-h-[560px] overflow-y-auto rounded-2xl pr-1 lg:max-h-[640px] outline-none focus-visible:ring-2 focus-visible:ring-drift-coral lg:order-1"
        >
          {(day === "all" ? days : days.filter((d) => d.key === day)).map((d, di) => (
            <div key={d.key || di}>
              <div className="sticky top-0 z-10 flex items-baseline gap-2 bg-aurora-midnight/85 py-2 backdrop-blur">
                <span className="font-drift-display text-[16px] font-semibold">
                  Day {days.findIndex((x) => x.key === d.key) + 1}
                </span>
                <span className="text-[12px] tabular-nums text-drift-text-tertiary">
                  {d.label} · {d.items.length} moment{d.items.length === 1 ? "" : "s"}
                </span>
                {tripPhotos > 0 &&
                  (() => {
                    const dp = d.items.reduce((a, s) => a + s.photoUrls.length, 0)
                    return (
                      <span className="ml-auto shrink-0 text-[11.5px] tabular-nums text-drift-text-tertiary">
                        {dp === 0 ? "No photos" : `${dp} photo${dp === 1 ? "" : "s"}`}
                      </span>
                    )
                  })()}
              </div>
              {d.items.map((s) => {
                const n = located.findIndex((x) => x.id === s.id)
                const photos = s.photoUrls
                const shown = Math.min(photos.length, 5)
                const isSel = selected === s.id
                return (
                  <article
                    key={s.id}
                    id={`moment-${s.id}`}
                    className={`mb-3 rounded-[18px] border transition-colors ${
                      isSel
                        ? "border-drift-coral bg-aurora-glass"
                        : "border-transparent hover:border-aurora-border hover:bg-aurora-glass/60"
                    }`}
                  >
                    <button
                      onClick={() => setSelected(s.id)}
                      aria-current={isSel ? "true" : undefined}
                      className={`flex w-full items-center gap-3 rounded-[16px] text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-drift-coral ${
                        shown > 0 ? "px-3 pb-2.5 pt-3" : "p-3"
                      }`}
                    >
                      {n >= 0 ? (
                        // The medallion IS the map pin's number, so it uses the
                        // same accent the pin does (drift-coral is re-pointed to
                        // Aurora teal) on teal-ink, not white — white on this
                        // fill is ~1.9:1.
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-drift-coral text-[12px] font-bold tabular-nums text-aurora-teal-ink">
                          {n + 1}
                        </span>
                      ) : (
                        <span
                          title="No location recorded"
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-aurora-glass2 text-[11px] text-drift-text-tertiary"
                        >
                          –
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[16px] font-semibold leading-tight">
                          {s.title}
                        </span>
                        {s.subtitle && (
                          <span className="mt-0.5 block truncate text-[12.5px] text-drift-text-tertiary">
                            {s.subtitle}
                          </span>
                        )}
                      </span>
                      {s.timeLabel && (
                        <span className="shrink-0 text-[12.5px] font-bold tabular-nums text-drift-muted">
                          {s.timeLabel}
                        </span>
                      )}
                    </button>

                    {shown > 0 && (
                      // aurora-border shows through the 2px gaps as hairline
                      // seams, so the band reads as ONE contact-sheet plate
                      // rather than loose chips.
                      <div
                        className={`relative mx-3 mb-3 grid aspect-[16/10] max-h-[340px] gap-[2px] overflow-hidden rounded-[14px] bg-aurora-border ${BAND[shown]}`}
                      >
                        {photos.slice(0, shown).map((u, i) => {
                          const more = i === 4 && photos.length > 5
                          return (
                            <button
                              key={`${s.id}-${i}`}
                              id={`photo-${s.id}-${i}`}
                              onClick={() => {
                                setSelected(s.id)
                                setViewer({ stepId: s.id, i })
                              }}
                              aria-label={
                                more
                                  ? `Show all ${photos.length} photos from ${s.title}`
                                  : `Open photo ${i + 1} of ${photos.length} from ${s.title}`
                              }
                              className={`relative overflow-hidden bg-aurora-glass2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-drift-coral ${
                                i === 0 ? heroSpan(shown) : ""
                              }`}
                            >
                              <OptimizedImg
                                src={u}
                                alt=""
                                fill
                                sizes={sizeFor(shown, i)}
                                className="absolute inset-0 h-full w-full object-cover"
                              />
                              {more && (
                                <span className="absolute inset-0 grid place-items-center bg-aurora-midnight/60 text-[15px] font-bold text-white">
                                  +{photos.length - 5}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          ))}
        </div>

        <div className="order-1 h-[300px] overflow-hidden rounded-2xl border border-aurora-border lg:sticky lg:top-4 lg:order-2 lg:h-[640px]">
          {points.length ? (
            <TrackMap
              points={points}
              selectedId={selected}
              onSelect={(id) => {
                setSelected(id)
                scrollToMoment(id, "center")
              }}
              onDropPhoto={placeFromPhoto}
            />
          ) : (
            <div className="grid h-full place-items-center px-6 text-center text-[13px] text-drift-text-tertiary">
              These moments have no location recorded, so there is nothing to map
              yet.
            </div>
          )}
        </div>
      </div>

      {viewer &&
        (() => {
          const st = steps.find((x) => x.id === viewer.stepId)
          if (!st || !st.photoUrls.length) return null
          return (
            <MomentViewer
              title={st.title}
              photos={st.photoUrls}
              index={viewer.i}
              onIndex={(i) => setViewer({ stepId: viewer.stepId, i })}
              onClose={() => {
                // Return focus to the tile that opened it, after unmount.
                const el = document.getElementById(
                  `photo-${viewer.stepId}-${Math.min(viewer.i, 4)}`
                )
                setViewer(null)
                requestAnimationFrame(() => el?.focus())
              }}
            />
          )
        })()}
    </div>
  )
}

function ScrubPill({
  on,
  label,
  sub,
  fill,
  onClick,
}: {
  on: boolean
  label: string
  sub: string
  fill: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`shrink-0 rounded-xl border px-3 py-2 text-left transition-colors ${
        on
          ? "border-drift-coral bg-drift-coral/10"
          : "border-aurora-border hover:bg-aurora-glass2"
      }`}
    >
      <span className="block text-[12.5px] font-bold">{label}</span>
      <span className="block text-[11px] tabular-nums text-drift-text-tertiary">
        {sub}
      </span>
      <span className="mt-1.5 block h-1 w-full rounded-full bg-aurora-glass2">
        <span
          className="block h-1 rounded-full bg-drift-coral"
          style={{ width: `${Math.round(fill * 100)}%` }}
        />
      </span>
    </button>
  )
}

/// The day's notes, plus the affordance to add one — on the day screen, where
/// someone is actually looking at that day.
///
/// Renders the same link chip as the rollup and as iOS: a note is frequently
/// just a pasted Maps URL, and raw it is neither readable nor tappable.
function DayNotes({
  notes,
  tripId,
  destId,
  date,
  canWrite,
}: {
  notes: TripNote[]
  tripId: string
  destId: string
  date: string
  canWrite: boolean
}) {
  const router = useRouter()
  const [composing, setComposing] = useState(false)
  const [text, setText] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const body = text.trim()
    if (!body || saving) return
    setSaving(true)
    setError(null)
    try {
      const db = createClient()
      const { data: userRes } = await db.auth.getUser()
      const uid = userRes?.user?.id
      if (!uid) throw new Error("You need to be signed in to add a note.")
      await db
        .from("steps")
        .insert({
          trip_id: tripId,
          parent_step_id: destId,
          step_type: "note",
          date: date.slice(0, 10),
          notes: body,
          // The 80-char mirror iOS's noteRow falls back to, and the author
          // stamp without which the note is authorless on the phone.
          location_name: body.slice(0, 80),
          author_id: uid,
        })
        .throwOnError()
      setText("")
      setComposing(false)
      router.refresh()
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Couldn't save that note.")
    }
    setSaving(false)
  }

  if (notes.length === 0 && !canWrite) return null

  return (
    <div className="mb-3">
      {notes.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {notes.map((n) => {
            const { text: body, url } = splitNoteURL(n.body)
            return (
              <li key={n.id} className="rounded-xl bg-drift-alt-bg px-3 py-2.5">
                {body && <p className="whitespace-pre-wrap text-[13.5px] leading-snug">{body}</p>}
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${body ? "mt-1.5" : ""}`}
                    style={{ background: "rgba(55,214,196,0.14)", color: "#37D6C4" }}
                  >
                    <span aria-hidden="true">{isMapsURL(url) ? "📍" : "🔗"}</span>
                    {isMapsURL(url) ? "View on Google Maps" : "Open link"}
                  </a>
                )}
                {n.authorName && (
                  <p className="mt-1.5 text-[11px] text-drift-text-tertiary">{n.authorName}</p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {error && (
        <p className="mb-1.5 text-[12px]" style={{ color: "rgba(255,140,130,0.95)" }}>
          {error}
        </p>
      )}

      {canWrite &&
        (composing ? (
          <div className="rounded-xl bg-drift-alt-bg p-2.5">
            <textarea
              autoFocus
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Reminders, ideas, a link…"
              className="w-full resize-none rounded-lg border border-aurora-border bg-black/25 px-2.5 py-1.5 text-[13.5px] outline-none focus:border-aurora-teal/60"
            />
            <div className="mt-1.5 flex justify-end gap-2">
              <button
                onClick={() => {
                  setComposing(false)
                  setText("")
                }}
                className="px-2 text-[12.5px] font-semibold text-drift-muted"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || !text.trim()}
                className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-aurora-teal-ink disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #37D6C4, #22B7D4)" }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setComposing(true)}
            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-aurora-border px-3 py-2 text-[12.5px] font-semibold text-drift-muted transition-colors hover:border-aurora-teal/50 hover:text-drift-ink"
          >
            <span aria-hidden="true">🗒️</span> Add a note for this day
          </button>
        ))}
    </div>
  )
}
