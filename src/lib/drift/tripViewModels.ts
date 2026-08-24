// The trip workspace's data contract: the shapes the trip page builds on the
// server and TripTabs renders on the client.
//
// These lived inside TripTabs.tsx, which is a "use client" module — so the
// server page had to import its own output contract from the component that
// consumes it, and nobody could read the contract without opening a 3,000-line
// client file. Neither side owns these; both import them from here.

import type { DestinationDay } from "./timeline"

export interface DestinationVM {
  id: string
  label: string
  country: string | null
  nights: number
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
  /** Non-null only when `cover` came from a sourced stock photo. Rendering the
   *  photo without this credit is an Unsplash ToS violation. */
  coverCredit?: { text: string; href: string | null } | null
}

/** Pre-trip readiness, computed server-side from raw step + booking rows. */
export interface TrackReadinessVM {
  categories: { key: string; label: string; done: boolean }[]
  pct: number
  nightsUntilStart: number | null
}

export interface TrackStepVM {
  id: string
  title: string
  subtitle: string | null
  dateLabel: string
  /** yyyy-MM-dd — groups moments into days and drives the scrubber. */
  dayKey: string
  /** HH:mm from scheduled_at, when the moment carries a time. */
  timeLabel: string | null
  lat: number | null
  lng: number | null
  /** Photos attached to this moment (media.url), oldest first. Capped at 12.
   *  Always an array — the no-photo case is [], so nothing branches on null. */
  photoUrls: string[]
}

export interface StepDetailVM {
  id: string
  title: string
  badge: string
  dateLabel: string | null
  timeLabel: string | null
  durationMinutes: number | null
  notes: string | null
  /** Raw yyyy-MM-dd (the step's day) + HH:mm (from scheduled_at) for inline editing. */
  rawDate: string | null
  rawTime: string | null
  address: string | null
  lat: number | null
  lng: number | null
  bookingUrl: string | null
  websiteUrl: string | null
  importProvider: string | null
  confirmationNumber: string | null
  guestCount: number | null
  /** Trip Table attribution: steps.author_id, and its resolved first name.
   *  authorName is null when the author's profile row is gone (deleted
   *  account) — the row then falls back to "a trip member". */
  authorId: string | null
  authorName: string | null
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
  payerUserId?: string | null
}

export interface LedgerVM {
  rows: Array<{ label: string; mine: boolean; netMinor: number }>
  transfers: Array<{ from: string; to: string; amountMinor: number }>
}

export interface KitItemVM {
  id: string
  title: string
  category: string
  phase: string
  state: string
  quantity: number
}
