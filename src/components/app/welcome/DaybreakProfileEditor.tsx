"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"

/**
 * The old signup form, inverted — web port of the iOS FirstRunProfileView.
 *
 * `UsernameSetupView` asked for the same things as a root view with no exit and
 * a Continue button that arrived disabled for the 29 of 41 accounts that sign
 * up by email. This asks for them with every field already filled, an X in the
 * corner, and a Skip that leaves the derived values standing — the derivation
 * is the floor, this screen is the polish.
 *
 * THE PHOTO IS SHOWN, NOT EDITED, on both platforms. It comes from the identity
 * the account signed in with; there is no uploader on iOS either, which is why
 * the row explains where the picture came from rather than offering to change
 * it. The home city is the one field iOS asks here that this does not — screen
 * 2 of the flow is entirely that question, and asking twice would be worse than
 * asking once.
 */
export default function DaybreakProfileEditor({
  displayName: initialName,
  username: initialHandle,
  avatarUrl,
  onSaved,
  onClose,
}: {
  displayName: string
  username: string
  avatarUrl: string | null
  onSaved: (v: { displayName: string; username: string }) => void
  onClose: () => void
}) {
  const [displayName, setDisplayName] = useState(initialName)
  const [username, setUsername] = useState(initialHandle)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initial = (displayName.trim()[0] ?? "D").toUpperCase()
  const cleanHandle = username.toLowerCase().replace(/[^a-z0-9]/g, "")

  async function save() {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const db = createClient()
      const {
        data: { session },
      } = await db.auth.getSession()
      const uid = session?.user?.id
      if (!uid) throw new Error("Couldn't save that. Check your connection.")

      if (cleanHandle.length < 3) {
        setError("Usernames need at least 3 characters.")
        setSaving(false)
        return
      }

      // The same pre-check the iOS form does, so a clash reads as "taken"
      // rather than as a generic failure — the unique index would otherwise
      // surface as a raw 23505.
      const { data: taken } = await db
        .from("profiles")
        .select("id")
        .eq("username", cleanHandle)
        .neq("id", uid)
        .limit(1)
      if (taken && taken.length > 0) {
        setError(`@${cleanHandle} is taken. Try another.`)
        setSaving(false)
        return
      }

      const name = displayName.trim()
      // `.select()` so a write RLS filtered to zero rows is not read as a
      // success — a silent no-op here would send the user on believing their
      // handle changed.
      const { data: rows, error: e } = await db
        .from("profiles")
        .update({ username: cleanHandle, display_name: name || null })
        .eq("id", uid)
        .select("id")
      if (e) throw e
      if (!rows || rows.length === 0) throw new Error("Couldn't save that. Check your connection.")

      onSaved({ displayName: name, username: cleanHandle })
    } catch {
      setError("Couldn't save that. Check your connection.")
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Make sure this is you"
        className="w-full max-w-md rounded-t-hero border border-aurora-border bg-aurora-midnight2 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-hero sm:pb-5"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-drift-display text-[26px] font-bold text-aurora-ink">
            Make sure this is you.
          </h2>
          {/* The X that UsernameSetupView never had. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 shrink-0 rounded-full border border-aurora-border bg-aurora-glass px-2.5 py-1 text-[16px] leading-none text-aurora-ink2"
          >
            ×
          </button>
        </div>
        <p className="mt-2 text-[13px] text-aurora-ink3">
          We filled this in from your sign-in. Your crew sees the name and photo when you share a
          trip.
        </p>

        <div className="mt-4 flex items-center gap-3">
          <span className="h-[54px] w-[54px] shrink-0 overflow-hidden rounded-full">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-aurora-teal/[0.22] font-drift-display text-[21px] font-bold text-aurora-teal">
                {initial}
              </span>
            )}
          </span>
          <p className="text-[12px] text-aurora-ink3">
            {avatarUrl
              ? "From your account."
              : "No photo from your sign-in — your initial stands in."}
          </p>
        </div>

        <Field label="Name" value={displayName} onChange={setDisplayName} placeholder="Your name" />
        <Field label="Username" value={username} onChange={setUsername} placeholder="handle" />
        {error && <p className="mt-1.5 text-[12px] text-aurora-danger">{error}</p>}

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-[14.5px] font-semibold text-aurora-ink3"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="aurora-cta h-11 px-6 text-[15px] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Looks right"}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <label className="mt-4 block">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-aurora-ink3">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        className="w-full rounded-xl border border-aurora-border bg-aurora-glass px-3 py-3 text-[16px] text-aurora-ink outline-none placeholder:text-aurora-ink3 focus:border-aurora-teal"
      />
    </label>
  )
}
