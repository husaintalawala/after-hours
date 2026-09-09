"use client"

import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { uploadAvatar } from "@/lib/drift/media"

/**
 * The old signup form, inverted — web port of the iOS FirstRunProfileView.
 *
 * `UsernameSetupView` asked for the same things as a root view with no exit and
 * a Continue button that arrived disabled for the 29 of 41 accounts that sign
 * up by email. This asks for them with every field already filled, an X in the
 * corner, and a Skip that leaves the derived values standing — the derivation
 * is the floor, this screen is the polish.
 *
 * THE PHOTO IS NOW A PICKER, which is what the link that opens this screen has
 * been promising. It said "Edit name, handle or photo" and the screen behind it
 * could only DISPLAY one, under the words "From your account." — the one control
 * it advertised did not exist. iOS made the same offer true in a6522ea1 by
 * extracting AvatarUpload out of Settings; this is the web half, over the
 * presign → PUT path trip files and trip covers already use.
 *
 * The home city is the one field iOS asks here that this does not — screen 2 of
 * the flow is entirely that question, and asking twice would be worse than
 * asking once.
 */
export default function DaybreakProfileEditor({
  displayName: initialName,
  username: initialHandle,
  avatarUrl,
  onAvatar,
  onSaved,
  onClose,
}: {
  displayName: string
  username: string
  avatarUrl: string | null
  /** Reported the moment the photo lands, NOT on "Looks right": the upload
   *  persists on pick, so someone who changes their photo and then closes this
   *  sheet has still changed it, and the screen behind must say so. */
  onAvatar: (url: string) => void
  onSaved: (v: { displayName: string; username: string }) => void
  onClose: () => void
}) {
  const [displayName, setDisplayName] = useState(initialName)
  const [username, setUsername] = useState(initialHandle)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  /** The picked bytes, shown immediately rather than waiting on a round trip to
   *  the CDN we just wrote to. */
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [photoNote, setPhotoNote] = useState<string | null>(null)

  /** Released when it is replaced and when this unmounts — an object URL that
   *  is never revoked holds the whole image in memory for the life of the page,
   *  and someone trying three photos would hold all three. */
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  /** Shows the picked image the moment it is ready, and says so honestly when
   *  the bytes landed but the profile row did not take them — that half failure
   *  reads to the user as the photo reverting for no reason on the next load. */
  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = "" // so the same file can be re-picked after a failure
    if (!file) return
    setPhotoNote(null)
    setUploading(true)
    const result = await uploadAvatar(file)
    setUploading(false)
    if (result.ok) {
      // Minted out here, not inside the updater: React can run an updater twice
      // and each run would mint a URL only one of which is ever revoked.
      setPreview(URL.createObjectURL(file))
      onAvatar(result.url)
      return
    }
    setPhotoNote(
      result.reason === "uploadedButNotLinked"
        ? "Uploaded, but we couldn't attach it. Try again in a moment."
        : result.reason === "unreadable"
          ? "That image couldn't be read. Try another."
          : "Couldn't upload that. Check your connection."
    )
  }

  const initial = (displayName.trim()[0] ?? "D").toUpperCase()
  const cleanHandle = username.toLowerCase().replace(/[^a-z0-9]/g, "")
  /** The local bytes win while they exist: the CDN URL is written the same
   *  instant, but the object it points at may not be servable for a beat. */
  const shownPhoto = preview ?? avatarUrl

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

        {/* A button, not a caption. The whole row is the control, so the photo
            itself is the thing you press — which is where anyone looks first. */}
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="mt-4 flex w-full items-center gap-3 text-left disabled:opacity-70"
        >
          <span className="h-[54px] w-[54px] shrink-0 overflow-hidden rounded-full ring-[1.5px] ring-aurora-teal/50">
            {shownPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shownPhoto} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-aurora-teal/[0.22] font-drift-display text-[21px] font-bold text-aurora-teal">
                {initial}
              </span>
            )}
          </span>
          <span className="min-w-0">
            <span className="block text-[13.5px] font-semibold text-aurora-teal">
              {uploading
                ? "Uploading…"
                : preview
                  ? "Photo updated"
                  : avatarUrl
                    ? "Change your photo"
                    : "Add a photo"}
            </span>
            <span className="block text-[11.5px] text-aurora-ink3">
              {photoNote ?? (avatarUrl ? "From your account." : "No photo came with your sign-in.")}
            </span>
          </span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          onChange={(e) => void pickPhoto(e)}
          className="hidden"
        />

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
