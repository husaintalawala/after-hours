"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { AnalyticsEvent, capture } from "@/lib/analytics"
import { checkTripActivated } from "@/lib/drift/activation"
import { type PlaceCandidate } from "@/lib/drift/chat"
import {
  suggestPlaces,
  selectPlace,
  isCityishSuggestion,
} from "@/lib/drift/placesAutocomplete"
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
  type DayStr,
  type YearMonth,
} from "@/lib/drift/inspire"
import { CATEGORY_ORDER } from "@/lib/drift/inspire"
import {
  bestDepartureMonth,
  DEFAULT_BUDGET,
  DEFAULT_MOBILITY,
  DEFAULT_RHYTHM,
  markDaybreakSeen,
  prioritiesForShapes,
  TRIP_SHAPES,
  rankGuides,
  shelfFor,
  reasonFor,
  type Coord,
  type RankableGuide,
  type TripLength,
} from "@/lib/drift/daybreak"
import { backdropAt } from "@/lib/drift/daybreakArt"
import type { DaybreakGuide } from "@/lib/drift/inspirePromo"
import TripCoverImg from "@/components/app/TripCoverImg"
import OriginStep from "./DaybreakOrigin"
import PickStep from "./DaybreakRecommendations"
import "./daybreak.css"
import DaybreakProfileEditor from "./DaybreakProfileEditor"
import {
  BuildStep,
  CrewStep,
  IdentityStep,
  MosaicStep,
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
  homeCountry?: string | null
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
  const [stylePage, setStylePage] = useState(0)
  const [previewId, setPreviewId] = useState<string | null>(null)

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
  const [homeContext, setHomeContext] = useState<string | null>(profile.homeCountry ?? null)
  const [cityError, setCityError] = useState<string | null>(null)
  /** Feeds the distance on each guide card — the reason screen 2 exists at all
   *  beyond Travel Stats. Held in state rather than read from the prop so a
   *  city picked NOW reaches screen 4 in this same session: the server
   *  component that supplied the prop rendered before the question was asked. */
  const [homeCoord, setHomeCoord] = useState<Coord | null>(profile.homeCoord)
  const searchSeq = useRef(0)

  // 03 — the trip length stays local (nothing holds it, and its job is to rank
  // the very next screen). The SHAPES no longer do: they are mapped to
  // `user_travel_preferences.priorities` when screen 4 advances, the same
  // derivation iOS makes, so "what pulls you" reaches the itinerary builder
  // instead of ending at the browser's edge. See prioritiesForShapes.
  const [shapes, setShapes] = useState<ReadonlySet<string>>(new Set())
  const [length, setLength] = useState<TripLength>("any")
  // "When are you going?" — null is "I'm flexible", the default for the reason
  // "any" is the length default: it constrains nothing. A picked month ranks the
  // shelf for that month and starts the copy on its 1st; flexible ranks nothing
  // on season and dates the copy at the guide's best month instead. Not
  // persisted — it is a fact about this trip, not about the traveller.
  const [departure, setDeparture] = useState<YearMonth | null>(null)
  const departureMonths = useMemo(() => monthsYouCouldGo(localToday()), [])

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
  /** Seeded to the column default, because the column has one: mobility_style
   *  is NOT NULL DEFAULT 'walkable', so finishing this flow recorded "walkable
   *  first" for every web traveller whether or not they meant it. Asking is
   *  what makes the stored value theirs. */
  const [mobility, setMobility] = useState(DEFAULT_MOBILITY)
  /** Multi-select, no default — build-itinerary buckets the day's meals off
   *  this, and an unasked question should leave it empty rather than guess. */
  const [food, setFood] = useState<ReadonlySet<string>>(new Set())

  // 05
  const [chosenTripId, setChosenTripId] = useState<string | null>(null)

  // 06
  const [wantsToInvite, setWantsToInvite] = useState(false)

  // 07
  const [buildStage, setBuildStage] = useState(0)
  const [buildError, setBuildError] = useState<string | null>(null)
  const [landedTripId, setLandedTripId] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  /** Null while it is coming or has arrived; a sentence when the mint failed. */
  const [inviteError, setInviteError] = useState<string | null>(null)
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
   *
   * IT CAN NOW COME BACK WITH FEWER THAN THREE, and that is the point. The
   * ranker sorts and never filters, so slicing three off the top filled the
   * last slot by construction — with whatever was least-bad in the whole
   * corpus, on the first screen a new account ever sees. `shelfFor` applies a
   * floor on the SHAPE and returns what actually clears it.
   */
  const shelf = useMemo(
    () =>
      shelfFor(guides, {
        shapes,
        length,
        party: party || null,
        rhythm: rhythm || null,
        budget: budget || null,
        // The month screen 3 was answered with. Null ("I'm flexible") takes the
        // season out of the ranking and puts it in the start date instead.
        departureMonth: departure?.month ?? null,
      }),
    [guides, shapes, length, party, rhythm, budget, departure]
  )
  // NOT `.slice(0, 3)` any more. That filled the third slot by construction,
  // with whatever was least-bad in the whole corpus — on the highest-stakes
  // screen in the product. `shelfFor` returns two when only two are the right
  // kind of trip, and the headline already spells whatever number it gets.
  const suggested = shelf.guides
  /** One clause per card, keyed by trip id — see reasonFor. */
  const reasons = useMemo(() => {
    const label = (slug: string) =>
      TRIP_SHAPES.find((t) => t.slug === slug)?.label ?? slug
    const a = {
      shapes,
      length,
      party: party || null,
      rhythm: rhythm || null,
      budget: budget || null,
      departureMonth: departure?.month ?? null,
    }
    return new Map(suggested.map((g) => [g.tripId, reasonFor(g, a, label)]))
  }, [suggested, shapes, length, party, rhythm, budget, departure])
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
      // A retry re-asks for the link, so last attempt's failure must not
      // outlive it on screen.
      setInviteError(null)
      setBuildStage(0)
      tickers.current.forEach(clearTimeout)
      // Paced, not measured — copy-trip is ONE call that returns when the whole
      // itinerary has landed, so there are no intermediate events to report. The
      // last two rows wait for the real answer.
      tickers.current = [
        setTimeout(() => setBuildStage((s) => Math.max(s, 1)), 900),
        setTimeout(() => setBuildStage((s) => Math.max(s, 2)), 1800),
      ]

      const startDate = departureDate(guide, departure, departureMonths)

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
          } else {
            // SAYS SO. mintInvite swallows every RPC error and returns null, and
            // this branch used not to exist — so a traveller who asked to bring
            // somebody watched the trip land with no link and nothing to explain
            // it, and no way to tell "still coming" from "never coming". iOS
            // raises an alert here; this is the same sentence in the panel that
            // would have held the link.
            setInviteError("Couldn't create an invite link — check your connection and try again.")
          }
        }
      } catch {
        // No answer ever arrived, so the row may exist. The id stays reserved so
        // a retry replays this copy rather than writing a second one.
        tickers.current.forEach(clearTimeout)
        setBuildError(copyErrorMessage(null))
      }
    },
    [chosenTripId, finish, guides, departure, departureMonths]
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
    if (step === 4 && previewId) { setPreviewId(null); return }
    if (step === 3 && stylePage > 0) { setStylePage(page => page - 1); return }
    if (step === 0) {
      finish(null)
      return
    }
    setStep(step - 1)
  }, [finish, step, previewId, stylePage])

  /**
   * One lookup, whoever asked for it — the debounce below or an explicit Enter.
   *
   * SEQUENCED, not just awaited. Type-ahead means several of these can be in
   * flight and they do not come back in order: "Lis" resolving after "Lisbon"
   * would replace the right list with a staler one, which reads as the field
   * ignoring the last thing typed. Only the newest request is allowed to write.
   * Same `seq` counter as Settings › Home city, for the same reason.
   */
  /**
   * The billing session for the origin field.
   *
   * N `suggest` calls sharing one token are free when the session is TERMINATED
   * by a `select` carrying that same token — see placesAutocomplete. Held in a
   * ref rather than state because changing it must never re-render: it is
   * bookkeeping, not something the screen draws.
   */
  const placeSession = useRef<string | null>(null)

  /**
   * One lookup, whoever asked for it — the debounce below or an explicit Enter.
   *
   * NOW AUTOCOMPLETE, NOT THE RESOLVER. This used to POST to
   * /api/drift/resolve-place, which is a resolver rather than a prefix
   * predictor: measured live it answered "Lis" with Li's Chinese Kitchen,
   * "Lisb" with two wadis in Oman and "Kyo" with a sushi bar, in 1.9s to 5.7s.
   * The cities-only filter below then turned those wrong answers into NO
   * answers, which is exactly the "spinner and nothing" this screen was
   * reported for twice. iOS has called places-autocomplete all along.
   *
   * SEQUENCED, not just awaited. Type-ahead means several of these are in
   * flight and they do not return in order: "Lis" landing after "Lisbon" would
   * replace the right list with a staler one. Only the newest may write.
   */
  const lookUpCity = useCallback(async (raw: string, citiesOnly: boolean) => {
    const q = raw.trim()
    if (!q) return
    const s = ++searchSeq.current
    setSearching(true)
    setCityError(null)

    const { sessionToken, suggestions } = await suggestPlaces(q, placeSession.current)
    if (searchSeq.current !== s) return
    placeSession.current = sessionToken
    setSearching(false)

    // Types, not name-shape guesswork. Autocomplete returns Google place types,
    // so "is this somewhere a person lives" is answerable rather than inferred.
    // CITIES FIRST, BUT NEVER AN EMPTY LIST. The old cities-only gate existed
    // because the resolver's fallback was a sushi bar, so showing it was worse
    // than showing nothing. Autocomplete's predictions are good enough that the
    // trade reverses: measured, "Lis" returns five sensible predictions of
    // which none is typed as a locality, and hiding all five leaves the reader
    // staring at the empty dropdown this screen was reported for. Prefer
    // cities; fall back to whatever it offered.
    const cities = suggestions.filter(isCityishSuggestion)
    const shown = cities.length ? cities : suggestions
    if (!shown.length) setCityError("No matching city. Try another name, or skip for now.")
    void citiesOnly

    // Mapped into the shape OriginStep already draws. Coordinates are absent
    // here on purpose — a prediction has none, and resolving every row to get
    // them would spend a Place Details call per keystroke. pickCity resolves
    // the ONE the reader chose, which is also what terminates the session.
    setCityResults(
      shown.slice(0, 6).map((sg) => ({
        id: sg.placeId,
        name: sg.primary,
        address: sg.secondary,
        latitude: null,
        longitude: null,
      })) as unknown as PlaceCandidate[]
    )
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
    searchSeq.current++
    setCityError(null)
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
    setCityError(null)
    let succeeded = false
    try {
      // Resolve the prediction to a real place — and TERMINATE the billing
      // session while doing it. A prediction carries no coordinates, and this
      // one call is what makes every suggest before it free.
      const full = await selectPlace(c.id, placeSession.current)
      placeSession.current = null
      const picked = full ?? c

      const db = createClient()
      const {
        data: { session },
      } = await db.auth.getSession()
      const uid = session?.user?.id
      if (!uid) throw new Error("Sign in to save your starting point")
      if (uid) {
        await db
          .from("profiles")
          .update({
            home_city: picked.name,
            home_country: (picked.address ?? "").split(",").pop()?.trim() || null,
            home_lat: picked.latitude ?? null,
            home_lng: picked.longitude ?? null,
          })
          .eq("id", uid)
          .throwOnError()
      }
      // Only after the write lands. Setting the label first shows a city the
      // row does not have, which is the bug Settings › Home city already had.
      setHomeCity(picked.name)
      setHomeContext(picked.address ?? null)
      succeeded = true
      // FROM `picked`, NOT `c`. The row above is written from the RESOLVED
      // place; `c` is the autocomplete prediction that produced it, and a
      // prediction carries no coordinates — selectPlace is the call that
      // fetches them. Seeding local state from `c` therefore left homeCoord
      // null for everyone who answered this question in-session, so the guide
      // cards two screens on never showed their "2,900 KM AWAY" leg. The
      // database had the coordinates the whole time; only this screen did not.
      //
      // A city that genuinely resolves without coordinates still means no
      // distance on the cards — not a fabricated one, and not a stale one from
      // a previous answer.
      setHomeCoord(
        picked.latitude != null && picked.longitude != null
          ? { lat: picked.latitude, lng: picked.longitude }
          : null
      )
      setCityResults([])
      setCityQuery("")
    } catch {
      // The question is optional and skippable; a failed write leaves the
      // previous answer standing rather than claiming a new one.
      setCityError("Couldn’t save that city. Please choose it again, or skip for now.")
    }
    setSavingCity(false)
    return succeeded
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
  const saveStyle = useCallback(
    async (
      pace: string,
      spend: string,
      mobility: string,
      food: ReadonlySet<string>,
      shapes: ReadonlySet<string>,
      party: string,
      length: string
    ) => {
      // PER FIELD, NOT ALL-OR-NOTHING. This was `if (!pace || !spend) return`,
      // which threw away a whole screen because half of it was blank: skip the
      // style step (which clears every answer), come back into it from the pick
      // screen, choose a pace only, press Continue — and the pace just chosen
      // was discarded along with the empty budget. iOS guards per field for
      // exactly this reason. Empty still never reaches the column, because ""
      // is a value build-itinerary's `===` comparisons have never heard of.
      const priorities = prioritiesForShapes(shapes)
      // Typed, not Record<string, unknown>: this is the column set of
      // user_travel_preferences, and a typo in a key here would otherwise be
      // accepted at compile time and silently ignored by PostgREST at runtime.
      const answers: {
        travel_rhythm?: string
        budget_style?: string
        mobility_style?: string
        food_moods?: string[]
        priorities?: string[]
        // The three answers this flow used to rank on and then throw away.
        // `party` and `length` shaped the shelf more than any other term —
        // party alone eliminated 19 of 30 candidates on the reported answer
        // set — and neither could be audited, corrected or replayed afterwards.
        // `shapes` is the raw answer; `priorities` above is a lossy four-token
        // derivation of it that folds islands, mountains and road trip into
        // one word, and is kept only because build-itinerary reads it.
        party?: string
        length?: string
        shapes?: string[]
      } = {}
      if (pace) answers.travel_rhythm = pace
      if (spend) answers.budget_style = spend
      if (mobility) answers.mobility_style = mobility
      if (food.size) answers.food_moods = [...food].sort()
      // The shape answer, which used to end at the browser's edge — see
      // prioritiesForShapes. build-itinerary rotates the day's searches on it.
      if (priorities.length) answers.priorities = priorities
      if (party) answers.party = party
      if (length) answers.length = length
      if (shapes.size) answers.shapes = [...shapes].sort()
      // Nothing to say is not the same as saying nothing: if every answer is
      // blank, write no row rather than an `updated_at` that claims a fresh
      // opinion the traveller never gave.
      if (Object.keys(answers).length === 0) return
      try {
        const db = createClient()
        const {
          data: { session },
        } = await db.auth.getSession()
        const id = session?.user?.id
        if (!id) return
        await db
          .from("user_travel_preferences")
          .upsert(
            // CAST, NOT A REGENERATED TYPES FILE. `party`, `length` and
            // `shapes` were added by 20260912190000 and are not in
            // database.types.ts; regenerating it drops a large unrelated diff
            // into this change. `answers` above is still typed field by field,
            // so a mistyped key is caught there rather than here.
            { ...answers, user_id: id, updated_at: new Date().toISOString() } as never,
            { onConflict: "user_id" }
          )
          .throwOnError()
      } catch {
        // Optional and skippable, and the next screen is already on its way.
      }
    },
    []
  )

  async function shareInvite() {
    if (!inviteUrl) return
    // NAMES THE TRIP. iOS builds "Come with me to {title} — here's the plan:"
    // and keeps the generic line only for a title that has not loaded; web
    // hardcoded the fallback, so the recipient was invited somewhere unnamed
    // while the title sat two lines above on the sender's own screen.
    const title = guides.find((g) => g.tripId === chosenTripId)?.title?.trim()
    const text = title
      ? `Come with me to ${title} — here's the plan:`
      : "Come travel with me — here's the plan:"
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
    <div className="daybreak-flow relative flex min-h-[100dvh] flex-col text-aurora-ink" data-step={name} data-preview={!!previewId}>
      {/* Back on the left, a hairline of progress, and a close that is always
          live. The bar is almost redundant — the sky already says how far in
          you are — so it is 3px and nearly silent rather than a seven-dot pager
          counting down screens the user did not agree to.

          The right padding clears the photo credit, which rides at the top
          right of this same column — the same reservation GuideCard makes for
          the same chip, plus that strip's own 18px inset, because here the two
          are siblings rather than one inside the other. */}
      <div className="db-chrome">
        <button
          type="button"
          onClick={back}
          aria-label={previewId && name === "pick" ? "Back to recommendations" : step === 0 ? "Close" : "Back"}
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
        <span>{name === "pick" ? "Your escapes" : name === "origin" ? "Starting point" : name === "shape" ? "Your kind of escape" : "Your trip"}</span>
      </div>

      <div className="db-layout">
      {name !== "pick" && backdrop && <div className="db-scene"><TripCoverImg cover={backdrop.cover} sizes="(min-width: 900px) 45vw, 1px" /></div>}
      <div className="db-content">
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
            context={homeContext}
            error={cityError}
            onPick={pickCity}
            onNext={() => setStep(2)}
            onSkip={() => setStep(2)}
          />
        )}
        {name === "shape" && (
          <MosaicStep
            categories={categories}
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
            months={departureMonths}
            departure={departure}
            onDeparture={setDeparture}
            onNext={() => setStep(3)}
            onSkip={() => {
              // Skip means "I did not answer this screen", so it clears EVERY
              // part of the question — a length or a month left standing behind
              // a skipped screen is an answer nobody gave.
              setShapes(new Set())
              setLength("any")
              setDeparture(null)
              setStep(3)
            }}
          />
        )}
        {name === "style" && (
          <StyleStep
            page={stylePage}
            setPage={setStylePage}
            party={party}
            onParty={setParty}
            rhythm={rhythm}
            onRhythm={setRhythm}
            budget={budget}
            onBudget={setBudget}
            mobility={mobility}
            onMobility={setMobility}
            food={food}
            onFood={(v) =>
              setFood((prev) => {
                const next = new Set(prev)
                if (next.has(v)) next.delete(v)
                else next.add(v)
                return next
              })
            }
            onNext={() => {
              // Arguments, not the state — this handler's closure still holds
              // the values from the render it was built in, and the pair the
              // pills are showing is exactly what those are. Same trap `build`
              // documents below, where reading state cost the invite entirely.
              void saveStyle(rhythm, budget, mobility, food, shapes, party, length)
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
              // Cleared for the same reason as the three above: these arrive
              // pre-selected, and leaving them would record a routing
              // preference the traveller has just declined to give.
              setMobility("")
              setFood(new Set())
              setStep(4)
            }}
          />
        )}
        {name === "pick" && (
          <PickStep
            guides={suggested}
            relaxed={shelf.relaxed}
            previewId={previewId}
            onPreview={(id) => { setPreviewId(id); if (id) setChosenTripId(id) }}
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
            inviteError={inviteError}
            // Asked for, and not yet answered either way.
            invitePending={wantsToInvite && !inviteUrl && !inviteError}
            copied={copiedInvite}
            onShareInvite={() => void shareInvite()}
            onOpen={() => finish(landedTripId)}
            onRetry={() => void build(wantsToInvite)}
          />
        )}
      </div>

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
 * The day the copy starts. A picked month starts on its 1st. "I'm flexible"
 * starts on the 1st of whichever of the six months you could go suits THIS
 * guide best (bestDepartureMonth) — the season left the ranking and went into
 * the date. You cannot leave today; with no months at all, today is the floor.
 *
 * The shelf ranks for `departure.month` and this dates from `departure`, so the
 * two can never disagree about which month it is — the failure the old single
 * derivation existed to prevent, recommending for August and booking September.
 */
function departureDate(
  guide: RankableGuide,
  departure: YearMonth | null,
  months: readonly YearMonth[]
): DayStr {
  if (departure) return firstOfMonth(departure)
  const best = bestDepartureMonth(guide, months.map((m) => m.month))
  const ym = months.find((m) => m.month === best) ?? months[0]
  return ym ? firstOfMonth(ym) : localToday()
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
