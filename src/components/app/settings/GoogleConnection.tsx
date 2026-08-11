"use client"

import { useState } from "react"
import { revokeGoogleAccess } from "@/lib/drift/google"

/**
 * Connected accounts — Google.
 *
 * Web had no way to disconnect at all (iOS has ManageSourcesView), which meant
 * the only route was Google's own permissions page. That is a gap in its own
 * right: an app that asks for mailbox access should let you take it back from
 * inside the app.
 *
 * There is no "connected" flag to read — web holds no Google token, by design.
 * So the control is always offered rather than shown conditionally, and simply
 * reports when there was nothing to revoke.
 */
export default function GoogleConnection() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function disconnect() {
    setBusy(true)
    setMsg(null)
    try {
      const ok = await revokeGoogleAccess()
      setMsg(
        ok
          ? "Disconnected. Drift no longer has access to your Gmail or Calendar."
          : "Nothing to disconnect — Drift doesn't currently have access."
      )
    } catch {
      setMsg("Couldn't disconnect. You can also remove access at myaccount.google.com/permissions.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-aurora-border bg-aurora-glass p-5">
      <h2 className="text-[15px] font-bold text-aurora-ink">Connected accounts</h2>
      <p className="mt-1 text-[13px] text-drift-muted">
        Google is used only to find travel confirmations in your Gmail and
        Calendar. Drift reads them, never sends or changes anything.
      </p>
      <button
        onClick={disconnect}
        disabled={busy}
        className="mt-3 rounded-full border border-aurora-border px-4 py-2 text-[13px] font-semibold text-aurora-ink transition-colors hover:border-red-400/50 hover:text-red-400 disabled:opacity-50"
      >
        {busy ? "Disconnecting…" : "Disconnect Google"}
      </button>
      {msg && <p className="mt-2 text-[12.5px] text-drift-muted">{msg}</p>}
      <p className="mt-2 text-[12px] text-drift-muted">
        You can also review access at{" "}
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
