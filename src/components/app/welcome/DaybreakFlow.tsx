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
  monthOf,
  monthsYouCouldGo,
  parseCopyResponse,
  PUBLIC_ORIGIN,
  RESERVED_TRIP_IDS,
  type DayStr,
} from "@/lib/drift/inspire"
import { CATEGORY_ORDER } from "@/lib/drift/inspire"
import {
  DEFAULT_BUDGET,
  DEFAULT_RHYTHM,
  markDaybreakSeen,
  rankGuides,
  type Coord,
  type TripLength,
} from "@/lib/drift/daybreak"
import { backdropAt } from "@/lib/drift/daybreakArt"
import type { DaybreakGuide } from "@/lib/drift/inspirePromo"
import DaybreakSky from "./DaybreakSky"
import DaybreakProfileEditor from "./DaybreakProfileEditor"
import {
  Backdrop,
  BuildStep,
  CrewStep,
  IdentityStep,
  MosaicStep,
  OriginStep,
  PickStep,
  StyleStep,
} from "./DaybreakSteps"

/**
 * Drift's first-run flow on the web: seven questions over the photographs the
 * app is made of. Port of Drift/Views/DaybreakFlow.swift.
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

/**
 * SEVEN, and no more. Every screen past the first is skippable and the close is
 * always live, but length is its own kind of gate — a flow long enough to feel
 * like a form is one people leave.
 */
const STEPS = ["identity", "origin", "shape", "style", "pick", "crew", "build"] as const
type Step = (typeof STEPS)[number]

/**
 * How long the field waits before it asks.
 *
 * `resolvePlaceCandidates` is a POST to the resolve-place edge function, so one
 * per keystroke is a paid call per keystroke. 300ms is long enough that typing
 * "Lisbon" costs one lookup and short enough that the list appears while the
 * finger is still on the keyboard — iOS's PlacesAutocompleteService waits 400.
 */
const CITY_DEBOUNCE_MS = 300

/** The shortest query worth spending a lookup on, matching iOS's `minChars`.
 *  Two letters match half the world and the answer is noise. Applies only to
 *  the type-ahead: an explicit Enter or Search asks whatever was typed. */
const CITY_MIN_CHARS = 3

export interface DaybreakProfile {
  displayName: string
  username: string
  avatarUrl: string | null
  homeCity: string | null
  /** Written by screen 2 on a previous visit, and until now never read back. */
  homeCoord: Coord | null
}

export default function DaybreakFlow({
  profile,
  guides,
  userId,
}: {
  profile: DaybreakProfile
  guides: DaybreakGuide[]
  /// Whose first run this is. The marker is per ACCOUNT, not per browser —
  /// without it, the first person through closed the flow for everyone who
  /// signed in here afterwards.
  userId: string
}) {
  const router = useRouter()

  const [step, setStep] = useState(0)

  // 01
  const [displayName, setDisplayName] = useState(profile.displayName)
  const [username, setUsername] = useState(profile.username)
  /** In state, not read from the prop, because the photo can now be CHANGED
   *  here. The prop is what the server rendered; a picture chosen ten seconds
   *  ago has to reach the card behind the sheet without a page load, which is
   *  the half of "upload, then point the row at it" that gets forgotten. */
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl)
  const [editing, setEditing] = useState(false)

  // 02
  const [cityQuery, setCityQuery] = useState("")
  const [cityResults, setCityResults] = useState<PlaceCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [savingCity, setSavingCity] = useState(false)
  const [homeCity, setHomeCity] = useState(profile.homeCity)
  /** Feeds the distance on each guide card — the reason screen 2 exists at all
   *  beyond Travel Stats. Held in state rather than read from the prop so a
   *  city picked NOW reaches screen 4 in this same session: the server
   *  component that supplied the prop rendered before the question was asked. */
  const [homeCoord, setHomeCoord] = useState<Coord | null>(profile.homeCoord)
  const searchSeq = useRef(0)

  // 03 — local, deliberately. Nothing on `profiles` holds shape tags or a trip
  // length and inventing columns is a migration; the answers' real job is to
  // rank the very next screen, which they do without persisting anywhere.
  const [shapes, setShapes] = useState<ReadonlySet<string>>(new Set())
  const [length, setLength] = useState<TripLength>("any")

  // 04 — NOT invented fields. These are two of the six columns of
  // `user_travel_preferences`, and both are read server-side by build-itinerary
  // and refine-itinerary, so answering here is load-bearing immediately.
  // Seeded with the column defaults so a screen nobody touched writes back what
  // the row already holds.
  // No default. Pace and budget can start on the middle option because every
  // guide has one; party cannot, because pre-selecting "couple" would rank the
  // shelf on an answer nobody gave. "" reads as not-asked all the way down to
  // rankGuides' miss().
  const [party, setParty] = useState("")
  const [rhythm, setRhythm] = useState(DEFAULT_RHYTHM)
  const [budget, setBudget] = useState(DEFAULT_BUDGET)

  // 05
  const [chosenTripId, setChosenTripId] = useState<string | null>(null)

  // 06
  const [wantsToInvite, setWantsToInvite] = useState(false)

  // 07
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
    markDaybreakSeen(userId)
  }, [userId])

  useEffect(() => () => tickers.current.forEach(clearTimeout), [])

  // MARK: Derived

  /**
   * The seven tiles.
   *
   * `categoriesWithCounts` drops a category no guide carries — right, because a
   * tile that opens an empty shelf is worse than one fewer tile. But when the
   * shelf itself failed to arrive EVERY count is zero, and the filter turns a
   * question into a blank screen: seven tiles that cannot be photographed is a
   * slow network, seven tiles that cannot be drawn is a broken product. A failed
   * query and an empty shelf must not render the same, so an empty shelf falls
   * back to the full seven, which the tiles paint as their designed placeholder
   * and which stay readable and tappable with nothing behind them.
   */
  const categories = useMemo(
    () => (guides.length ? categoriesWithCounts(guides) : CATEGORY_ORDER),
    [guides]
  )

  /**
   * The three the flow offers.
   *
   * Everything the previous two screens collected finally gets read here: the
   * shapes, the length, and the month they would actually leave in.
   * `rankGuides` ranks rather than filters, so this can never come back empty
   * and there is no "if the filter emptied it, fall back" branch left to get
   * out of step with the filter it was compensating for.
   */
  const suggested = useMemo(
    () =>
      rankGuides(guides, {
        shapes,
        length,
        party: party || null,
        rhythm: rhythm || null,
        budget: budget || null,
        // The month of firstDepartureDate — the month the copy will actually
        // start in, not the month it is today. Ranking for "now" would
        // recommend against a departure date nobody is ever offered.
        departureMonth: monthOf(firstDepartureDate()).month,
      }).slice(0, 3),
    [guides, shapes, length, party, rhythm, budget]
  )
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

  /**
   * A different photograph per screen, walked DOWN the shelf so consecutive
   * screens are never the same picture. The crew and build screens are about a
   * trip that has already been chosen, so they show that guide's own hero
   * instead of carrying on down the shelf.
   *
   * Derived, never stored by an effect: the shelf reaches this component from a
   * single server render, and a `[]`-deps effect closing over it is the trap
   * GlobeHero already paid for.
   */
  const backdrop = useMemo(
    () =>
      chosenGuide && (name === "crew" || name === "build")
        ? chosenGuide.backdrop
        : backdropAt(step, guides),
    [chosenGuide, name, step, guides]
  )

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

      const startDate = firstDepartureDate()

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

  /**
   * One lookup, whoever asked for it — the debounce below or an explicit Enter.
   *
   * SEQUENCED, not just awaited. Type-ahead means several of these can be in
   * flight and they do not come back in order: "Lis" resolving after "Lisbon"
   * would replace the right list with a staler one, which reads as the field
   * ignoring the last thing typed. Only the newest request is allowed to write.
   * Same `seq` counter as Settings › Home city, for the same reason.
   */
  const lookUpCity = useCallback(async (raw: string, citiesOnly: boolean) => {
    const q = raw.trim()
    if (!q) return
    const s = ++searchSeq.current
    setSearching(true)
    // City-search mode: no destinationName (that biases resolve-place to POIs
    // near the place — the "Hotel & Casino" bug); then keep only city-ish hits.
    // A failed call answers [] rather than throwing, so a lookup that does not
    // land leaves the dropdown empty instead of half-drawn.
    const cands = await resolvePlaceCandidates(q)
    if (searchSeq.current !== s) return
    setSearching(false)
    const withCoords = cands.filter((c) => c.latitude != null && c.longitude != null)
    const cities = withCoords.filter(isCityish)
    // CITIES ONLY WHILE TYPING. `resolve-place` is a resolver, not a prefix
    // predictor — iOS's autocomplete answers "Kyo" with Kyoto, this answers it
    // with a sushi bar in Salem, Oregon and two clinics, because half a word
    // matches a business name long before it matches a city. Falling back to
    // whatever came back is right for a query somebody deliberately submitted
    // and wrong for one they are still halfway through: on this screen it fills
    // the answer to "where do you set out from" with places nobody lives.
    // Quiet until it has a city to offer.
    const shown = citiesOnly ? cities : cities.length ? cities : withCoords
    setCityResults(shown.slice(0, 6))
  }, [])

  /**
   * Suggestions as you type, which is what iOS has done here all along — this
   * screen was submit-driven, a field and a Search button, and was reported
   * twice as having no autocomplete. A first-run question answered by typing a
   * city name and pressing nothing is the interaction people expect; a text box
   * that only responds to a button reads as broken before it reads as different.
   *
   * The Search button stays as the floor. Enter still submits, and it is the
   * way past the three-character gate for somebody whose city is shorter.
   */
  useEffect(() => {
    const q = cityQuery.trim()
    if (q.length < CITY_MIN_CHARS) {
      // Nothing, rather than the answer to a query two keystrokes ago.
      setCityResults([])
      setSearching(false)
      return
    }
    const timer = setTimeout(() => void lookUpCity(q, true), CITY_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [cityQuery, lookUpCity])

  async function pickCity(c: PlaceCandidate) {
    // Retire every in-flight lookup. Without this, a request fired before the
    // tap lands afterwards and re-opens the dropdown over a question that has
    // just been answered.
    searchSeq.current++
    setSearching(false)
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
      // And the coordinates with it, so the cards two screens later measure
      // from the city just picked rather than waiting for the next page load.
      // A city with no coordinates simply means no distance on the cards — not
      // a fabricated one, and not a stale one from a previous answer.
      setHomeCoord(
        c.latitude != null && c.longitude != null
          ? { lat: c.latitude, lng: c.longitude }
          : null
      )
      setCityResults([])
      setCityQuery("")
    } catch {
      // The question is optional and skippable; a failed write leaves the
      // previous answer standing rather than claiming a new one.
    }
    setSavingCity(false)
  }

  /**
   * Screen 4, straight into `user_travel_preferences`.
   *
   * MERGED, NEVER REPLACED. The row has six answer columns and this screen holds
   * two of them; a whole-row write would blank `food_moods`, `priorities`,
   * `mobility_style` and `notes` for anyone who had already tuned them on the
   * phone. PostgREST's upsert only sets the columns present in the payload, so
   * the merge is the write rather than a read-modify-write around it — which
   * also means two devices answering different screens cannot clobber each
   * other, as iOS's load-then-save-the-whole-row can.
   *
   * `user_id` is the primary key, so `onConflict` is the row's own identity and
   * the insert and the update are the same call. RLS has `owner update` and
   * `owner upsert` policies keyed on `auth.uid()`, so a write for anybody else
   * is refused rather than silently dropped.
   *
   * Fire and forget, and the flow never waits on it: the screen is skippable,
   * nothing downstream in this session reads the answer back, and no part of the
   * UI claims the save succeeded. A failure here costs a preference, not a trip.
   */
  const saveStyle = useCallback(async (pace: string, spend: string) => {
    // Empty means the traveller skipped and then came back through this screen
    // without touching it. Writing "" would put a value the server's vocabulary
    // has never heard of into a column build-itinerary compares with ===.
    if (!pace || !spend) return
    try {
      const db = createClient()
      const {
        data: { session },
      } = await db.auth.getSession()
      const uid = session?.user?.id
      if (!uid) return
      await db
        .from("user_travel_preferences")
        .upsert(
          {
            user_id: uid,
            travel_rhythm: pace,
            budget_style: spend,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        )
        .throwOnError()
    } catch {
      // Optional and skippable, and the next screen is already on its way.
    }
  }, [])

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
      {/* The photograph IS the ground. The sky survives only as the fallback
          beneath it, for the moment before the shelf lands and for a shelf that
          never does. */}
      <DaybreakSky progress={skyProgress} />
      <Backdrop plate={backdrop} deep={name === "shape" || name === "pick"} />

      {/* Back on the left, a hairline of progress, and a close that is always
          live. The bar is almost redundant — the sky already says how far in
          you are — so it is 3px and nearly silent rather than a seven-dot pager
          counting down screens the user did not agree to.

          The right padding clears the photo credit, which rides at the top
          right of this same column — the same reservation GuideCard makes for
          the same chip, plus that strip's own 18px inset, because here the two
          are siblings rather than one inside the other. */}
      <div className="relative z-10 mx-auto flex w-full max-w-[440px] items-center gap-[11px] pb-[18px] pl-[18px] pr-[104px] pt-2">
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
            avatarUrl={avatarUrl}
            onEdit={() => setEditing(true)}
            onNext={() => setStep(1)}
          />
        )}
        {name === "origin" && (
          <OriginStep
            query={cityQuery}
            onQuery={setCityQuery}
            onSearch={() => void lookUpCity(cityQuery, false)}
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
          <MosaicStep
            categories={categories}
            shelf={guides}
            picked={shapes}
            onToggle={(slug) =>
              setShapes((prev) => {
                const next = new Set(prev)
                if (!next.delete(slug)) next.add(slug)
                return next
              })
            }
            length={length}
            onLength={setLength}
            onNext={() => setStep(3)}
            onSkip={() => {
              // Skip means "I did not answer this screen", so it clears BOTH
              // halves of the question — a length left standing behind a
              // skipped screen is an answer nobody gave.
              setShapes(new Set())
              setLength("any")
              setStep(3)
            }}
          />
        )}
        {name === "style" && (
          <StyleStep
            party={party}
            onParty={setParty}
            rhythm={rhythm}
            onRhythm={setRhythm}
            budget={budget}
            onBudget={setBudget}
            onNext={() => {
              // Arguments, not the state — this handler's closure still holds
              // the values from the render it was built in, and the pair the
              // pills are showing is exactly what those are. Same trap `build`
              // documents below, where reading state cost the invite entirely.
              void saveStyle(rhythm, budget)
              setStep(4)
            }}
            // Skip writes NOTHING. The column defaults are already what these
            // pills are showing, so a row is not created for an unanswered
            // question — and one that exists keeps whatever the phone put there.
            //
            // It also CLEARS them. The pills arrive pre-selected, so leaving
            // them would rank the shelf on two answers the traveller just
            // declined to give — invisible, because the screen they declined is
            // already behind them.
            onSkip={() => {
              setParty("")
              setRhythm("")
              setBudget("")
              setStep(4)
            }}
          />
        )}
        {name === "pick" && (
          <PickStep
            guides={suggested}
            home={homeCoord}
            chosen={chosenTripId}
            onChoose={setChosenTripId}
            onNext={() => setStep(5)}
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
          avatarUrl={avatarUrl}
          onAvatar={setAvatarUrl}
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

/**
 * The first day of the leading month you could actually go — the same
 * derivation the Inspire "add as is" path uses, so the two never disagree about
 * when "later" is. You cannot leave today.
 *
 * ONE derivation, read twice: screen 6 copies the trip FROM this date and
 * screen 4 ranks the shelf FOR its month. Computing the month separately is how
 * a flow ends up recommending for August and booking September.
 */
function firstDepartureDate(): DayStr {
  const today = localToday()
  const months = monthsYouCouldGo(today)
  return months.length ? firstOfMonth(months[0]) : today
}

/** The viewer's own calendar day as "yyyy-MM-dd" — never UTC, because "the
 *  month you could go" is a fact about the traveller's calendar. */
function localToday(): DayStr {
  const t = new Date()
  return [
    t.getFullYear(),
    String(t.getMonth() + 1).padStart(2, "0"),
    String(t.getDate()).padStart(2, "0"),
  ].join("-")
}
