"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { extractPdfText } from "@/lib/drift/pdfText"
import { icsToEventTexts } from "@/lib/drift/ics"

// Find my bookings — web port of the iOS booking-import surface. One card
// language, one line-icon set (no emoji), consistent collapsed-by-default
// rows. Two clear groups: "Add bookings" (methods wired end-to-end through
// parse-text — Forward · Upload PDF · Paste · Import .ics) and "Needs setup"
// (credentialed methods — Gmail scan, Google Calendar, Plaid — shown as honest
// expandable tiles until the Drift team provisions their OAuth / bank creds).

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
        <Icon name="send" className="h-3.5 w-3.5" /> Find bookings
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
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[24px] bg-white shadow-2xl sm:max-h-[88vh] sm:rounded-[24px]"
      >
        {/* Header — generous top padding + safe-area inset so the display-font
            title is never clipped at the top edge. */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-drift-divider px-5 pb-4 pt-[max(1.35rem,calc(env(safe-area-inset-top)+0.5rem))]">
          <div className="min-w-0">
            <h2 className="font-drift-display text-[21px] font-bold leading-[1.15]">
              Find my bookings
            </h2>
            <p className="mt-1 text-[12.5px] text-drift-muted">
              Bring your plans into Drift in seconds.
            </p>
          </div>
          <button
            onClick={() => onClose(didApply)}
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-drift-alt-bg text-drift-muted transition-colors hover:bg-drift-divider"
            aria-label="Close"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
          {/* Working methods */}
          <SectionLabel>Add bookings</SectionLabel>
          <div className="space-y-2.5">
            <ExpandRow icon="send" title="Forward email" desc="Use your trip's Drift address">
              {alias ? (
                <div className="flex items-center gap-2 rounded-xl bg-drift-alt-bg p-2.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{alias}</span>
                  <button
                    onClick={copyAlias}
                    className="shrink-0 rounded-full bg-drift-coral px-3 py-1.5 text-[12px] font-bold text-white"
                  >
                    {copied ? "Copied ✓" : "Copy"}
                  </button>
                </div>
              ) : (
                <p className="text-[12.5px] text-drift-muted">
                  This trip doesn&apos;t have a forwarding address yet.
                </p>
              )}
            </ExpandRow>

            <ActionRow
              icon="file"
              title="Upload PDF"
              desc="Flight, hotel or ticket PDFs"
              busy={busy === "pdf"}
              onClick={() => pdfInput.current?.click()}
            />

            <ExpandRow icon="clipboard" title="Paste confirmation" desc="Copy booking text from anywhere">
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
            </ExpandRow>

            <ActionRow
              icon="calendar"
              title="Import calendar (.ics)"
              desc="Apple or Google Calendar export"
              busy={busy === "ics"}
              onClick={() => icsInput.current?.click()}
            />
          </div>

          {/* Credentialed methods — grouped together, honest state */}
          <SectionLabel>Needs setup</SectionLabel>
          <div className="space-y-2.5">
            <SetupRow
              icon="inbox"
              title="Scan Gmail"
              desc="Auto-find flights, hotels & tours from your inbox"
              note="Scanning Gmail on the web needs a Google sign-in the Drift team is still configuring. For now, forward a confirmation or paste one — same result."
            />
            <SetupRow
              icon="calendar"
              title="Connect Google Calendar"
              desc="Sync events straight from your Google account"
              note="A one-tap Google Calendar connection needs a Google sign-in the Drift team is configuring. For now, export your calendar as an .ics file and use “Import calendar (.ics)” above."
            />
            <SetupRow
              icon="card"
              title="Connect a card"
              desc="Auto-import trip expenses from your bank"
              note="Card linking (via Plaid) needs bank credentials the Drift team is setting up. It'll appear here as a live connection once enabled."
            />
          </div>

          {/* Review list */}
          <div className="mt-6 flex items-baseline justify-between">
            <p className="text-[11.5px] font-bold uppercase tracking-wide text-drift-muted">
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

          {/* Hidden pickers driving the PDF / .ics action rows */}
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

// ---- one coherent line-icon set (Feather-style, 24px stroke) ----

type IconName =
  | "send"
  | "inbox"
  | "file"
  | "clipboard"
  | "calendar"
  | "card"
  | "chevron"
  | "close"

function Icon({ name, className = "h-[19px] w-[19px]" }: { name: IconName; className?: string }) {
  const p = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  }
  const paths: Record<IconName, React.ReactNode> = {
    send: (
      <>
        <path d="M22 2 11 13" />
        <path d="M22 2 15 22 11 13 2 9 22 2Z" />
      </>
    ),
    inbox: (
      <>
        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
      </>
    ),
    file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6" />
        <path d="M16 13H8M16 17H8M10 9H8" />
      </>
    ),
    clipboard: (
      <>
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <rect x="8" y="2" width="8" height="4" rx="1" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </>
    ),
    card: (
      <>
        <rect x="1" y="4" width="22" height="16" rx="2" />
        <path d="M1 10h22" />
      </>
    ),
    chevron: <path d="m6 9 6 6 6-6" />,
    close: <path d="M18 6 6 18M6 6l12 12" />,
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} {...p}>
      {paths[name]}
    </svg>
  )
}

// ---- one card language ----

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 mt-6 text-[11.5px] font-bold uppercase tracking-wide text-drift-muted">
      {children}
    </p>
  )
}

function RowShell({
  icon,
  title,
  desc,
  trailing,
  onClick,
  disabled,
}: {
  icon: IconName
  title: string
  desc: string
  trailing?: React.ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 p-3.5 text-left disabled:opacity-60"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-drift-coral-50 text-drift-coral">
        <Icon name={icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold text-drift-ink">{title}</span>
        <span className="block truncate text-[12.5px] text-drift-muted">{desc}</span>
      </span>
      {trailing}
    </button>
  )
}

// Direct action (opens a file dialog); no chevron, spinner while busy.
function ActionRow({
  icon,
  title,
  desc,
  onClick,
  busy = false,
}: {
  icon: IconName
  title: string
  desc: string
  onClick: () => void
  busy?: boolean
}) {
  return (
    <div className="rounded-2xl border border-drift-divider bg-white transition-colors hover:border-drift-coral/40">
      <RowShell
        icon={icon}
        title={title}
        desc={busy ? "Reading…" : desc}
        onClick={onClick}
        disabled={busy}
        trailing={
          busy ? (
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-drift-coral/30 border-t-drift-coral" />
          ) : (
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-drift-text-tertiary">
              Choose
            </span>
          )
        }
      />
    </div>
  )
}

// Expandable row — down chevron, COLLAPSED by default, reveals children.
function ExpandRow({
  icon,
  title,
  desc,
  children,
}: {
  icon: IconName
  title: string
  desc: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="overflow-hidden rounded-2xl border border-drift-divider bg-white transition-colors hover:border-drift-coral/40">
      <RowShell
        icon={icon}
        title={title}
        desc={desc}
        onClick={() => setOpen((v) => !v)}
        trailing={
          <Icon
            name="chevron"
            className={`h-4 w-4 shrink-0 text-drift-text-tertiary transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        }
      />
      {open && <div className="px-3.5 pb-3.5">{children}</div>}
    </div>
  )
}

// "Needs setup" tile — same shell + an amber pill, expandable to explain what
// it will do. Never a live-looking dead button.
function SetupRow({
  icon,
  title,
  desc,
  note,
}: {
  icon: IconName
  title: string
  desc: string
  note: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="overflow-hidden rounded-2xl border border-drift-divider bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-3.5 text-left"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-drift-alt-bg text-drift-muted">
          <Icon name={icon} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[14.5px] font-semibold text-drift-ink">{title}</span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
              Needs setup
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[12.5px] text-drift-muted">{desc}</span>
        </span>
        <Icon
          name="chevron"
          className={`h-4 w-4 shrink-0 text-drift-text-tertiary transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
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
