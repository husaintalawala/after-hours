"use client"

import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"

// Background-scan status chip for the trip Plan tab. Gmail / Google-Calendar
// scans run ~90s server-side (they write an import_batches row up front as
// `scanning`, then `review_ready` with counts). The UI never blocks on them —
// it fires the scan and this chip polls the batch, surfacing:
//   scanning      → shimmer "Scanning your Gmail…"
//   review_ready  → coral "Found N bookings — review & add"  (tap → review)
//   failed        → quiet, dismissable
// Manual sources (paste/pdf/.ics) are synchronous and shown in the sheet, so
// they're excluded here.

const BG_SOURCES = ["gmail", "google_calendar"]

const SOURCE_LABEL: Record<string, string> = {
  gmail: "Gmail",
  google_calendar: "Google Calendar",
}

interface Batch {
  id: string
  source: string
  status: string
  segments_total: number | null
  segments_matched: number | null
  segments_applied: number | null
  created_at: string
}

// The live scan session (booking_import_sessions) — the rich, phase-by-phase
// progress the edge fn writes while a Gmail scan runs. iOS parity: a progress
// ring + real phase message + a "N found" count that ticks up. Gmail writes it;
// calendar doesn't → the flat "Scanning…" fallback still covers that.
interface SessionRow {
  id: string
  status: string
  current_phase: string | null
  progress: number | null
  message: string | null
  found_counts: { parsed?: number | null; matched?: number | null } | null
  source: string
}

export default function ScanStatus({
  tripId,
  refreshNonce,
  onReview,
}: {
  tripId: string
  refreshNonce: number
  onReview: (batchId: string) => void
}) {
  const [batch, setBatch] = useState<Batch | null>(null)
  const [session, setSession] = useState<SessionRow | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    let tries = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createClient() as any
    const load = async () => {
      const { data } = await db
        .from("import_batches")
        .select("id,source,status,segments_total,segments_matched,segments_applied,created_at")
        .eq("trip_id", tripId)
        .in("source", BG_SOURCES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelled) return
      const b = (data as Batch | null) ?? null
      setBatch(b)
      tries++
      // Poll while a scan is in flight; also burst-poll briefly right after a
      // scan was kicked off (refreshNonce>0) so we catch the batch the moment
      // the edge fn creates it.
      const scanning = b?.status === "scanning"
      const bursting = refreshNonce > 0 && !scanning && tries < 16
      if (scanning || bursting) {
        timer.current = setTimeout(load, scanning ? 4000 : 2500)
      }
    }
    load()
    return () => {
      cancelled = true
      if (timer.current) clearTimeout(timer.current)
    }
  }, [tripId, refreshNonce])

  // Live scan session — discover the running booking_import_sessions row
  // (source-agnostic, newest first, same as iOS) and poll it ~1s for phase
  // ticks. Before it exists, burst-poll briefly after a kickoff to catch it;
  // give up when nothing turns up (calendar → no session → flat fallback).
  useEffect(() => {
    let cancelled = false
    let t: ReturnType<typeof setTimeout> | null = null
    let tries = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createClient() as any
    const poll = async () => {
      const { data } = await db
        .from("booking_import_sessions")
        .select("id,status,current_phase,progress,message,found_counts,source")
        .eq("trip_id", tripId)
        .in("status", ["queued", "running"])
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelled) return
      const s = (data as SessionRow | null) ?? null
      setSession(s)
      tries++
      if (s) t = setTimeout(poll, 1000)
      else if (refreshNonce > 0 && tries < 18) t = setTimeout(poll, 1500)
    }
    poll()
    return () => {
      cancelled = true
      if (t) clearTimeout(t)
    }
  }, [tripId, refreshNonce])

  // Live session wins — the rich phase card, even before the batch row loads.
  // Once the session goes terminal it clears and the batch-driven states below
  // (Found N / nothing / failed) take over.
  if (session) {
    const lsrc = SOURCE_LABEL[session.source] ?? "Gmail"
    const found = session.found_counts?.parsed ?? 0
    const pct = Math.max(0.05, Math.min(1, session.progress ?? 0))
    const msg = session.message?.trim() || phaseMessage(session.current_phase)
    return (
      <div className="mt-3 flex items-center gap-3 rounded-2xl border border-aurora-teal/45 bg-aurora-glass p-3.5 shadow-[0_0_28px_-10px_rgba(55,214,196,0.4)]">
        <Ring pct={pct} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-semibold text-drift-ink">
              Scanning your {lsrc}
            </span>
            {found > 0 && (
              <span className="shrink-0 rounded-full bg-aurora-teal px-2 py-0.5 text-[10.5px] font-bold text-[#04231F]">
                {found} found
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-drift-muted">{msg}</div>
        </div>
      </div>
    )
  }

  if (!batch || dismissed.has(batch.id)) return null

  const src = SOURCE_LABEL[batch.source] ?? "inbox"
  const matched = batch.segments_matched ?? 0
  const unapplied = matched - (batch.segments_applied ?? 0)
  const ready = batch.status === "review_ready" || batch.status === "partial"
  const dismiss = () => setDismissed((s) => new Set(s).add(batch.id))

  if (batch.status === "scanning") {
    return (
      <div className="mt-3 flex items-center gap-3 rounded-2xl border border-drift-divider bg-aurora-glass p-3.5">
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-drift-coral/30 border-t-drift-coral" />
        <span className="text-[13.5px] font-medium text-drift-ink">
          Scanning your {src} for bookings…{" "}
          <span className="text-drift-muted">keep planning, we&apos;ll drop them here.</span>
        </span>
      </div>
    )
  }

  if (ready && unapplied > 0) {
    return (
      <button
        onClick={() => onReview(batch.id)}
        className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-drift-coral/45 bg-drift-coral-50 p-3.5 text-left transition-transform hover:-translate-y-0.5"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-drift-coral text-[15px] text-white">
          ✦
        </span>
        <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-drift-ink">
          Found {unapplied} booking{unapplied === 1 ? "" : "s"} in your {src} — review &amp; add
        </span>
        <span className="shrink-0 text-[17px] text-drift-coral">→</span>
      </button>
    )
  }

  if (ready && matched === 0) {
    return <Dismissable text={`No new bookings found in your ${src}.`} onDismiss={dismiss} />
  }

  if (batch.status === "failed") {
    return (
      <Dismissable
        text={`Couldn't finish scanning your ${src}. Try again, or forward/paste a confirmation.`}
        onDismiss={dismiss}
      />
    )
  }

  return null
}

function phaseMessage(phase: string | null): string {
  switch (phase) {
    case "fetching":
      return "Connecting to your inbox…"
    case "filtering":
      return "Filtering candidate emails"
    case "reading_attachments":
      return "Reading likely confirmations"
    case "extracting":
      return "Extracting bookings"
    case "matching":
      return "Matching to your trip"
    default:
      return "Scanning… keep planning"
  }
}

// Progress ring around a mail glyph — the live scan card's leading accessory.
function Ring({ pct }: { pct: number }) {
  const r = 15
  const c = 2 * Math.PI * r
  const off = c * (1 - pct)
  return (
    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
      <svg width="36" height="36" viewBox="0 0 36 36" className="-rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke="#37D6C4"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <svg
        className="absolute"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#37D6C4"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <path d="m3.5 7 8.5 6 8.5-6" />
      </svg>
    </span>
  )
}

function Dismissable({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <div className="mt-3 flex items-center gap-3 rounded-2xl border border-drift-divider bg-drift-alt-bg p-3.5">
      <span className="min-w-0 flex-1 text-[13px] text-drift-muted">{text}</span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 text-drift-text-tertiary transition-colors hover:text-drift-ink"
      >
        ✕
      </button>
    </div>
  )
}
