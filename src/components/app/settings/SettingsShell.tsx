"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import ActivityPreference from "./ActivityPreference"
import GoogleConnection from "@/components/app/settings/GoogleConnection"
import { signOutAndForget } from "@/lib/drift/signOut"
// isCityish moved to lib/drift/chat.ts — the first-run flow asks the same
// question ("Where do you set out from?") and must filter it the same way.
import { resolvePlaceCandidates, isCityish } from "@/lib/drift/chat"
import BackLink from "@/components/app/BackLink"

// Web port of the iOS SettingsView: profile header, preferences (default
// trip privacy — stored locally like iOS UserDefaults), account (sign out),
// about, and a link to delete the account. Deletion is its own page
// (/app/settings/delete-account): it previews what happens to shared trips,
// verifies with an emailed code, and reconciles uncertain endings — none of
// which fits an inline confirm.

export interface SettingsProfile {
  displayName: string
  username: string | null
  avatarUrl: string | null
  email: string | null
  homeCity: string | null
}

const PRIVACY_OPTIONS = ["public", "friends", "private"] as const

export default function SettingsShell({ profile }: { profile: SettingsProfile }) {
  const [privacy, setPrivacy] = useState<string>("public")
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    setPrivacy(localStorage.getItem("defaultTripPrivacy") ?? "public")
  }, [])

  function updatePrivacy(v: string) {
    setPrivacy(v)
    localStorage.setItem("defaultTripPrivacy", v)
  }

  // Through signOutAndForget, like every other sign-out: it also forgets this
  // account's browser state and leaves by a hard navigation.
  async function signOut() {
    setSigningOut(true)
    await signOutAndForget()
  }

  return (
    <div className="mx-auto w-full max-w-xl px-5 pb-32 pt-8 lg:pt-12">
      <BackLink href="/app" label="Home" className="mb-5" />
      <h1 className="font-drift-display text-[28px] font-bold">Settings</h1>

      <ActivityPreference />
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

      {/* Language & region */}
      <SectionLabel>Language &amp; region</SectionLabel>
      <section className="divide-y divide-drift-divider overflow-hidden rounded-2xl border border-aurora-border bg-aurora-glass">
        <PrefSelect label="Language" storageKey="driftLanguage" fallback="en" options={LANGUAGES} />
        <PrefSelect label="Region" storageKey="driftRegion" fallback="US" options={REGIONS} />
        <PrefSelect label="Currency" storageKey="driftCurrency" fallback="USD" options={CURRENCIES} />
        <PrefSelect label="Units" storageKey="driftUnits" fallback="us" options={UNITS} />
      </section>
      <p className="mt-2 px-1 text-[12px] text-drift-muted">
        Currency and units apply to prices and weather shown here on the web.
      </p>

      {/* Account */}
      <SectionLabel>Account</SectionLabel>
      <GoogleConnection />

      {/* Download your data — its own page (/app/settings/export-data), for the
          same reason deletion is: what the file holds, and what it deliberately
          doesn't, needs a sentence or two. */}
      <section className="my-3 overflow-hidden rounded-2xl border border-aurora-border bg-aurora-glass">
        <Link
          href="/app/settings/export-data"
          className="flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-white/5"
        >
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-aurora-ink">Download your data</span>
            <span className="mt-1 block text-[12px] text-drift-muted">
              Your trips, expenses, saved places and photo links, in one file.
            </span>
          </span>
          <span aria-hidden className="text-[13px] text-drift-muted">›</span>
        </Link>
      </section>

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
        <Link
          href="/app/contact"
          className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-white/5"
        >
          <span className="text-[14.5px]">Send feedback</span>
          <span className="text-[13px] text-drift-muted">›</span>
        </Link>
        <Row label="Version" value="Drift for Web" />
        <Row label="Maps" value="© Mapbox © OpenStreetMap" />
        <Row label="Places & photos" value="Powered by Google" />
      </section>

      {/* Danger zone */}
      <SectionLabel>Danger zone</SectionLabel>
      <section className="overflow-hidden rounded-2xl border border-aurora-border bg-aurora-glass">
        <Link
          href="/app/settings/delete-account"
          className="flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-red-500/10"
        >
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-red-400">Delete account</span>
            <span className="mt-1 block text-[12px] text-drift-muted">
              See what&rsquo;s removed and what your travel group keeps before you confirm.
            </span>
          </span>
          <span aria-hidden className="text-[13px] text-drift-muted">›</span>
        </Link>
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
    // City-search mode: no destinationName (that biases resolve-place to POIs
    // near the place — the "Hotel & Casino" bug); then keep only city-ish hits.
    const cands = await resolvePlaceCandidates(q)
    if (seq.current !== s) return
    setSearching(false)
    const withCoords = cands.filter((c) => c.latitude != null && c.longitude != null)
    const cities = withCoords.filter(isCityish)
    setResults(
      (cities.length ? cities : withCoords).slice(0, 6).map((c) => ({
        name: c.name,
        country: (c.address ?? "").split(",").pop()?.trim() || null,
        lat: c.latitude!,
        lng: c.longitude!,
      }))
    )
  }

  async function pick(r: { name: string; country: string | null; lat: number; lng: number }) {
    setSaving(true)
    const db = createClient()
    const {
      data: { session },
    } = await createClient().auth.getSession()
    const uid = session?.user?.id
    if (uid) {
      try {
        await db
          .from("profiles")
          .update({ home_city: r.name, home_country: r.country, home_lat: r.lat, home_lng: r.lng })
          .eq("id", uid)
          .throwOnError()
      } catch (e) {
        // setCurrent(r.name) below used to run regardless, so the UI showed the new
        // home city while the profile row still held the old one.
        setSaving(false)
        alert(e instanceof Error ? `Couldn't save your home city: ${e.message}` : "Couldn't save your home city.")
        return
      }
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

const LANGUAGES: Array<[string, string]> = [
  ["en", "English"], ["es", "Español"], ["fr", "Français"], ["de", "Deutsch"],
  ["it", "Italiano"], ["pt", "Português"], ["ja", "日本語"], ["zh", "中文"],
]
const REGIONS: Array<[string, string]> = [
  ["US", "🇺🇸 United States"], ["GB", "🇬🇧 United Kingdom"], ["CA", "🇨🇦 Canada"],
  ["AU", "🇦🇺 Australia"], ["IN", "🇮🇳 India"], ["FR", "🇫🇷 France"],
  ["DE", "🇩🇪 Germany"], ["ES", "🇪🇸 Spain"], ["JP", "🇯🇵 Japan"],
]
const CURRENCIES: Array<[string, string]> = [
  ["USD", "USD (US$) — US Dollar"], ["EUR", "EUR (€) — Euro"], ["GBP", "GBP (£) — Pound"],
  ["CAD", "CAD (C$) — Canadian Dollar"], ["AUD", "AUD (A$) — Australian Dollar"],
  ["JPY", "JPY (¥) — Yen"], ["INR", "INR (₹) — Rupee"],
]
const UNITS: Array<[string, string]> = [
  ["us", "US (°F, mi)"], ["metric", "Metric (°C, km)"],
]

// localStorage-backed preference dropdown (Aurora dark). Values are read on the
// web for price/weather display; the store is client-only, like defaultTripPrivacy.
function PrefSelect({
  label,
  storageKey,
  fallback,
  options,
}: {
  label: string
  storageKey: string
  fallback: string
  options: Array<[string, string]>
}) {
  const [value, setValue] = useState(fallback)
  useEffect(() => {
    setValue(localStorage.getItem(storageKey) ?? fallback)
  }, [storageKey, fallback])
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3.5">
      <span className="text-[14.5px]">{label}</span>
      <select
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          localStorage.setItem(storageKey, e.target.value)
        }}
        className="max-w-[60%] truncate rounded-full border border-aurora-border bg-aurora-midnight2 px-3.5 py-1.5 text-[13px] font-medium text-aurora-ink outline-none focus:border-aurora-teal [color-scheme:dark]"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
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
