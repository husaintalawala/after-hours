"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { uploadImageToCDN } from "@/lib/drift/media"
import BackLink from "@/components/app/BackLink"
import type { Database } from "@/lib/database.types"

// The generated Update type, not Record<string, unknown> — so a typo in a
// column name is a compile error here rather than a silent no-op at runtime.
type TripUpdate = Database["public"]["Tables"]["trips"]["Update"]

// Trip Settings — web port of the iOS EditTripView.
//
// PORTED: cover photo, trip name, dates, who can see the trip, location
// tracking + visibility, and the destructive action (delete or leave).
//
// NOT PORTED, deliberately:
//   • The location-permission explainer ("open your phone settings, choose
//     Always") — it instructs the user through iOS Settings and means nothing
//     in a browser. The tracking VALUE is a server column, so it is editable
//     here; the permission is the phone's business.
//   • Travel Buddies management — adding and removing members is owner-only at
//     the RLS level (`Trip owner manages buddies` requires trips.user_id =
//     auth.uid()), and the invite link is minted by an RPC. Shipping a
//     half-working roster here would reproduce the exact defect iOS has, where
//     a buddy is shown an Add button that 42501s and a Remove that fails
//     SILENTLY. Better to have nothing than a control that lies.
//   • Email forwarding address — server-generated per trip, worth surfacing,
//     but it belongs with the import flow rather than bolted on here.
//
// PERMISSIONS. An accepted buddy has UPDATE on `trips` by explicit owner
// directive, so they can genuinely edit the name, dates, privacy and cover —
// this screen does not pretend otherwise. What differs is the bottom of the
// page: the owner gets "Delete trip", a buddy gets "Leave trip". Which one is
// decided on the SERVER (see the page component) precisely so nobody is walked
// through a confirmation for something the database will refuse.

export interface TripSettingsInitial {
  title: string
  startDate: string | null
  endDate: string | null
  privacy: string
  coverUrl: string | null
  travelTracker: boolean
  locationVisibility: string
}

const PRIVACY: { value: string; label: string; hint: string }[] = [
  { value: "public", label: "Everyone", hint: "Anyone with the link can view this trip." },
  { value: "friends", label: "Followers", hint: "Only people who follow you can view it." },
  { value: "private", label: "Only me", hint: "Nobody but you and your travel buddies." },
]

const VISIBILITY: { value: string; label: string }[] = [
  { value: "only_me", label: "Only me" },
  { value: "followers", label: "Followers" },
  { value: "everyone", label: "Everyone" },
]

/// trips.start_date / end_date are timestamptz holding a wall-clock day. An
/// <input type="date"> wants "YYYY-MM-DD", so slice rather than construct a
/// Date — `new Date(s).toISOString()` re-resolves through the browser's
/// timezone and can move the day by one, which is the bug class this repo has
/// hit twice already.
function toDateInput(v: string | null): string {
  return v ? v.slice(0, 10) : ""
}

/// Send back a full timestamptz at UTC midday. Midday, not midnight: a
/// midnight-UTC value renders as the PREVIOUS day for anyone behind UTC, and
/// these values are read as wall-clock days across the app.
function fromDateInput(v: string): string | null {
  return v ? `${v}T12:00:00+00:00` : null
}

export default function TripSettingsShell({
  tripId,
  isOwner,
  initial,
}: {
  tripId: string
  isOwner: boolean
  initial: TripSettingsInitial
}) {
  const router = useRouter()
  const db = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState(initial.title)
  const [start, setStart] = useState(toDateInput(initial.startDate))
  const [end, setEnd] = useState(toDateInput(initial.endDate))
  const [privacy, setPrivacy] = useState(initial.privacy)
  const [tracker, setTracker] = useState(initial.travelTracker)
  const [visibility, setVisibility] = useState(initial.locationVisibility)
  const [coverUrl, setCoverUrl] = useState(initial.coverUrl)

  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [confirmDestructive, setConfirmDestructive] = useState(false)
  const [destructing, setDestructing] = useState(false)

  const datesInvalid = !!start && !!end && end < start

  /// Every write goes through here. `.throwOnError()` is not optional:
  /// postgrest-js RESOLVES with an { error } object instead of rejecting, so a
  /// try/catch around a bare update silently succeeds on an RLS denial — the
  /// screen would say "Saved" while the server changed nothing.
  async function patch(fields: TripUpdate, optimistic?: () => void) {
    setError(null)
    optimistic?.()
    try {
      await db.from("trips").update(fields).eq("id", tripId).throwOnError()
      setSavedAt(Date.now())
      router.refresh()
      return true
    } catch (e) {
      setError(
        (e as { message?: string })?.message ??
          "Couldn't save that. Check your connection and try again."
      )
      router.refresh() // pull the true values back so the UI stops lying
      return false
    }
  }

  async function saveDetails() {
    if (datesInvalid || saving) return
    setSaving(true)
    await patch({
      title: title.trim() || "Untitled trip",
      start_date: fromDateInput(start),
      end_date: fromDateInput(end),
    })
    setSaving(false)
  }

  async function pickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = "" // let the same file be re-picked after a failure
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setError("That file isn't an image.")
      return
    }
    setUploading(true)
    setError(null)
    const url = await uploadImageToCDN(file)
    if (!url) {
      setUploading(false)
      setError("Couldn't upload that photo. Try again in a moment.")
      return
    }
    const ok = await patch({ cover_url: url })
    if (ok) setCoverUrl(url)
    setUploading(false)
  }

  async function runDestructive() {
    setDestructing(true)
    setError(null)
    try {
      if (isOwner) {
        await db.from("trips").delete().eq("id", tripId).throwOnError()
      } else {
        // Leaving is a status flip on your own membership row — the one column
        // a non-owner is still granted UPDATE on. Deleting the row outright is
        // owner-only and would fail.
        const { data: userRes } = await db.auth.getUser()
        const uid = userRes?.user?.id
        if (!uid) throw new Error("Not signed in.")
        await db
          .from("trip_buddies")
          .update({ status: "declined" })
          .eq("trip_id", tripId)
          .eq("user_id", uid)
          .throwOnError()
      }
      window.location.assign("/app")
    } catch (e) {
      setDestructing(false)
      setConfirmDestructive(false)
      setError(
        (e as { message?: string })?.message ??
          (isOwner ? "Couldn't delete this trip." : "Couldn't leave this trip.")
      )
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-4 md:pt-6">
      <BackLink href={`/app/trips/${tripId}`} label="Trip" />

      <h1 className="mt-3 font-drift-display text-[30px] font-semibold leading-tight md:text-[36px]">
        Trip settings
      </h1>

      {error && (
        <p
          className="mt-4 rounded-xl border px-4 py-3 text-[13.5px]"
          style={{ borderColor: "rgba(255,99,88,0.35)", color: "rgba(255,140,130,0.95)" }}
        >
          {error}
        </p>
      )}

      {/* ---- Cover ---- */}
      <SectionLabel>Cover photo</SectionLabel>
      <section className="overflow-hidden rounded-2xl border border-aurora-border bg-aurora-glass">
        <div
          className="h-40 w-full bg-cover bg-center"
          style={{
            backgroundColor: "rgba(55,214,196,0.10)",
            backgroundImage: coverUrl
              ? `linear-gradient(180deg, rgba(8,19,29,0) 45%, rgba(8,19,29,0.5) 100%), url(${JSON.stringify(coverUrl)})`
              : undefined,
          }}
        />
        <div className="flex items-center justify-between p-4">
          <p className="text-[13px] text-drift-muted">
            {coverUrl ? "Shown at the top of the trip." : "No cover photo yet."}
          </p>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="rounded-full bg-drift-alt-bg px-4 py-2 text-[13.5px] font-semibold text-drift-ink disabled:opacity-60"
          >
            {uploading ? "Uploading…" : coverUrl ? "Change" : "Add photo"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={pickCover}
            className="hidden"
          />
        </div>
      </section>

      {/* ---- Name + dates ---- */}
      <SectionLabel>Details</SectionLabel>
      <section className="rounded-2xl border border-aurora-border bg-aurora-glass p-5">
        <label className="block text-[13px] text-drift-muted" htmlFor="trip-name">
          Trip name
        </label>
        <input
          id="trip-name"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Name your trip"
          className="mt-1.5 w-full rounded-xl border border-aurora-border bg-drift-alt-bg px-4 py-3 text-[15px] outline-none focus:border-aurora-teal/70"
        />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[13px] text-drift-muted" htmlFor="trip-start">
              Start date
            </label>
            <input
              id="trip-start"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-aurora-border bg-drift-alt-bg px-3 py-3 text-[15px] outline-none focus:border-aurora-teal/70"
            />
          </div>
          <div>
            <label className="block text-[13px] text-drift-muted" htmlFor="trip-end">
              End date
            </label>
            <input
              id="trip-end"
              type="date"
              value={end}
              min={start || undefined}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-aurora-border bg-drift-alt-bg px-3 py-3 text-[15px] outline-none focus:border-aurora-teal/70"
            />
          </div>
        </div>

        {datesInvalid && (
          <p className="mt-2 text-[12.5px]" style={{ color: "rgba(255,140,130,0.95)" }}>
            The end date is before the start date.
          </p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={saveDetails}
            disabled={saving || datesInvalid}
            className="rounded-full px-5 py-2.5 text-[14.5px] font-semibold text-aurora-teal-ink disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #37D6C4, #22B7D4)" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {savedAt && !saving && !error && (
            <span className="text-[13px] text-drift-muted">Saved</span>
          )}
        </div>
      </section>

      {/* ---- Privacy ---- */}
      <SectionLabel>Who can see this trip?</SectionLabel>
      <section className="rounded-2xl border border-aurora-border bg-aurora-glass p-5">
        <div className="flex flex-wrap gap-2">
          {PRIVACY.map((p) => (
            <button
              key={p.value}
              onClick={() => {
                const prev = privacy
                patch({ privacy: p.value }, () => setPrivacy(p.value)).then((ok) => {
                  if (!ok) setPrivacy(prev)
                })
              }}
              className={`rounded-full px-4 py-2 text-[13.5px] font-semibold transition-colors ${
                privacy === p.value
                  ? "bg-drift-coral text-white"
                  : "bg-drift-alt-bg text-drift-muted hover:text-drift-ink"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-2.5 text-[12px] text-drift-muted">
          {PRIVACY.find((p) => p.value === privacy)?.hint}
        </p>
      </section>

      {/* ---- Location tracking ---- */}
      <SectionLabel>Travel tracker</SectionLabel>
      <section className="rounded-2xl border border-aurora-border bg-aurora-glass p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[14.5px] font-semibold">Track this trip</p>
            <p className="mt-1 text-[12.5px] text-drift-muted">
              Records your route while the trip is running. The tracking itself
              happens in the Drift iOS app — turning it off here stops it
              everywhere.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={tracker}
            aria-label="Track this trip"
            onClick={() => {
              const prev = tracker
              patch({ travel_tracker: !tracker }, () => setTracker(!tracker)).then((ok) => {
                if (!ok) setTracker(prev)
              })
            }}
            className={`relative h-[30px] w-[52px] shrink-0 rounded-full transition-colors ${
              tracker ? "bg-aurora-teal" : "bg-drift-alt-bg"
            }`}
          >
            <span
              className={`absolute top-[3px] h-6 w-6 rounded-full bg-white transition-all ${
                tracker ? "left-[25px]" : "left-[3px]"
              }`}
            />
          </button>
        </div>

        {tracker && (
          <div className="mt-4 border-t border-aurora-border pt-4">
            <p className="text-[13px] text-drift-muted">Who can see your location</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {VISIBILITY.map((v) => (
                <button
                  key={v.value}
                  onClick={() => {
                    const prev = visibility
                    patch({ location_visibility: v.value }, () => setVisibility(v.value)).then(
                      (ok) => {
                        if (!ok) setVisibility(prev)
                      }
                    )
                  }}
                  className={`rounded-full px-4 py-2 text-[13.5px] font-semibold transition-colors ${
                    visibility === v.value
                      ? "bg-drift-coral text-white"
                      : "bg-drift-alt-bg text-drift-muted hover:text-drift-ink"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ---- Destructive ---- */}
      <SectionLabel>{isOwner ? "Danger zone" : "Leave"}</SectionLabel>
      <section className="rounded-2xl border p-5" style={{ borderColor: "rgba(255,99,88,0.28)" }}>
        <p className="text-[14.5px] font-semibold">
          {isOwner ? "Delete this trip" : "Leave this trip"}
        </p>
        <p className="mt-1 text-[12.5px] text-drift-muted">
          {isOwner
            ? "Permanently deletes the trip and everything in it. This cannot be undone."
            : "You'll be removed as a travel buddy. The trip and its photos stay with the owner."}
        </p>

        {confirmDestructive ? (
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={runDestructive}
              disabled={destructing}
              className="rounded-full px-5 py-2.5 text-[14.5px] font-semibold text-white disabled:opacity-60"
              style={{ background: "rgb(200,60,50)" }}
            >
              {destructing
                ? isOwner
                  ? "Deleting…"
                  : "Leaving…"
                : isOwner
                  ? "Yes, delete it"
                  : "Yes, leave"}
            </button>
            <button
              onClick={() => setConfirmDestructive(false)}
              disabled={destructing}
              className="text-[14px] font-semibold text-drift-muted"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDestructive(true)}
            className="mt-4 rounded-full border px-5 py-2.5 text-[14.5px] font-semibold"
            style={{ borderColor: "rgba(255,99,88,0.45)", color: "rgba(255,140,130,0.95)" }}
          >
            {isOwner ? "Delete trip" : "Leave trip"}
          </button>
        )}
      </section>

      <p className="mt-8 px-1 text-[12px] text-drift-muted">
        Travel buddies are managed in the Drift iOS app.
      </p>
    </main>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 mt-7 px-1 text-[11.5px] font-bold uppercase tracking-wider text-drift-muted">
      {children}
    </p>
  )
}
