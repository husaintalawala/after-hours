"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { extractPdfText } from "@/lib/drift/pdfText"
import { icsToEventTexts } from "@/lib/drift/ics"

// Find my bookings — web port of the iOS booking-import surface, grouped the
// same way: a Gmail entry, a "Find reservations" section (Forward · Upload PDF ·
// Paste · Calendar .ics · Google Calendar), and a "Track spending" section
// (Plaid). Methods that need no credentials are wired end-to-end through the
// existing parse-text edge fn (Forward · Paste · PDF · .ics). The credentialed
// ones (Gmail scan, native Google Calendar, Plaid) show an honest "Needs setup"
// tile — clearly labelled, expandable to explain, never a dead live-looking
// button — until the Drift team provisions their OAuth / bank credentials.

interface SegmentVM {
  id: string
  batchId: string | null
  category: string
  label: string
  sub: string
  needsReview: boolean
}

type Busy = null | "paste" | "pdf" | "ics"

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
  const [pasteOpen, setPasteOpen] = useState(false)
  const [busy, setBusy] = useState<Busy>(null)
  const [segments, setSegments] = useState<SegmentVM[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loadingSegments, setLoadingSegments] = useState(true)
  const [applying, setApplying] = useState(false)
  const [appliedCount, setAppliedCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const didApply = useMemo(() => appliedCount != null && appliedCount > 0, [appliedCount])
  const pdfInput = useRef<HTMLInputElement>(null)
  const icsInput = useRef<HTMLInputElement>(null)

  // The trip's forwarding address (trigger-created on trip insert).
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createClient() as any
    // All unapplied segments for the trip (from every source).
    const { data: segs } = await db
      .from("reservation_segments")
      .select(
        "id, category, origin_name, destination_name, starts_at, address, confirmation_number, needs_review, parsed_reservation_id, applied_at"
      )
      .eq("trip_id", tripId)
      .is("applied_at", null)
      .order("created_at", { ascending: false })
      .limit(50)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = segs ?? []

    // Map each segment to its batch via parsed_reservations.batch_id.
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
        ? new Date(r.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
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

  // Shared parse → reload. Body carries source + text|texts.
  async function postParse(body: Record<string, unknown>, noun: string) {
    const res = await fetch("/api/drift/parse-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: tripId, ...body }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) throw new Error(json?.error ?? `Couldn't read that ${noun}`)
    await loadSegments()
    if (!json.batch_id) setError(`Read the ${noun}, but found no bookings in it.`)
  }

  async function parsePaste() {
    const text = pasteText.trim()
    if (!text || busy) return
    setBusy("paste")
    setError(null)
    try {
      await postParse({ source: "paste", text }, "confirmation")
      setPasteText("")
      setPasteOpen(false)
    } catch (e) {
      setError(msg(e))
    }
    setBusy(null)
  }

  async function handlePdf(file: File | undefined) {
    if (!file || busy) return
    setBusy("pdf")
    setError(null)
    try {
      const text = await extractPdfText(file)
      if (text.trim().length < 40) {
        setError(
          "Couldn't read text from that PDF — if it's a scan, try Paste or Forward the original email."
        )
      } else {
        await postParse({ source: "pdf", text }, "PDF")
      }
    } catch {
      setError("Couldn't open that PDF. If it's a scan with no text, try Paste or Forward.")
    }
    setBusy(null)
  }

  async function handleIcs(file: File | undefined) {
    if (!file || busy) return
    setBusy("ics")
    setError(null)
    try {
      const texts = icsToEventTexts(await file.text())
      if (!texts.length) setError("No events found in that calendar file.")
      else await postParse({ source: "calendar", texts }, "calendar file")
    } catch {
      setError("Couldn't read that calendar file.")
    }
    setBusy(null)
  }

  async function applySelected() {
    if (applying || selected.size === 0) return
    setApplying(true)
    setError(null)
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
      setError(msg(e))
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
          <div>
            <h2 className="font-drift-display text-[20px] font-bold">Find my bookings</h2>
            <p className="text-[12.5px] text-drift-muted">Bring your plans into Drift in seconds.</p>
          </div>
          <button
            onClick={() => onClose(didApply)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-drift-alt-bg text-[14px] text-drift-muted"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
          {/* Gmail — needs setup (the iOS primary; on web needs Google OAuth) */}
          <div className="mt-4">
            <SetupTile
              accent
              icon="✉️"
              title="Scan Gmail"
              desc="Auto-find flights, hotels, restaurants & tours from your inbox."
              note="Scanning Gmail on the web needs a Google sign-in that the Drift team is still configuring. For now, forward a confirmation or paste one below — same result."
            />
          </div>

          {/* Find reservations */}
          <SectionLabel>Find reservations</SectionLabel>
          <div className="space-y-2.5">
            {/* Forward email — works today */}
            <div className="rounded-2xl border border-drift-divider bg-white p-3.5">
              <TileHead icon="📧" title="Forward email" desc="Use your trip's Drift address" />
              {alias ? (
                <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-drift-alt-bg p-2.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{alias}</span>
                  <button
                    onClick={copyAlias}
                    className="shrink-0 rounded-full bg-drift-coral px-3 py-1.5 text-[12px] font-bold text-white"
                  >
                    {copied ? "Copied ✓" : "Copy"}
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-[12.5px] text-drift-muted">
                  This trip doesn&apos;t have a forwarding address yet.
                </p>
              )}
            </div>

            {/* Upload PDF — wired via pdf.js → parse-text */}
            <ActionTile
              icon="📄"
              title="Upload PDF"
              desc="Flight, hotel or ticket PDFs"
              busy={busy === "pdf"}
              onClick={() => pdfInput.current?.click()}
            />

            {/* Paste — works today */}
            <div className="overflow-hidden rounded-2xl border border-drift-divider bg-white">
              <button
                onClick={() => setPasteOpen((v) => !v)}
                className="flex w-full items-center gap-3 p-3.5 text-left"
              >
                <TileIcon>📋</TileIcon>
                <TileText title="Paste confirmation" desc="Copy booking text from anywhere" />
                <Chevron open={pasteOpen} />
              </button>
              {pasteOpen && (
                <div className="px-3.5 pb-3.5">
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={4}
                    placeholder="Paste the text of a booking confirmation email…"
                    className="w-full resize-none rounded-xl border border-drift-divider bg-white p-3 text-[13.5px] outline-none focus:border-drift-coral"
                  />
                  <button
                    onClick={parsePaste}
                    disabled={busy === "paste" || !pasteText.trim()}
                    className="mt-2 rounded-full bg-drift-ink px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40"
                  >
                    {busy === "paste" ? "Reading…" : "Read bookings"}
                  </button>
                </div>
              )}
            </div>

            {/* Calendar .ics — wired via the .ics parser → parse-text batch */}
            <ActionTile
              icon="📅"
              title="Import calendar (.ics)"
              desc="Apple or Google Calendar export"
              busy={busy === "ics"}
              onClick={() => icsInput.current?.click()}
            />

            {/* Native Google Calendar — needs setup (Google OAuth) */}
            <SetupTile
              icon="🗓"
              title="Connect Google Calendar"
              desc="Sync events straight from your Google account"
              note="A one-tap Google Calendar connection needs a Google sign-in the Drift team is configuring. For now, export your calendar as an .ics file and use “Import calendar” above."
            />
          </div>

          {/* Track spending */}
          <SectionLabel>Track spending</SectionLabel>
          <SetupTile
            icon="💳"
            title="Connect a card"
            desc="Auto-import trip expenses from your bank"
            note="Card linking (via Plaid) needs bank credentials the Drift team is setting up. It'll appear here as a live connection once enabled."
          />

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
              Nothing waiting — forward, paste, upload a PDF or import a calendar to get started.
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
                    <span className="text-[18px]">{CATEGORY_ICON[s.category] ?? "📄"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">{s.label}</span>
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
              Added {appliedCount} {appliedCount === 1 ? "booking" : "bookings"} to the trip ✓
            </p>
          )}

          {segments.length > 0 && (
            <button
              onClick={applySelected}
              disabled={applying || selected.size === 0}
              className="mt-4 h-[48px] w-full rounded-2xl bg-drift-coral text-[15px] font-bold text-white shadow-md shadow-drift-coral/25 disabled:opacity-50"
            >
              {applying ? "Adding…" : `Add ${selected.size} to trip`}
            </button>
          )}

          {/* Hidden pickers driving the PDF / .ics tiles */}
          <input
            ref={pdfInput}
            type="file"
            accept="application/pdf"
            hidden
            onChange={(e) => {
              handlePdf(e.target.files?.[0])
              e.target.value = ""
            }}
          />
          <input
            ref={icsInput}
            type="file"
            accept=".ics,text/calendar"
            hidden
            onChange={(e) => {
              handleIcs(e.target.files?.[0])
              e.target.value = ""
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ---- small presentational helpers ----

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 mt-6 text-[12px] font-bold uppercase tracking-wide text-drift-muted">
      {children}
    </p>
  )
}

function TileIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-drift-alt-bg text-[18px]">
      {children}
    </span>
  )
}

function TileText({ title, desc }: { title: string; desc: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-[14.5px] font-semibold">{title}</span>
      <span className="block truncate text-[12.5px] text-drift-muted">{desc}</span>
    </span>
  )
}

function TileHead({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-3">
      <TileIcon>{icon}</TileIcon>
      <TileText title={title} desc={desc} />
    </div>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

function ActionTile({
  icon,
  title,
  desc,
  onClick,
  busy = false,
}: {
  icon: string
  title: string
  desc: string
  onClick: () => void
  busy?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex w-full items-center gap-3 rounded-2xl border border-drift-divider bg-white p-3.5 text-left transition-colors hover:border-drift-coral/40 disabled:opacity-60"
    >
      <TileIcon>{icon}</TileIcon>
      <TileText title={title} desc={busy ? "Reading…" : desc} />
      {busy ? (
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-drift-coral/30 border-t-drift-coral" />
      ) : (
        <span className="shrink-0 text-[18px] text-drift-text-tertiary">›</span>
      )}
    </button>
  )
}

// "Needs setup" tile — expandable, clearly labelled, never a live-looking dead
// button. Tapping reveals what it will do and that it needs configuration.
function SetupTile({
  icon,
  title,
  desc,
  note,
  accent = false,
}: {
  icon: string
  title: string
  desc: string
  note: string
  accent?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className={`overflow-hidden rounded-2xl border ${
        accent ? "border-drift-coral/25 bg-drift-coral-50/50" : "border-drift-divider bg-white"
      }`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-3.5 text-left"
      >
        <TileIcon>{icon}</TileIcon>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[14.5px] font-semibold">{title}</span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
              Needs setup
            </span>
          </span>
          <span className="mt-0.5 block text-[12.5px] text-drift-muted">{desc}</span>
        </span>
        <Chevron open={open} />
      </button>
      {open && (
        <p className="px-3.5 pb-3.5 text-[12.5px] leading-relaxed text-drift-muted">{note}</p>
      )}
    </div>
  )
}

function cap(s: string | null): string | null {
  if (!s) return null
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : "Import failed"
}
