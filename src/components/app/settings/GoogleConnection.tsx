"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { revokeGoogleAccess } from "@/lib/drift/google"

/**
 * Connected accounts — Google.
 *
 * State comes from `import_sources`, the same table iOS's ManageSourcesView
 * reads (provider + status: connected | disconnected | error, plus
 * last_scan_at). The first version of this component invented its own answer
 * from the revoke call, so it could only ever report a result AFTER you acted —
 * which is why it read "Nothing to disconnect" without ever saying whether
 * anything was connected in the first place.
 *
 * Disconnect does both halves, in the order that survives a failure midway:
 * revoke the grant at Google first, then flip the row. A flipped row with a
 * live grant would be a lie; a live row with a revoked grant self-corrects on
 * the next scan.
 */
type Status = "loading" | "connected" | "disconnected" | "error" | "never"

export default function GoogleConnection() {
  const [status, setStatus] = useState<Status>("loading")
  const [lastScan, setLastScan] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createClient() as any
    const { data } = await db
      .from("import_sources")
      .select("provider,status,last_scan_at")
      .in("provider", ["gmail", "google_calendar"])
      .order("last_scan_at", { ascending: false, nullsFirst: false })
    const rows = (data ?? []) as { status: string; last_scan_at: string | null }[]
    if (!rows.length) {
      setStatus("never")
      return
    }
    const live = rows.find((r) => r.status === "connected")
    setStatus(live ? "connected" : rows.some((r) => r.status === "error") ? "error" : "disconnected")
    setLastScan(rows.find((r) => r.last_scan_at)?.last_scan_at ?? null)
  }

  useEffect(() => {
    void load()
  }, [])

  async function disconnect() {
    setBusy(true)
    setMsg(null)
    try {
      const revoked = await revokeGoogleAccess()
      if (!revoked) {
        setMsg("Couldn't reach Google. You can remove access at myaccount.google.com/permissions.")
        return
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = createClient() as any
      await db
        .from("import_sources")
        .update({ status: "disconnected" })
        .in("provider", ["gmail", "google_calendar"])
      setMsg("Disconnected. Drift no longer has access to your Gmail or Calendar.")
      await load()
    } catch {
      setMsg("Couldn't disconnect. You can remove access at myaccount.google.com/permissions.")
    } finally {
      setBusy(false)
    }
  }

  const pill =
    status === "connected"
      ? { text: "Connected", cls: "bg-drift-teal/15 text-drift-teal" }
      : status === "error"
        ? { text: "Last scan failed", cls: "bg-amber-500/15 text-amber-400" }
        : status === "loading"
          ? { text: "…", cls: "bg-aurora-glass text-drift-muted" }
          : { text: status === "never" ? "Not connected" : "Disconnected", cls: "bg-aurora-glass text-drift-muted" }

  return (
    <section className="rounded-2xl border border-aurora-border bg-aurora-glass p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold text-aurora-ink">Connected accounts</h2>
        <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold ${pill.cls}`}>
          {pill.text}
        </span>
      </div>

      <p className="mt-1 text-[13px] text-drift-muted">
        Google is used only to find travel confirmations in your Gmail and
        Calendar. Drift reads them, never sends or changes anything.
      </p>

      {status === "connected" && lastScan && (
        <p className="mt-1 text-[12.5px] text-drift-muted">
          Last scan {new Date(lastScan).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </p>
      )}

      {status === "connected" ? (
        <button
          onClick={disconnect}
          disabled={busy}
          className="mt-3 rounded-full border border-aurora-border px-4 py-2 text-[13px] font-semibold text-aurora-ink transition-colors hover:border-red-400/50 hover:text-red-400 disabled:opacity-50"
        >
          {busy ? "Disconnecting…" : "Disconnect Google"}
        </button>
      ) : (
        <p className="mt-3 text-[12.5px] text-drift-muted">
          Connect from a trip — Find bookings → Scan Gmail.
        </p>
      )}

      {msg && <p className="mt-2 text-[12.5px] text-drift-muted">{msg}</p>}
      <p className="mt-2 text-[12px] text-drift-muted">
        Review access anytime at{" "}
        <a
          href="https://myaccount.google.com/permissions"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          myaccount.google.com/permissions
        </a>
        .
      </p>
    </section>
  )
}
