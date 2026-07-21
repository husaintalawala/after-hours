"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

// Find my bookings — web port of the iOS booking-import review flow.
// Two intake paths surfaced here:
//   1. The trip's forwarding address (email_aliases) — forward confirmation
//      emails and segments appear in the review list.
//   2. Paste confirmation text → parse-text edge fn → parsed segments.
// Review list shows every unapplied segment for the trip (checkbox select),
// then apply-import-batch turns the accepted ones into real trip objects.

interface SegmentVM {
  id: string
  batchId: string | null
  category: string
  label: string
  sub: string
  needsReview: boolean
}

const CATEGORY_ICON: Record<string, string> = {
  flight: "✈️",
  train: "🚄",
  bus: "🚌",
  ferry: "⛴",
  car: "🚗",
  stay: "🏨",
  hotel: "🏨",
  activity: "🎟",
  restaurant: "🍽",
}

export default function FindBookings({ tripId }: { tripId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-drift-coral/40 bg-white px-3.5 py-1.5 text-[13px] font-semibold text-drift-coral transition-colors hover:bg-drift-coral-50"
      >
        ✉️ Find bookings
      </button>
      {open && (
        <FindBookingsSheet
          tripId={tripId}
          onClose={(didApply) => {
            setOpen(false)
            if (didApply) router.refresh()
          }}
        />
      )}
    </>
  )
}

function FindBookingsSheet({
  tripId,
  onClose,
}: {
  tripId: string
  onClose: (didApply: boolean) => void
}) {
  const [alias, setAlias] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pasteText, setPasteText] = useState("")
  const [parsing, setParsing] = useState(false)
  const [segments, setSegments] = useState<SegmentVM[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loadingSegments, setLoadingSegments] = useState(true)
  const [applying, setApplying] = useState(false)
  const [appliedCount, setAppliedCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const didApply = useMemo(() => appliedCount != null && appliedCount > 0, [appliedCount])

  // The trip's forwarding address (trigger-created on trip insert).
  useEffect(() => {
    const db = createClient() as any
    db.from("email_aliases")
      .select("email_address")
      .eq("trip_id", tripId)
      .eq("is_active", true)
      .limit(1)
      .then(({ data }: { data: { email_address: string }[] | null }) => {
        setAlias(data?.[0]?.email_address ?? null)
      })
  }, [tripId])

  async function loadSegments() {
    setLoadingSegments(true)
    const db = createClient() as any
    // All unapplied segments for the trip (paste-parsed AND email-forwarded).
    const { data: segs } = await db
      .from("reservation_segments")
      .select(
        "id, category, origin_name, destination_name, starts_at, address, confirmation_number, needs_review, parsed_reservation_id, applied_at"
      )
      .eq("trip_id", tripId)
      .is("applied_at", null)
      .order("created_at", { ascending: false })
      .limit(50)
    const rows: any[] = segs ?? []

    // Map each segment to its batch via parsed_reservations.batch_id
    // (apply-import-batch is keyed by batch).
    const resIds = [...new Set(rows.map((r) => r.parsed_reservation_id).filter(Boolean))]
    const batchByRes = new Map<string, string | null>()
    if (resIds.length > 0) {
      const { data: res } = await db
        .from("parsed_reservations")
        .select("id, batch_id")
        .in("id", resIds)
      for (const r of res ?? []) batchByRes.set(r.id, r.batch_id)
    }

    const vms: SegmentVM[] = rows.map((r) => {
      const route =
        r.origin_name && r.destination_name
          ? `${r.origin_name} → ${r.destination_name}`
          : r.destination_name || r.origin_name || r.address || "Booking"
      const when = r.starts_at
        ? new Date(r.starts_at).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })
        : null
      return {
        id: r.id,
        batchId: batchByRes.get(r.parsed_reservation_id) ?? null,
        category: r.category ?? "booking",
        label: route,
        sub: [cap(r.category), when, r.confirmation_number ? `#${r.confirmation_number}` : null]
          .filter(Boolean)
          .join(" · "),
        needsReview: !!r.needs_review,
      }
    })
    setSegments(vms)
    setSelected(new Set(vms.filter((v) => v.batchId).map((v) => v.id)))
    setLoadingSegments(false)
  }

  useEffect(() => {
    loadSegments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId])

  async function copyAlias() {
    if (!alias) return
    try {
      await navigator.clipboard.writeText(alias)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard denied — the address is still visible to select */
    }
  }

  async function parsePaste() {
    const text = pasteText.trim()
    if (!text || parsing) return
    setParsing(true)
    setError(null)
    try {
      const res = await fetch("/api/drift/parse-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip_id: tripId, source: "paste", text }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? "Couldn't read that confirmation")
      }
      setPasteText("")
      await loadSegments()
      if (!json.batch_id) {
        setError("Parsed, but no bookings were recognized in that text.")
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Parse failed")
    }
    setParsing(false)
  }

  async function applySelected() {
    if (applying || selected.size === 0) return
    setApplying(true)
    setError(null)
    // Group accepted segments by batch — apply-import-batch is per-batch.
    const byBatch = new Map<string, string[]>()
    for (const s of segments) {
      if (!selected.has(s.id) || !s.batchId) continue
      const list = byBatch.get(s.batchId) ?? []
      list.push(s.id)
      byBatch.set(s.batchId, list)
    }
    let applied = 0
    try {
      for (const [batchId, ids] of byBatch) {
        const res = await fetch("/api/drift/apply-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batch_id: batchId, segment_ids: ids }),
        })
        const json = await res.json().catch(() => null)
        if (res.ok && json?.ok) applied += (json.applied ?? []).length
        else throw new Error(json?.error ?? "Apply failed")
      }
      setAppliedCount(applied)
      await loadSegments()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed")
    }
    setApplying(false)
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={() => onClose(didApply)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[24px] bg-white shadow-2xl sm:rounded-[24px]"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-drift-divider px-5 py-4">
          <h2 className="font-drift-display text-[20px] font-bold">Find my bookings</h2>
          <button
            onClick={() => onClose(didApply)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-drift-alt-bg text-[14px] text-drift-muted"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
          {/* Forwarding address */}
          <p className="mt-4 text-[12px] font-bold uppercase tracking-wide text-drift-muted">
            Forward confirmation emails
          </p>
          {alias ? (
            <div className="mt-2 flex items-center gap-2 rounded-2xl bg-drift-alt-bg p-3">
              <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{alias}</span>
              <button
                onClick={copyAlias}
                className="shrink-0 rounded-full bg-drift-coral px-3.5 py-1.5 text-[12.5px] font-bold text-white"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
          ) : (
            <p className="mt-2 text-[13px] text-drift-muted">
              This trip doesn&apos;t have a forwarding address yet.
            </p>
          )}
          <p className="mt-1.5 text-[12px] text-drift-muted">
            Forward flight, hotel or activity confirmations here — they&apos;ll appear
            below, ready to add.
          </p>

          {/* Paste */}
          <p className="mt-6 text-[12px] font-bold uppercase tracking-wide text-drift-muted">
            Or paste a confirmation
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={4}
            placeholder="Paste the text of a booking confirmation email…"
            className="mt-2 w-full resize-none rounded-2xl border border-drift-divider bg-white p-3 text-[13.5px] outline-none focus:border-drift-coral"
          />
          <button
            onClick={parsePaste}
            disabled={parsing || !pasteText.trim()}
            className="mt-2 rounded-full bg-drift-ink px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40"
          >
            {parsing ? "Reading…" : "Read bookings"}
          </button>

          {/* Review list */}
          <div className="mt-6 flex items-baseline justify-between">
            <p className="text-[12px] font-bold uppercase tracking-wide text-drift-muted">
              Ready to add
            </p>
            {segments.length > 0 && (
              <span className="text-[12px] text-drift-muted">
                {selected.size} of {segments.length} selected
              </span>
            )}
          </div>

          {loadingSegments && (
            <p className="mt-3 text-[13px] text-drift-muted">Checking for bookings…</p>
          )}
          {!loadingSegments && segments.length === 0 && (
            <p className="mt-3 text-[13px] text-drift-muted">
              Nothing waiting — forward or paste a confirmation to get started.
            </p>
          )}

          <ul className="mt-2 space-y-2">
            {segments.map((s) => {
              const checked = selected.has(s.id)
              return (
                <li key={s.id}>
                  <button
                    onClick={() => toggle(s.id)}
                    disabled={!s.batchId}
                    className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                      checked
                        ? "border-drift-coral/50 bg-drift-coral-50"
                        : "border-drift-divider bg-white"
                    } disabled:opacity-50`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold ${
                        checked
                          ? "border-drift-coral bg-drift-coral text-white"
                          : "border-drift-divider text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <span className="text-[18px]">
                      {CATEGORY_ICON[s.category] ?? "📄"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">
                        {s.label}
                      </span>
                      <span className="block truncate text-[12px] text-drift-muted">
                        {s.sub}
                        {s.needsReview ? " · needs review" : ""}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          {error && (
            <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-[13px] text-red-600">
              {error}
            </p>
          )}
          {appliedCount != null && !error && (
            <p className="mt-3 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[13px] font-semibold text-emerald-700">
              Added {appliedCount} {appliedCount === 1 ? "booking" : "bookings"} to the
              trip ✓
            </p>
          )}

          {segments.length > 0 && (
            <button
              onClick={applySelected}
              disabled={applying || selected.size === 0}
              className="mt-4 h-[48px] w-full rounded-2xl bg-drift-coral text-[15px] font-bold text-white shadow-md shadow-drift-coral/25 disabled:opacity-50"
            >
              {applying
                ? "Adding…"
                : `Add ${selected.size} to trip`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function cap(s: string | null): string | null {
  if (!s) return null
  return s.charAt(0).toUpperCase() + s.slice(1)
}
