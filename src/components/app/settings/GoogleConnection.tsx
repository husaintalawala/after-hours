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
 * Disconnect does two independent halves and REPORTS THEM SEPARATELY:
 *   1. revoke the OAuth grant at Google (best effort — needs a silently
 *      obtainable token, see revokeGoogleAccess),
 *   2. flip the import_sources row, which is Drift's own "scan this source"
 *      state.
 *
 * (2) happens whether or not (1) succeeds. An earlier version gated the flip on
 * the revoke and left users stuck on a "Connected" pill with no way out when
 * Google couldn't be reached. Drift stores no Google tokens, so a live grant
 * with a disconnected row gives Drift nothing — it cannot read anything until
 * the user personally starts another scan. What it must never do is CLAIM the
 * grant is gone when it isn't, so the failure copy says so plainly and points
 * at Google.
 */
const GOOGLE_PROVIDERS = ["gmail", "calendar"]

type Status = "loading" | "connected" | "disconnected" | "error" | "never"

export default function GoogleConnection() {
  const [status, setStatus] = useState<Status>("loading")
  const [lastScan, setLastScan] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createClient() as any
    const { data } = await db
      .from("import_sources")
      .select("provider,status,last_scan_at")
      // "calendar", not "google_calendar" — the latter is a batch source label
      // and is rejected by the import_sources provider check constraint, so it
      // could never match a row.
      .in("provider", GOOGLE_PROVIDERS)
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createClient() as any
    void db.auth.getUser().then(({ data }: { data: { user?: { email?: string } } }) => {
      setEmail(data?.user?.email ?? null)
    })
  }, [])

  async function disconnect() {
    setBusy(true)
    setMsg(null)
    try {
      // Best effort, and never interactive — this can't pop a consent screen.
      const revoked = await revokeGoogleAccess(email ?? "")

      // Stop using Google regardless of what Google said. RLS scopes the
      // update to the signed-in user.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = createClient() as any
      // throwOnError, because postgrest-js RESOLVES with { error } instead of
      // rejecting. Without it the catch below is unreachable, and an RLS denial or
      // a dropped connection took the success path — telling the user "Drift has
      // stopped using Google" while the row still said connected, so the next scan
      // would run. A false privacy claim is worse than an error message.
      await db
        .from("import_sources")
        .update({ status: "disconnected" })
        .in("provider", GOOGLE_PROVIDERS)
        .throwOnError()
      await load()

      setMsg(
        revoked.ok
          ? "Disconnected. Drift's access to your Gmail and Calendar has been removed at Google."
          : "Drift has stopped using Google and won't scan again. Google still lists Drift under third-party access — remove it there to fully revoke."
      )
    } catch {
      setMsg("Couldn't disconnect. You can remove Drift's access from your Google account below.")
    } finally {
      setBusy(false)
    }
  }

  const pill =
    status === "connected"
      ? { text: "Connected", cls: "bg-aurora-teal/15 text-aurora-teal" }
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
        Review or remove Drift&rsquo;s access anytime in your{" "}
        <a
          href="https://myaccount.google.com/connections"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Google third-party access settings
        </a>
        .
      </p>
    </section>
  )
}
