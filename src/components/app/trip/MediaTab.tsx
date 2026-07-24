"use client"

import { useEffect, useRef, useState } from "react"
import {
  listTripFiles,
  uploadTripFile,
  deleteTripFile,
  formatBytes,
  type TripFile,
} from "@/lib/drift/media"

// Trip Media = the Files/attachments library (PDFs, receipts, tickets, docs, and
// photos attached as files) — separate from Track's photo/moments. Backed by the
// trip_files table + the shared S3/CloudFront upload pipeline.

function shortDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function tint(mime: string | null): { bg: string; fg: string } {
  if (mime?.startsWith("image/")) return { bg: "rgba(55,214,196,.14)", fg: "#37D6C4" }
  if (mime === "application/pdf") return { bg: "rgba(231,97,75,.14)", fg: "#E7614B" }
  return { bg: "rgba(107,92,255,.16)", fg: "#a99cff" }
}

function typeTag(f: TripFile): string {
  const ext = f.filename.split(".").pop()?.toUpperCase()
  if (ext && ext.length <= 4) return ext
  if (f.mime_type?.startsWith("image/")) return "IMG"
  return "FILE"
}

export default function MediaTab({ tripId }: { tripId: string }) {
  const [files, setFiles] = useState<TripFile[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    listTripFiles(tripId).then(setFiles)
  }, [tripId])

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ""
    if (!picked.length) return
    setBusy(true)
    setError(null)
    for (const f of picked) {
      const row = await uploadTripFile(tripId, f)
      if (row) setFiles((prev) => [row, ...(prev ?? [])])
      else setError(`Couldn't upload ${f.name}. Try again.`)
    }
    setBusy(false)
  }

  async function remove(id: string) {
    setMenuId(null)
    setFiles((prev) => (prev ?? []).filter((f) => f.id !== id))
    await deleteTripFile(id)
  }

  const count = files?.length ?? 0

  return (
    <div className="mt-6 lg:max-w-2xl" onClick={() => menuId && setMenuId(null)}>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-drift-display text-[22px] font-semibold">Media</h2>
          <p className="mt-0.5 text-[12.5px] text-drift-text-tertiary">
            {count === 0 ? "Files, receipts, tickets" : `${count} ${count === 1 ? "file" : "files"}`}
          </p>
        </div>
        <button
          onClick={() => input.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full bg-drift-coral px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {busy ? "Uploading…" : "Add media"}
        </button>
      </div>

      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept="image/*,application/pdf,.doc,.docx,.txt,.csv,.zip,.pages,.numbers,.key,.ics"
        onChange={onPick}
      />

      {error && (
        <p className="mb-3 rounded-xl bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-400">{error}</p>
      )}

      {files === null ? (
        <p className="text-[13px] text-drift-text-tertiary">Loading…</p>
      ) : (
        <>
          <ul className="space-y-2">
            {files.map((f) => {
              const t = tint(f.mime_type)
              const meta = [typeTag(f), formatBytes(f.size_bytes), shortDate(f.created_at)]
                .filter(Boolean)
                .join(" · ")
              return (
                <li key={f.id} className="relative">
                  <div className="flex items-center gap-3 rounded-2xl border border-aurora-border bg-aurora-glass p-3">
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: t.bg, color: t.fg }}
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" />
                      </svg>
                    </span>
                    <button
                      onClick={() => window.open(f.url, "_blank", "noopener")}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-[14px] font-semibold text-drift-ink">{f.filename}</span>
                      <span className="block truncate text-[11.5px] text-drift-text-tertiary">{meta}</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setMenuId(menuId === f.id ? null : f.id)
                      }}
                      aria-label="More"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-drift-text-tertiary hover:bg-aurora-glass2"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                        <circle cx="5" cy="12" r="1.6" />
                        <circle cx="12" cy="12" r="1.6" />
                        <circle cx="19" cy="12" r="1.6" />
                      </svg>
                    </button>
                  </div>
                  {menuId === f.id && (
                    <div className="absolute right-2 top-[52px] z-20 w-40 overflow-hidden rounded-xl border border-aurora-border bg-aurora-glass2 shadow-aurora-glow">
                      <button
                        onClick={() => {
                          setMenuId(null)
                          window.open(f.url, "_blank", "noopener")
                        }}
                        className="block w-full px-3.5 py-2.5 text-left text-[13px] text-drift-ink hover:bg-aurora-glass"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => remove(f.id)}
                        className="block w-full border-t border-aurora-border px-3.5 py-2.5 text-left text-[13px] text-red-400 hover:bg-red-500/10"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          <button
            onClick={() => input.current?.click()}
            disabled={busy}
            className="mt-3 flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-aurora-teal/45 bg-aurora-teal/5 py-6 text-aurora-teal disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4M6 10l6-6 6 6" />
              <path d="M4 20h16" />
            </svg>
            <span className="text-[13px] font-bold">{busy ? "Uploading…" : "Tap to upload"}</span>
            <span className="text-[11px] text-drift-text-tertiary">Photos, PDFs, tickets, documents</span>
          </button>
        </>
      )}
    </div>
  )
}
