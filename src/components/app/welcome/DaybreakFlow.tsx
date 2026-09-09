"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { AnalyticsEvent, capture } from "@/lib/analytics"
import { checkTripActivated } from "@/lib/drift/activation"
import { isCityish, resolvePlaceCandidates, type PlaceCandidate } from "@/lib/drift/chat"
import {
  attemptKey,
  categoriesWithCounts,
  copyErrorMessage,
  firstOfMonth,
  mayHaveLanded,
  mintUuid,
  monthsYouCouldGo,
  parseCopyResponse,
  PUBLIC_ORIGIN,
  RESERVED_TRIP_IDS,
} from "@/lib/drift/inspire"
import { markDaybreakSeen, pickForShapes } from "@/lib/drift/daybreak"
import type { DaybreakGuide } from "@/lib/drift/inspirePromo"
import DaybreakSky from "./DaybreakSky"
import DaybreakProfileEditor from "./DaybreakProfileEditor"
import { BuildStep, CrewStep, IdentityStep, OriginStep, PickStep, ShapeStep } from "./DaybreakSteps"

/**
 * Drift's first-run flow on the web: six questions, and the sky gets lighter as
 * you go. Port of Drift/Views/DaybreakFlow.swift.
 *
 * WHAT IT REPLACES. A new account signed in and landed on /app with a globe
 * carrying nothing, no welcome and nothing to do. Web had no first-run routing
 * at all — the only new-user signal anywhere was an `isNew` boolean in the
 * protected layout, and it fed analytics.
 *
 * THE ONE THING IT REFUSES TO ASK. Every travel app opens on "Where are you
 * going?" — the hardest question in the product, put to someone at the moment
 * they know least, which is usually why they downloaded it. Drift has forty
 * finished trips, so this asks what kind of traveller you are and then answers
 * the question for you.
 *
 * NOTHING HERE IS A GATE. The account is fully usable before screen 1 and the
 * flow can be abandoned at any point: every screen past the first carries a
 * skip, the close button is always live, and the dismissal cookie is written on
 * MOUNT — so a force-refresh at question three lands in the app rather than
 * back at question one. A first-run flow that can trap someone is worse than no
 * first-run flow, which is the exact bug UsernameSetupView shipped.
 */

const STEPS = ["identity", "origin", "shape", "pick", "crew", "build"] as const
type Step = (typeof STEPS)[number]

export interface DaybreakProfile {
  displayName: string
  username: string
  avatarUrl: string | null
  homeCity: string | null
}

export default function DaybreakFlow({
  profile,
  guides,
}: {
  profile: DaybreakProfile
  guides: DaybreakGuide[]
}) {
  const router = useRouter()

  const [step, setStep] = useState(0)

  // 01
  const [displayName, setDisplayName] = useState(profile.displayName)
  const [username, setUsername] = useState(profile.username)
  const [editing, setEditing] = useState(false)

  // 02
  const [cityQuery, setCityQuery] = useState("")
  const [cityResults, setCityResults] = useState<PlaceCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [savingCity, setSavingCity] = useState(false)
  const [homeCity, setHomeCity] = useState(profile.homeCity)
  const searchSeq = useRef(0)

  // 03 — local, deliberately. Nothing on `profiles` holds shape tags and
  // inventing a column is a migration; the answer's real job is to filter the
  // very next screen, which it does without persisting anywhere.
  const [shapes, setShapes] = useState<ReadonlySet<string>>(new Set())

  // 04
  const [chosenTripId, setChosenTripId] = useState<string | null>(null)

  // 05
  const [wantsToInvite, setWantsToInvite] = useState(false)

  // 06
  const [buildStage, setBuildStage] = useState(0)
  const [buildError, setBuildError] = useState<string | null>(null)
  const [landedTripId, setLandedTripId] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copiedInvite, setCopiedInvite] = useState(false)
  const tickers = useRef<ReturnType<typeof setTimeout>[]>([])

  // MARK: Entry

  // Written here and nowhere else: the flow is "seen" the instant it is
  // reached, not when it is finished. See markDaybreakSeen.
  useEffect(() => {
    markDaybreakSeen()
  }, [])

  useEffect(() => () => tickers.current.forEach(clearTimeout), [])

  // MARK: Derived

  const categories = useMemo(() => categoriesWithCounts(guides), [guides])
  const suggested = useMemo(() => pickForShapes(guides, shapes), [guides, shapes])
  const chosenGuide = useMemo(
    () => guides.find((g) => g.tripId === chosenTripId) ?? null,
    [guides, chosenTripId]
  )
  const stopsLine = chosenGuide
    ? `${chosenGuide.stops} ${chosenGuide.stops === 1 ? "stop" : "stops"}`
    : "In order"

  const skyProgress = step / (STEPS.length - 1)
  const barFraction = (step + 1) / STEPS.length
  const name: Step = STEPS[step]

  // MARK: Leaving

  /** Called once, when the flow is done with — finished, skipped or closed. */
  const finish = useCallback(
    (tripId: string | null) => {
      router.push(tripId ? `/app/trips/${tripId}` : "/app")
    },
    [router]
  )

  // MARK: Work

  /**
   * `invite` is an ARGUMENT, not read from state.
   *
   * Screen 5 sets the intent and moves to screen 6 in the same handler, and a
   * closure built during that render still sees the old value — so reading
   * `wantsToInvite` here would mint no link for the one person who asked for
   * one, silently, on the screen whose entire subject is bringing somebody
   * with you. The state exists only so Try again can replay the same choice.
   */
  const build = useCallback(
    async (invite: boolean) => {
      const guide = guides.find((g) => g.tripId === chosenTripId)
      if (!guide) {
        finish(null)
        return
      }
      setBuildError(null)
      setBuildStage(0)
      tickers.current.forEach(clearTimeout)
      // Paced, not measured — copy-trip is ONE call that returns when the whole
      // itinerary has landed, so there are no intermediate events to report. The
      // last two rows wait for the real answer.
      tickers.current = [
        setTimeout(() => setBuildStage((s) => Math.max(s, 1)), 900),
        setTimeout(() => setBuildStage((s) => Math.max(s, 2)), 1800),
      ]

      // The first day of the leading month you could actually go — the same
      // derivation the Inspire "add as is" path uses, so the two never disagree
      // about when "later" is. You cannot leave today.
      const months = monthsYouCouldGo(localToday())
      const startDate = months.length ? firstOfMonth(months[0]) : localToday()

      // The trip id is minted HERE, not by the function. copy-trip inserts AT the
      // supplied id and answers a duplicate on it — this same copy having already
      // landed — with the trip that is already there, as a success. Without it a
      // fetch that timed out after the row committed would invite a retry that
      // wrote a SECOND trip, which on a first run would be someone's first two
      // trips being the same trip.
      const key = attemptKey(guide.tripId, startDate, null, null)
      const newTripId = RESERVED_TRIP_IDS.get(key) ?? mintUuid()
      RESERVED_TRIP_IDS.set(key, newTripId)

      try {
        const res = await fetch("/api/drift/copy-trip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_trip_id: guide.tripId,
            trip_id: newTripId,
            start_date: startDate,
          }),
        })
        const json: unknown = await res.json().catch(() => null)
        tickers.current.forEach(clearTimeout)

        if (!res.ok) {
          // Every 4xx is pre-write, so the next attempt is a genuinely fresh copy
          // and must not inherit this id.
          if (!mayHaveLanded(res.status)) RESERVED_TRIP_IDS.delete(key)
          setBuildError(copyErrorMessage(res.status))
          return
        }

        const parsed = parseCopyResponse(json, startDate)
        if (!parsed) {
          RESERVED_TRIP_IDS.delete(key)
          setBuildError(
            "Drift couldn't read the result of the copy. If the trip isn't in your list, refresh in a moment."
          )
          return
        }
        RESERVED_TRIP_IDS.delete(key)
        setLandedTripId(parsed.id)
        capture(AnalyticsEvent.CreateTrip, { source: "daybreak" })
        void checkTripActivated(parsed.id)

        setBuildStage(3)
        await sleep(500)
        setBuildStage(4)

        // Only now is there a trip to invite anyone to.
        if (invite) {
          const token = await mintInvite(parsed.id)
          if (token) {
            capture(AnalyticsEvent.InviteLinkCreated)
            setInviteUrl(`${PUBLIC_ORIGIN}/join/${token}`)
          }
        }
      } catch {
        // No answer ever arrived, so the row may exist. The id stays reserved so
        // a retry replays this copy rather than writing a second one.
        tickers.current.forEach(clearTimeout)
        setBuildError(copyErrorMessage(null))
      }
    },
    [chosenTripId, finish, guides]
  )

  /** Screen 5's two answers. Both land on screen 6 and start the copy; the only
   *  difference between them is whether a link is minted at the end of it. */
  const goBuild = useCallback(
    (invite: boolean) => {
      setWantsToInvite(invite)
      setStep(STEPS.indexOf("build"))
      void build(invite)
    },
    [build]
  )

  const back = useCallback(() => {
    if (step === 0) {
      finish(null)
      return
    }
    setStep(step - 1)
  }, [finish, step])

  async function searchCity() {
    const q = cityQuery.trim()
    if (!q || searching) return
    const s = ++searchSeq.current
    setSearching(true)
    // City-search mode: no destinationName (that biases resolve-place to POIs
    // near the place — the "Hotel & Casino" bug); then keep only city-ish hits.
    const cands = await resolvePlaceCandidates(q)
    if (searchSeq.current !== s) return
    setSearching(false)
    const withCoords = cands.filter((c) => c.latitude != null && c.longitude != null)
    const cities = withCoords.filter(isCityish)
    setCityResults((cities.length ? cities : withCoords).slice(0, 6))
  }

  async function pickCity(c: PlaceCandidate) {
    setSavingCity(true)
    try {
      const db = createClient()
      const {
        data: { session },
      } = await db.auth.getSession()
      const uid = session?.user?.id
      if (uid) {
        await db
          .from("profiles")
          .update({
            home_city: c.name,
            home_country: (c.address ?? "").split(",").pop()?.trim() || null,
            home_lat: c.latitude ?? null,
            home_lng: c.longitude ?? null,
          })
          .eq("id", uid)
          .throwOnError()
      }
      // Only after the write lands. Setting the label first shows a city the
      // row does not have, which is the bug Settings › Home city already had.
      setHomeCity(c.name)
      setCityResults([])
      setCityQuery("")
    } catch {
      // The question is optional and skippable; a failed write leaves the
      // previous answer standing rather than claiming a new one.
    }
    setSavingCity(false)
  }

  async function shareInvite() {
    if (!inviteUrl) return
    const text = "Come travel with me — here's the plan:"
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text, url: inviteUrl })
        return
      } catch {
        // Dismissed, or refused — fall through to the clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopiedInvite(true)
      setTimeout(() => setCopiedInvite(false), 2000)
    } catch {
      // The link is on screen in full; selecting it is the fallback.
    }
  }

  // MARK: Render

  return (
    <div className="relative flex min-h-[100dvh] flex-col text-aurora-ink">
      <DaybreakSky progress={skyProgress} />

      {/* Back on the left, a hairline of progress, and a close that is always
          live. The bar is almost redundant — the sky already says how far in
          you are — so it is 3px and nearly silent rather than a six-dot pager
          counting down screens the user did not agree to. */}
      <div className="relative z-10 mx-auto flex w-full max-w-[440px] items-center gap-[11px] px-[18px] pb-[18px] pt-2">
        <button
          type="button"
          onClick={back}
          aria-label={step === 0 ? "Close" : "Back"}
          disabled={name === "build" && !buildError}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-aurora-border bg-aurora-glass text-aurora-ink2 ${
            name === "build" && !buildError ? "opacity-0" : ""
          }`}
        >
          {step === 0 ? (
            <span className="text-[15px] leading-none">×</span>
          ) : (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="m15 5-7 7 7 7"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
        <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.14]">
          <div
            className="h-full rounded-full bg-aurora-teal transition-[width] duration-300"
            style={{ width: `${Math.max(6, barFraction * 100)}%` }}
          />
        </div>
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-[440px] flex-1 flex-col px-[18px] pb-[14px]">
        {name === "identity" && (
          <IdentityStep
            displayName={displayName}
            username={username}
            avatarUrl={profile.avatarUrl}
            onEdit={() => setEditing(true)}
            onNext={() => setStep(1)}
          />
        )}
        {name === "origin" && (
          <OriginStep
            query={cityQuery}
            onQuery={setCityQuery}
            onSearch={() => void searchCity()}
            searching={searching}
            saving={savingCity}
            results={cityResults}
            chosen={homeCity}
            onPick={(c) => void pickCity(c)}
            onNext={() => setStep(2)}
            onSkip={() => setStep(2)}
          />
        )}
        {name === "shape" && (
          <ShapeStep
            categories={categories}
            picked={shapes}
            onToggle={(slug) =>
              setShapes((prev) => {
                const next = new Set(prev)
                if (!next.delete(slug)) next.add(slug)
                return next
              })
            }
            onNext={() => setStep(3)}
            onSkip={() => {
              setShapes(new Set())
              setStep(3)
            }}
          />
        )}
        {name === "pick" && (
          <PickStep
            guides={suggested}
            chosen={chosenTripId}
            onChoose={setChosenTripId}
            onNext={() => setStep(4)}
            onBrowseAll={() => router.push("/app/inspire")}
          />
        )}
        {name === "crew" && (
          <CrewStep
            displayName={displayName}
            guide={chosenGuide}
            onInvite={() => goBuild(true)}
            onAlone={() => goBuild(false)}
          />
        )}
        {name === "build" && (
          <BuildStep
            tripTitle={chosenGuide?.title ?? ""}
            stopsLine={stopsLine}
            stage={buildStage}
            failed={buildError}
            inviteUrl={inviteUrl}
            copied={copiedInvite}
            onShareInvite={() => void shareInvite()}
            onOpen={() => finish(landedTripId)}
            onRetry={() => void build(wantsToInvite)}
          />
        )}
      </div>

      {editing && (
        <DaybreakProfileEditor
          displayName={displayName}
          username={username}
          avatarUrl={profile.avatarUrl}
          onSaved={(v) => {
            setDisplayName(v.displayName)
            setUsername(v.username)
            setEditing(false)
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  )
}

/** `create_trip_invite` RETURNS TABLE(...), so PostgREST hands back an ARRAY.
 *  Reading `.token` off the response object gives undefined and produces a
 *  /join/undefined link that the landing page then rejects. */
async function mintInvite(tripId: string): Promise<string | null> {
  try {
    const db = createClient()
    // `as never`: database.types.ts predates migration 20260823210813, so the
    // typed client does not know these function names yet.
    const { data, error } = await db.rpc("create_trip_invite" as never, {
      p_trip_id: tripId,
    } as never)
    if (error) return null
    return ((data as { token?: string }[] | null) ?? [])[0]?.token ?? null
  } catch {
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** The viewer's own calendar day as "yyyy-MM-dd" — never UTC, because "the
 *  month you could go" is a fact about the traveller's calendar. */
function localToday(): string {
  const t = new Date()
  return [
    t.getFullYear(),
    String(t.getMonth() + 1).padStart(2, "0"),
    String(t.getDate()).padStart(2, "0"),
  ].join("-")
}
