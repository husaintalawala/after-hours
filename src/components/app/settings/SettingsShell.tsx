"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { resolvePlaceCandidates } from "@/lib/drift/chat"
import BackLink from "@/components/app/BackLink"

// Web port of the iOS SettingsView: profile header, preferences (default
// trip privacy — stored locally like iOS UserDefaults), account (sign out),
// about, and the destructive delete-account flow (soft-delete profile +
// purge user content, mirroring the iOS implementation).

export interface SettingsProfile {
  displayName: string
  username: string | null
  avatarUrl: string | null
  email: string | null
  homeCity: string | null
}

const PRIVACY_OPTIONS = ["public", "friends", "private"] as const

export default function SettingsShell({ profile }: { profile: SettingsProfile }) {
  const router = useRouter()
  const [privacy, setPrivacy] = useState<string>("public")
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    setPrivacy(localStorage.getItem("defaultTripPrivacy") ?? "public")
  }, [])

  function updatePrivacy(v: string) {
    setPrivacy(v)
    localStorage.setItem("defaultTripPrivacy", v)
  }

  async function signOut() {
    setSigningOut(true)
    await createClient().auth.signOut()
    router.push("/app/login")
    router.refresh()
  }

  // Mirror of iOS deleteAccount(): soft-delete the profile, then best-effort
  // purge of user content (each delete tolerated to fail, like iOS try?).
  async function deleteAccount() {
    setDeleting(true)
    const supabase = createClient()
    const db = supabase as any
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (uid) {
      await db
        .from("profiles")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", uid)
      for (const [table, col] of [
        ["follows", "follower_id"],
        ["follows", "following_id"],
        ["likes", "user_id"],
        ["comments", "user_id"],
        ["notifications", "user_id"],
        ["steps", "user_id"],
        ["media", "user_id"],
        ["trips", "user_id"],
      ] as const) {
        try {
          await db.from(table).delete().eq(col, uid)
        } catch {
          /* best-effort, same as iOS */
        }
      }
    }
    await supabase.auth.signOut()
    router.push("/app/login")
    router.refresh()
  }

  return (
    <div className="mx-auto w-full max-w-xl px-5 pb-32 pt-8 lg:pt-12">
      <BackLink href="/app" label="Home" className="mb-5" />
      <h1 className="font-drift-display text-[28px] font-bold">Settings</h1>

      {/* Profile */}
      <section className="mt-6 rounded-2xl border border-aurora-border bg-aurora-glass p-5">
        <div className="flex items-center gap-4">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt=""
              className="h-16 w-16 rounded-full object-cover ring-2 ring-drift-coral/70"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-drift-coral-50 font-drift-display text-xl font-bold text-drift-coral ring-2 ring-drift-coral/70">
              {profile.displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-[17px] font-bold">{profile.displayName}</p>
            {profile.username && (
              <p className="truncate text-[13px] text-drift-muted">@{profile.username}</p>
            )}
            {profile.email && (
              <p className="truncate text-[12.5px] text-drift-muted">{profile.email}</p>
            )}
          </div>
        </div>
        <p className="mt-3 text-[12px] text-drift-muted">
          Edit your photo and profile details in the Drift iOS app.
        </p>
      </section>

      {/* Preferences */}
      <SectionLabel>Preferences</SectionLabel>
      <section className="rounded-2xl border border-aurora-border bg-aurora-glass p-5">
        <p className="text-[14.5px] font-semibold">Default trip privacy</p>
        <div className="mt-3 flex gap-2">
          {PRIVACY_OPTIONS.map((p) => (
            <button
              key={p}
              onClick={() => updatePrivacy(p)}
              className={`rounded-full px-4 py-2 text-[13.5px] font-semibold capitalize transition-colors ${
                privacy === p
                  ? "bg-drift-coral text-white"
                  : "bg-drift-alt-bg text-drift-muted hover:text-drift-ink"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <p className="mt-2.5 text-[12px] text-drift-muted">
          Applies to trips you create here on the web.
        </p>
      </section>

      {/* Home */}
      <SectionLabel>Home</SectionLabel>
      <section className="rounded-2xl border border-aurora-border bg-aurora-glass p-5">
        <p className="text-[14.5px] font-semibold">Home city</p>
        <p className="mt-1 text-[12px] text-drift-muted">
          Sets your base for the &ldquo;furthest from home&rdquo; travel stat.
        </p>
        <HomeCity initial={profile.homeCity} />
      </section>

      {/* Account */}
      <SectionLabel>Account</SectionLabel>
      <section className="overflow-hidden rounded-2xl border border-aurora-border bg-aurora-glass">
        <button
          onClick={signOut}
          disabled={signingOut}
          className="flex w-full items-center gap-3 px-5 py-4 text-left text-[15px] font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
        >
          <span className="text-[16px]">↪</span>
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </section>

      {/* About */}
      <SectionLabel>About</SectionLabel>
      <section className="divide-y divide-drift-divider overflow-hidden rounded-2xl border border-aurora-border bg-aurora-glass">
        <Row label="Version" value="Drift for Web" />
        <Row label="Maps" value="© Mapbox © OpenStreetMap" />
        <Row label="Places & photos" value="Powered by Google" />
      </section>

      {/* Danger zone */}
      <SectionLabel>Danger zone</SectionLabel>
      <section className="rounded-2xl border border-aurora-border bg-aurora-glass p-5">
        {!confirmingDelete ? (
          <>
            <button
              onClick={() => setConfirmingDelete(true)}
              className="text-[15px] font-semibold text-red-600 transition-opacity hover:opacity-70"
            >
              Delete account
            </button>
            <p className="mt-2 text-[12px] text-drift-muted">
              This will permanently delete your account and all associated data.
            </p>
          </>
        ) : (
          <>
            <p className="text-[14.5px] font-semibold text-red-600">
              Delete your account?
            </p>
            <p className="mt-1.5 text-[13px] text-drift-muted">
              This action cannot be undone. All your trips, media, and data will be
              permanently deleted.
            </p>
            <div className="mt-4 flex gap-2.5">
              <button
                onClick={deleteAccount}
                disabled={deleting}
                className="rounded-full bg-red-600 px-5 py-2.5 text-[13.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="rounded-full bg-drift-alt-bg px-5 py-2.5 text-[13.5px] font-semibold text-drift-muted"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

// Search a city and save it (name + country + coords) to profiles.home_*.
function HomeCity({ initial }: { initial: string | null }) {
  const [current, setCurrent] = useState<string | null>(initial)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<
    Array<{ name: string; country: string | null; lat: number; lng: number }>
  >([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const seq = useRef(0)

  async function search(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q || searching) return
    const s = ++seq.current
    setSearching(true)
    const cands = await resolvePlaceCandidates(q, q)
    if (seq.current !== s) return
    setSearching(false)
    setResults(
      cands
        .filter((c) => c.latitude != null && c.longitude != null)
        .slice(0, 6)
        .map((c) => ({
          name: c.name,
          country: (c.address ?? "").split(",").pop()?.trim() || null,
          lat: c.latitude!,
          lng: c.longitude!,
        }))
    )
  }

  async function pick(r: { name: string; country: string | null; lat: number; lng: number }) {
    setSaving(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createClient() as any
    const {
      data: { session },
    } = await createClient().auth.getSession()
    const uid = session?.user?.id
    if (uid) {
      await db
        .from("profiles")
        .update({ home_city: r.name, home_country: r.country, home_lat: r.lat, home_lng: r.lng })
        .eq("id", uid)
    }
    setCurrent(r.name)
    setResults([])
    setQuery("")
    setSaving(false)
  }

  return (
    <div className="mt-3">
      {current && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-drift-coral-50 px-3.5 py-2.5">
          <span className="text-[15px]">📍</span>
          <span className="flex-1 text-[14px] font-semibold text-drift-ink">{current}</span>
          <span className="text-[12px] text-drift-muted">{saving ? "Saving…" : "Home"}</span>
        </div>
      )}
      <form onSubmit={search} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={current ? "Change home city…" : "Search your home city…"}
          className="min-w-0 flex-1 rounded-full border border-drift-divider bg-drift-alt-bg px-4 py-2.5 text-[14px] outline-none focus:border-drift-coral"
        />
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="shrink-0 rounded-full bg-drift-coral px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {searching ? "…" : "Search"}
        </button>
      </form>
      {results.length > 0 && (
        <div className="mt-2 space-y-1">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => pick(r)}
              disabled={saving}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-drift-alt-bg disabled:opacity-60"
            >
              <span className="text-[15px]">🔎</span>
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 mt-7 px-1 text-[11.5px] font-bold uppercase tracking-wider text-drift-muted">
      {children}
    </p>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <span className="text-[14.5px]">{label}</span>
      <span className="text-[13px] text-drift-muted">{value}</span>
    </div>
  )
}
