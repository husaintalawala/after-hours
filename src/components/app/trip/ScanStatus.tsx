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

export default function ScanStatus({
  tripId,
  refreshNonce,
  onReview,
}: {
  tripId: string
  refreshNonce: number
  onReview: () => void
}) {
  const [batch, setBatch] = useState<Batch | null>(null)
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

  if (!batch || dismissed.has(batch.id)) return null

  const src = SOURCE_LABEL[batch.source] ?? "inbox"
  const matched = batch.segments_matched ?? 0
  const unapplied = matched - (batch.segments_applied ?? 0)
  const ready = batch.status === "review_ready" || batch.status === "partial"
  const dismiss = () => setDismissed((s) => new Set(s).add(batch.id))

  if (batch.status === "scanning") {
    return (
      <div className="mt-3 flex items-center gap-3 rounded-2xl border border-drift-divider bg-white p-3.5">
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
        onClick={onReview}
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
