"use client"

import { useEffect, useRef, useState } from "react"
import { resolvePlaceCandidates, placePhotoUrl, type PlaceCandidate } from "@/lib/drift/chat"
import { fetchDestinationFacts, type DestinationFacts } from "@/lib/drift/facts"

// The destination Overview guide (web slice of DestinationOverviewGuide):
// glanceable "guide facts" (quick-facts chips + best-time seasonality bar +
// budget card) on top, then the "Top things to do" polaroid rail (shared POI
// cache) + "Tours & tickets" (Viator, bookable). All fetched lazily on open.

interface Tour {
  id: string
  name: string
  photoUrl?: string | null
  priceLabel?: string | null
  rating?: number | null
  bookingUrl?: string | null
}

export default function DestinationGuide({
  label,
  country,
  lat,
  lng,
  month,
}: {
  label: string
  country: string | null
  lat: number | null
  lng: number | null
  /** 1…12 — the month the user is at this city (for the weather chip + season marker). */
  month?: number | null
}) {
  const [facts, setFacts] = useState<DestinationFacts | null>(null)
  const [things, setThings] = useState<PlaceCandidate[] | null>(null)
  const [tours, setTours] = useState<Tour[] | null>(null)
  const loaded = useRef<string | null>(null)

  useEffect(() => {
    if (loaded.current === label) return
    loaded.current = label
    setFacts(null)
    setThings(null)
    setTours(null)
    // Facts are non-blocking: the guide (rail) renders immediately; the modules
    // fade in when Gemini returns. Fails open to null → nothing rendered.
    fetchDestinationFacts(label, country).then(setFacts)
    resolvePlaceCandidates("top attractions", label, country ?? undefined).then((cs) =>
      setThings(cs.filter((c) => placePhotoUrl(c)).slice(0, 8))
    )
    fetch("/api/drift/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "activities",
        destinationName: label,
        lat: lat ?? undefined,
        lng: lng ?? undefined,
        count: 8,
      }),
    })
      .then((r) => (r.ok ? r.json() : { candidates: [] }))
      .then((j) => setTours((j.candidates ?? []).slice(0, 8)))
      .catch(() => setTours([]))
  }, [label, country, lat, lng])

  return (
    <div className="space-y-7">
      {/* Guide facts — chips + best-time + budget (fails open to nothing) */}
      <GuideFacts facts={facts} month={month ?? null} />

      {/* Top things to do — polaroid rail */}
      <section>
        <h3 className="font-drift-display text-[22px] font-semibold">Top things to do</h3>
        {things === null ? (
          <GuideSkeleton />
        ) : things.length === 0 ? (
          <p className="mt-2 text-[14px] text-drift-text-tertiary">
            Nothing here yet — ask Drift what&rsquo;s worth seeing.
          </p>
        ) : (
          <div className="mt-3 flex gap-3.5 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {things.map((c) => (
              <div
                key={c.id}
                className="relative h-[210px] w-[150px] shrink-0 overflow-hidden rounded-2xl shadow-[0_10px_26px_-14px_rgba(31,31,36,0.4)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={placePhotoUrl(c, 480)!}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <span className="absolute left-2 top-2 max-w-[85%] rounded-lg bg-aurora-warn px-2 py-1 text-[10.5px] font-bold uppercase leading-tight tracking-wide text-white shadow">
                  {c.name}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Tours & tickets — Viator, bookable */}
      <section>
        <h3 className="font-drift-display text-[22px] font-semibold">Tours &amp; tickets</h3>
        {tours === null ? (
          <GuideSkeleton />
        ) : tours.length === 0 ? (
          <p className="mt-2 text-[14px] text-drift-text-tertiary">
            No bookable tours found for {label}.
          </p>
        ) : (
          <div className="mt-3 flex gap-3.5 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tours.map((t) => (
              <div
                key={t.id}
                className="w-[210px] shrink-0 overflow-hidden rounded-2xl border border-aurora-border bg-aurora-glass"
              >
                <div className="h-[120px] bg-drift-alt-bg">
                  {t.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.photoUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="p-3">
                  <p className="line-clamp-2 text-[13.5px] font-semibold leading-snug">
                    {t.name}
                  </p>
                  <p className="mt-1 text-[12px] text-drift-muted">
                    {[
                      t.rating != null && t.rating > 0 ? `★ ${t.rating.toFixed(1)}` : null,
                      t.priceLabel,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {t.bookingUrl && (
                    <a
                      href={t.bookingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block rounded-full bg-drift-coral px-3 py-1.5 text-[12px] font-semibold text-white"
                    >
                      Book
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Guide facts — chips + best-time seasonality bar + budget card. Everything is
// fail-open: a null fact is omitted; if nothing has data, the block renders
// nothing (the rail below stays). Ported from iOS DestinationGuideWidgets.
// ---------------------------------------------------------------------------

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MONTH_INITIAL = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"]

const SEASON_COLOR: Record<string, string> = {
  peak: "#37D6C4", // aurora teal
  shoulder: "#E7A24B", // aurora warn
}
const SEASON_OFF = "rgba(125,140,152,0.40)" // aurora-ink3, muted

function GuideFacts({ facts, month }: { facts: DestinationFacts | null; month: number | null }) {
  if (!facts) return null

  const chips = buildChips(facts, month)
  const hasSeason = Array.isArray(facts.seasonality) && facts.seasonality.length === 12
  const level = typeof facts.budget_level === "number" ? facts.budget_level : 0
  const hasBudget = level > 0

  if (chips.length === 0 && !hasSeason && !hasBudget) return null

  return (
    <section className="space-y-3">
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <span
              key={c.text}
              className="inline-flex items-center gap-1.5 rounded-full border border-aurora-border bg-aurora-glass px-3 py-2 text-[13px] font-medium text-aurora-ink"
            >
              <FactIcon name={c.icon} className="text-aurora-teal" />
              {c.text}
            </span>
          ))}
        </div>
      )}

      {(hasSeason || hasBudget) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {hasSeason && <BestTimeCard seasonality={facts.seasonality!} month={month} />}
          {hasBudget && <BudgetCard level={level} why={facts.budget_why ?? ""} />}
        </div>
      )}
    </section>
  )
}

type ChipIcon = "card" | "temp" | "shield" | "chat" | "drop" | "plug" | "walk"
interface FactChip {
  icon: ChipIcon
  text: string
}

function buildChips(f: DestinationFacts, month: number | null): FactChip[] {
  const out: FactChip[] = []
  const add = (icon: ChipIcon, text: string | null | undefined) => {
    const t = (text ?? "").trim()
    if (t) out.push({ icon, text: t })
  }

  add("card", f.currency)

  // Weather: avg daily-high for the trip month, when both are known.
  if (
    month != null &&
    month >= 1 &&
    month <= 12 &&
    Array.isArray(f.monthly_high_c) &&
    f.monthly_high_c.length === 12
  ) {
    const t = f.monthly_high_c[month - 1]
    if (typeof t === "number" && Number.isFinite(t)) {
      add("temp", `${Math.round(t)}°C in ${MONTH_SHORT[month - 1]}`)
    }
  }

  add("shield", f.safety)
  add("chat", f.language)
  add("drop", f.tap_water)

  // Plug + voltage combine into one chip ("Type C/F · 230V").
  const plug = (f.plug ?? "").trim()
  const volt = (f.voltage ?? "").trim()
  const plugText = plug && volt ? `${plug} · ${volt}` : plug || volt
  add("plug", plugText)

  add("walk", f.walkable)
  return out
}

function BestTimeCard({ seasonality, month }: { seasonality: string[]; month: number | null }) {
  const tripSeason =
    month != null && month >= 1 && month <= 12 ? seasonality[month - 1]?.toLowerCase() : null

  return (
    <div className="rounded-2xl border border-aurora-border bg-aurora-glass p-3.5">
      <p className="text-[10px] font-extrabold tracking-[0.1em] text-aurora-ink3">BEST TIME</p>
      <div className="mt-2 flex gap-[2px]">
        {seasonality.map((s, i) => {
          const key = s?.toLowerCase() ?? ""
          const bg = SEASON_COLOR[key] ?? SEASON_OFF
          const isCurrent = month != null && i === month - 1
          return (
            <div key={i} className="relative flex-1">
              {isCurrent && (
                <span className="absolute -top-[6px] left-1/2 h-0 w-0 -translate-x-1/2 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent border-t-aurora-ink" />
              )}
              <div className="h-[22px] rounded-[3px]" style={{ backgroundColor: bg }} />
            </div>
          )
        })}
      </div>
      <div className="mt-1 flex gap-[2px]">
        {MONTH_INITIAL.map((m, i) => {
          const isCurrent = month != null && i === month - 1
          return (
            <span
              key={i}
              className={`flex-1 text-center text-[8px] ${
                isCurrent ? "font-bold text-aurora-teal" : "text-aurora-ink3"
              }`}
            >
              {m}
            </span>
          )
        })}
      </div>
      {tripSeason && (
        <p className="mt-2 text-[13px] font-semibold text-aurora-ink">
          You&rsquo;re on <span className="text-aurora-teal">{tripSeason}</span>
        </p>
      )}
    </div>
  )
}

function BudgetCard({ level, why }: { level: number; why: string }) {
  return (
    <div className="rounded-2xl border border-aurora-border bg-aurora-glass p-3.5">
      <p className="text-[10px] font-extrabold tracking-[0.1em] text-aurora-ink3">BUDGET</p>
      <div className="mt-2 flex gap-1.5">
        {[1, 2, 3].map((i) => {
          const active = i === level
          return (
            <span
              key={i}
              className={`flex-1 rounded-lg py-1.5 text-center text-[13px] font-bold ${
                active ? "" : "bg-aurora-glass2 text-aurora-ink3"
              }`}
              style={active ? { backgroundColor: "#37D6C4", color: "#04231F" } : undefined}
            >
              {"$".repeat(i)}
            </span>
          )
        })}
      </div>
      {why && <p className="mt-2 text-[13px] text-aurora-ink2">{why}</p>}
    </div>
  )
}

function FactIcon({ name, className }: { name: ChipIcon; className?: string }) {
  const common = {
    width: 13,
    height: 13,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  }
  switch (name) {
    case "card":
      return (
        <svg {...common}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      )
    case "temp":
      return (
        <svg {...common}>
          <path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0z" />
        </svg>
      )
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z" />
          <path d="m9 11.5 2 2 4-4" />
        </svg>
      )
    case "chat":
      return (
        <svg {...common}>
          <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" />
        </svg>
      )
    case "drop":
      return (
        <svg {...common}>
          <path d="M12 2.7l5.7 5.7a8 8 0 1 1-11.4 0z" />
        </svg>
      )
    case "plug":
      return (
        <svg {...common}>
          <path d="M9 3v5M15 3v5" />
          <path d="M7 8h10v2.5a5 5 0 0 1-10 0z" />
          <path d="M12 15.5V22" />
        </svg>
      )
    case "walk":
      return (
        <svg {...common}>
          <circle cx="13" cy="4" r="1.6" />
          <path d="M12.5 21l-1-6-2.5-2.5.8-4 2.7 1.7 2.5.3" />
          <path d="M11.5 15l3 1.5 1.5 4.5" />
        </svg>
      )
  }
}

function GuideSkeleton() {
  return (
    <div className="mt-3 flex gap-3.5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[180px] w-[150px] animate-pulse rounded-2xl bg-aurora-glass" />
      ))}
    </div>
  )
}
