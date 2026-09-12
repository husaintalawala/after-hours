/**
 * Daybreak — the first-run flow's non-visual half: who sees it, and which
 * guides its fourth screen offers.
 *
 * Ported from the iOS DaybreakFlow (Drift/Views/DaybreakFlow.swift) and
 * DaybreakRanking (Drift/Core/DaybreakRanking.swift). Everything here is pure
 * except the cookie writer, so the routing rule and the recommendation can be
 * reasoned about — and tested — without a browser.
 */

/**
 * "This account has already met the six questions."
 *
 * iOS decides with `FirstRun.shouldLand(userID:)` — a device-local UserDefaults
 * marker AND "the account has no trips". A cookie is the web analog of that
 * marker: per-browser, cleared with site data, and readable by the server
 * component that has to decide before anything renders.
 *
 * A `profiles.first_run_seen_at` column would be the better answer — it is the
 * same fact on every device the person signs in from, and it is what iOS's
 * marker cannot do either. It is NOT done here because adding a column is a
 * migration against live data, and migrations in this project stop for the
 * owner's explicit sign-off, which has not been given for this feature. The
 * cookie is the version that ships without asking anyone to approve a schema
 * change; the column is the follow-up.
 */
export const DAYBREAK_COOKIE = "drift_daybreak"

/** A year. The flow is once-per-account, so the only thing a shorter life buys
 *  is showing it again to somebody who already answered it. */
export const DAYBREAK_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * Mark the flow as met, from the browser.
 *
 * CALLED ON ENTRY, NEVER ON COMPLETION. `UsernameSetupView` — the screen this
 * flow replaces — was a root view with no exit, and marking a first run "done"
 * only when it is finished is what turns a welcome into a wall: a force-refresh
 * at question three would otherwise land back at question one, forever. Written
 * the moment the flow mounts, so the very next load of /app goes to the app.
 *
 * Not httpOnly on purpose — it is written here, in the browser, and carries no
 * capability: it says "seen", nothing more.
 */
export function markDaybreakSeen(userId: string): void {
  if (typeof document === "undefined") return
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : ""
  const next = [...readSeen(document.cookie), userId]
  // Newest first and capped: a cookie is a request header on every navigation,
  // and an unbounded list of uuids on a shared browser would grow into one.
  // Twenty accounts deep is far past anyone's real sign-in history here.
  const value = [...new Set(next)].reverse().slice(0, 20).join(".")
  document.cookie =
    `${DAYBREAK_COOKIE}=${value}; Path=/; Max-Age=${DAYBREAK_COOKIE_MAX_AGE}; SameSite=Lax${secure}`
}

/** The account ids this browser has already shown the flow to. */
export function readSeen(cookieHeader: string | undefined | null): string[] {
  if (!cookieHeader) return []
  const raw = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${DAYBREAK_COOKIE}=`))
  if (!raw) return []
  return decodeURIComponent(raw.slice(DAYBREAK_COOKIE.length + 1))
    .split(".")
    .filter(Boolean)
}

/**
 * Has THIS account met the flow on this browser?
 *
 * PER ACCOUNT, not per browser, which is what the first version got wrong. It
 * wrote a bare `drift_daybreak=1`, so the first person to finish the flow in a
 * browser closed it for every account that signed in there afterwards — and on
 * a machine where accounts get created and tested back to back, that is every
 * subsequent one. iOS never had the bug: its marker is keyed
 * `drift.firstRunSeen.<userID>`, and this is the port of that, not of a flag.
 *
 * The value is a dot-joined list of ids because that is what fits a cookie:
 * uuids contain no dots, so the separator cannot collide with the payload.
 */
export function hasSeenDaybreak(cookieValue: string | undefined | null,
                                userId: string): boolean {
  if (!cookieValue) return false
  // Accepts the raw header or a bare value, so both the server jar (which hands
  // back only the value) and document.cookie work.
  const ids = cookieValue.includes(`${DAYBREAK_COOKIE}=`)
    ? readSeen(cookieValue)
    : cookieValue.split(".").filter(Boolean)
  return ids.includes(userId)
}

// ---------------------------------------------------------------------------
// The ranking — port of Drift/Core/DaybreakRanking.swift
// ---------------------------------------------------------------------------

/**
 * WHAT IT REPLACES. `pickForShapes` — a union filter over the shape tags with a
 * fallback to the front of the shelf when the filter emptied. It read one of
 * the three answers the flow collects: the home city was written to `profiles`
 * and never consulted, and `best_months` was not even in the shelf's
 * projection, so the season could not have been read if anything had tried. A
 * flow that asks questions and ignores them is worse than one that asks
 * nothing, because it implies a personalisation that is not happening.
 *
 * RANKS, NEVER FILTERS. Nothing is removed, which is the same stance the
 * Inspire shelf's own month ranking documents: a trip out of season is a
 * different holiday, not a forbidden one, and a shelf that hides two thirds of
 * itself reads as broken. It also means this can never hand back an empty
 * screen, so the caller no longer needs the "if the filter emptied it, fall
 * back to the front of the shelf" branch that was papering over exactly that.
 *
 * DISTANCE IS SHOWN, NOT SCORED. Nearer is not better — someone who says "into
 * the wild" from Lisbon has not asked to be kept in Europe — so home
 * coordinates inform the card rather than the order. What a person needs is to
 * know that one of these is 700 km away and another is 9,000 before they pick,
 * which is a fact, not a preference we are entitled to infer.
 */

/**
 * The lengths the CORPUS can actually serve.
 *
 * Deliberately coarse: the 40 live guides run 5–13 days and only two of them
 * are under 8. A "long weekend" option would be a question with one answer
 * behind it, which is the same dishonesty as a control that offers to change
 * something nothing can change. If short trips are seeded later, this is where
 * the third case goes.
 */
export type TripLength = "any" | "aboutAWeek" | "tenPlus"

/** In pill order, with the copy iOS shows. */
/** Subtitles and icons so this asks like every other preference — iOS moved it
 *  onto the same wizard rows rather than leaving it three truncating pills. */
export const TRIP_LENGTHS: ReadonlyArray<{
  id: TripLength
  label: string
  subtitle: string
  icon: string
}> = [
  { id: "any", label: "Any length", subtitle: "Show me everything", icon: "sparkle" },
  { id: "aboutAWeek", label: "About a week", subtitle: "The usual holiday", icon: "walk" },
  { id: "tenPlus", label: "Ten days or more", subtitle: "Time to go properly", icon: "train" },
]

/**
 * The seven shapes, with the copy and glyph iOS shows for each.
 *
 * WHY THIS IS A VOCABULARY AND NOT A PHOTOGRAPH. This question used to draw a
 * real picture per tag — the hero of the highest-ranked guide carrying it — on
 * the reasoning that in an app made of photographed places, a picture of a
 * mountain beats a symbol of one. True, and it did not survive contact with the
 * shelf: "Islands & beaches" drew a technical blueprint, "Mountains & hiking"
 * drew a Yellowstone park MAP, "Road trip" drew a shed. The picker has no way
 * to know whether a guide's hero depicts its tag, so the tile was a coin toss
 * between a beach and a schematic.
 *
 * `slug` is the tag the rows carry; the server sends which of these are live
 * (a shape with no guides behind it is a question whose answer changes
 * nothing), and this decides their ORDER and their words. Mirrors
 * DaybreakPrefCatalog.shapes.
 */
/** A curated photograph pinned to one category tile.
 *
 *  PINNED, which is the entire point. The first version looked the picture up
 *  by keyword at render time and drew a BLUEPRINT on "Islands & beaches", a
 *  stock laptop on another tile and a map of Yellowstone on a third. A keyword
 *  search is a lottery run once per reader, on the first question a new account
 *  is asked. Each of these seven was chosen by looking at the photograph, at
 *  the real tile crop with the scrim on it.
 *
 *  The id rather than a finished URL, so each surface can ask for the width it
 *  needs. Unsplash's `ixid`/`ixlib` parameters are search-session tokens rather
 *  than part of the address, and a URL built from the id alone resolves.
 *
 *  ATTRIBUTION IS NOT OPTIONAL — the licence binds credit to the display, so
 *  the photographer travels in the same value as the id.
 *
 *  The same seven ids are pinned in iOS's DaybreakPrefCatalog.shapes. One set,
 *  changed together. */
export interface PrefArt {
  /** The Unsplash path segment, e.g. `photo-1588434090257-532797c6c298`. */
  photoId: string
  photographer: string
  photographerUrl: string
  unsplashUrl: string
}

/** This photograph at a given width. `fit=crop` because a tile is much wider
 *  than it is tall, which is what the curation selected for. */
export function unsplashTile(art: PrefArt, width: number): string {
  return `https://images.unsplash.com/${art.photoId}?auto=format&fit=crop&w=${width}&q=80`
}

export const TRIP_SHAPES: ReadonlyArray<{
  slug: string
  label: string
  subtitle: string
  icon: string
  art: PrefArt
}> = [
  { slug: "wild", label: "Nature & wildlife", subtitle: "Parks, animals, big landscapes", icon: "leaf",
    art: {
      photoId: "photo-1588434090257-532797c6c298",
      photographer: "Markus Sandhofer",
      photographerUrl: "https://unsplash.com/@sandhofer?utm_source=drift&utm_medium=referral",
      unsplashUrl: "https://unsplash.com/photos/brown-and-black-giraffe-on-brown-grass-field-during-daytime-S5ea9W6ualI?utm_source=drift&utm_medium=referral",
    } },
  { slug: "stones", label: "History & ruins", subtitle: "Old towns, temples, museums", icon: "columns",
    art: {
      photoId: "photo-1677838062758-848c5c25156d",
      photographer: "Mario La Pergola",
      photographerUrl: "https://unsplash.com/@mlapergolaphoto?utm_source=drift&utm_medium=referral",
      unsplashUrl: "https://unsplash.com/photos/a-large-group-of-stone-buildings-surrounded-by-trees-T2-G15zcH2M?utm_source=drift&utm_medium=referral",
    } },
  { slug: "drive", label: "Road trip", subtitle: "The route is half the trip", icon: "car",
    art: {
      photoId: "photo-1770816149208-60206f8527aa",
      photographer: "K. K.",
      photographerUrl: "https://unsplash.com/@korner_kosmos?utm_source=drift&utm_medium=referral",
      unsplashUrl: "https://unsplash.com/photos/desert-road-leading-through-sandstone-rock-formations-QqafmkbCDXQ?utm_source=drift&utm_medium=referral",
    } },
  { slug: "eat", label: "Food & drink", subtitle: "Markets, long dinners, bars", icon: "bowl",
    art: {
      photoId: "photo-1775769386688-589512f012af",
      photographer: "Vanessa Zhu",
      photographerUrl: "https://unsplash.com/@vanessazhu777?utm_source=drift&utm_medium=referral",
      unsplashUrl: "https://unsplash.com/photos/spices-and-soaps-displayed-at-an-outdoor-market-_tkLeiYcxnI?utm_source=drift&utm_medium=referral",
    } },
  { slug: "islands", label: "Islands & beaches", subtitle: "Coast, swimming, slow sun", icon: "umbrella",
    art: {
      photoId: "photo-1599837139010-617a01b35781",
      photographer: "Matheen Faiz",
      photographerUrl: "https://unsplash.com/@matheenfaiz?utm_source=drift&utm_medium=referral",
      unsplashUrl: "https://unsplash.com/photos/green-trees-near-body-of-water-under-blue-sky-during-daytime-z9-FjHZvh5g?utm_source=drift&utm_medium=referral",
    } },
  { slug: "high", label: "Mountains & hiking", subtitle: "Trails, altitude, big views", icon: "mountain",
    art: {
      photoId: "photo-1778994549970-d9a5470cf5d1",
      photographer: "Steve Gribble",
      photographerUrl: "https://unsplash.com/@steve_g_?utm_source=drift&utm_medium=referral",
      unsplashUrl: "https://unsplash.com/photos/snow-capped-mountains-under-a-hazy-sunset-sky-U5SHfCTwCPs?utm_source=drift&utm_medium=referral",
    } },
  { slug: "stay", label: "One base, slow days", subtitle: "Unpack once and go deep", icon: "house",
    art: {
      photoId: "photo-1771830916703-8288dcc093da",
      photographer: "Elist Nguyen",
      photographerUrl: "https://unsplash.com/@hieuanhcauam?utm_source=drift&utm_medium=referral",
      unsplashUrl: "https://unsplash.com/photos/courtyard-with-chairs-table-and-potted-plants-Ev-tfJZ9DD8?utm_source=drift&utm_medium=referral",
    } },
]

export function lengthFits(length: TripLength, days: number): boolean {
  switch (length) {
    case "any":
      return true
    case "aboutAWeek":
      return days > 0 && days <= 9
    case "tenPlus":
      return days >= 10
  }
}

// ---------------------------------------------------------------------------
// How you travel — the two columns screen 4 writes
// ---------------------------------------------------------------------------

/**
 * `travel_rhythm` and `budget_style` are real columns of
 * `user_travel_preferences`, and both are read server-side: build-itinerary
 * branches on the rhythm for how many stops a day it plans, and refine-itinerary
 * puts both into the prompt and into its cache key. So an answer here is
 * load-bearing the moment it is given — this screen is not a survey.
 *
 * THE STORED VALUE IS NOT THE LABEL, and the difference is the whole reason this
 * table exists rather than three inline strings. iOS's DaybreakStyleStep (commit
 * 2e3f1829) writes `packed`, `careful` and `no_limit`, and the server reads none
 * of them: build-itinerary tests `travel_rhythm === "full_days"` and
 * refine-itinerary tests the same, so "Packed" is a hard `===` miss that changes
 * nothing at all, while `careful`/`no_limit` miss the {save, smart_mix, splurge}
 * label map and reach the prompt as raw slugs. The vocabulary the whole rest of
 * the product uses is documented at Drift/Core/UserPreferencesService.swift:10 —
 * rhythm easy|balanced|full_days, budget save|smart_mix|splurge — and it is what
 * iOS's own TuneDriftPreferencesView writes into the same row.
 *
 * So web shows iOS's WORDS and stores the product's VALUES. Both platforms ask
 * the same question in the same language, and web's answer is the one that
 * actually reaches the itinerary. The alternative — matching iOS byte for byte —
 * would port a preference the server ignores, which is the exact failure this
 * flow's own history keeps naming: a flow that asks questions and does nothing
 * with them is worse than one that asks nothing, because it implies a
 * personalisation that is not happening.
 */
/**
 * One option, as the wizard draws it.
 *
 * `label` alone was enough while these rendered as text capsules. iOS now asks
 * every preference through PreferenceWizardKit, where an option is a card with
 * an icon and a line of explanation under the title — and the explanations are
 * the useful half: "One plan, two opinions" says what "Two of us" means in a
 * way the label cannot. `icon` names a glyph in the web icon set rather than an
 * SF Symbol, since the two platforms have no shared symbol vocabulary.
 */
export interface PrefOption {
  value: string
  label: string
  subtitle: string
  icon: string
}

/** Labels track iOS: "Unhurried" / "Full days", not "Easy" / "Packed". The
 *  stored values are unchanged, so nothing downstream moves. */
export const TRAVEL_RHYTHMS: ReadonlyArray<PrefOption> = [
  { value: "easy", label: "Unhurried", subtitle: "One or two things a day, properly", icon: "tortoise" },
  { value: "balanced", label: "Balanced", subtitle: "A full day with room in it", icon: "walk" },
  { value: "full_days", label: "Full days", subtitle: "Out early, back late", icon: "bolt" },
]

export const BUDGET_STYLES: ReadonlyArray<PrefOption> = [
  { value: "save", label: "Careful", subtitle: "Good value, nothing wasted", icon: "coin" },
  { value: "smart_mix", label: "Smart mix", subtitle: "Save on some, spend on others", icon: "scales" },
  { value: "splurge", label: "No limit", subtitle: "The best of it, when it counts", icon: "sparkle" },
]

/**
 * How Drift should route the trip.
 *
 * ASKED BECAUSE IT IS ALREADY BEING ANSWERED. `user_travel_preferences
 * .mobility_style` is NOT NULL DEFAULT 'walkable', and the web flow's upsert
 * creates that row — so a web traveller who means to hire a car has had
 * "walkable first" recorded for them, silently, by the act of finishing
 * onboarding. Showing the question is strictly more honest than writing the
 * default behind their back, which is why this is a data gap and not a
 * missing nicety.
 */
export const MOBILITY_STYLES: ReadonlyArray<PrefOption> = [
  { value: "walkable", label: "Walkable first", subtitle: "Stay central, go on foot", icon: "walk" },
  { value: "public_transit", label: "Public transit", subtitle: "Trains, trams and buses", icon: "train" },
  { value: "rental_car", label: "Self-drive", subtitle: "A car, and the road between", icon: "car" },
]

/** Multi-select, and it reaches the itinerary: build-itinerary buckets the
 *  day's meals off `food_moods`. */
export const FOOD_MOODS: ReadonlyArray<PrefOption> = [
  { value: "local_gems", label: "Local gems", subtitle: "Where the neighbourhood eats", icon: "pin" },
  { value: "casual", label: "Casual", subtitle: "Markets, counters, no booking", icon: "bowl" },
  { value: "fine_dining", label: "Worth dressing for", subtitle: "One proper dinner", icon: "sparkle" },
  { value: "night_out", label: "A night out", subtitle: "Bars, music, late", icon: "moon" },
]

export const DEFAULT_MOBILITY = "walkable"

/**
 * The shape answer, turned into something the itinerary builder reads.
 *
 * THIS IS WHY SCREEN 3 IS NOT DECORATION. "What pulls you" was ranking the very
 * next screen's shelf and then being discarded — the answer never left the
 * browser. iOS derives `user_travel_preferences.priorities` from the same tags
 * and persists it, and build-itinerary reads that column to rotate what it
 * searches for each day (nature/views steer it scenic, history steers it to old
 * towns). So the same answer shaped every future itinerary on iOS and none on
 * web.
 *
 * `stay` maps to nothing on purpose: "one base, slow days" is a statement about
 * pace, not about what you want to look at, and the pace question asks it
 * directly one screen later. `arts_culture` is a valid column value that is
 * deliberately never INFERRED here — nothing in the shape vocabulary means it,
 * and guessing it would put a preference in the row the traveller never gave.
 */
const SHAPE_PRIORITIES: Readonly<Record<string, readonly string[]>> = {
  eat: ["food"],
  stones: ["history"],
  wild: ["nature"],
  high: ["nature", "views"],
  islands: ["views"],
  drive: ["views"],
}

/** Sorted and de-duplicated, matching the Swift `Set(...).sorted()`, so the two
 *  platforms write byte-identical arrays for the same picks. */
export function prioritiesForShapes(shapes: Iterable<string>): string[] {
  const out = new Set<string>()
  for (const tag of shapes) for (const p of SHAPE_PRIORITIES[tag] ?? []) out.add(p)
  return [...out].sort()
}

/** The column defaults, so an untouched screen 4 writes what the row already
 *  holds rather than a second opinion about what "normal" is. */
/**
 * Who's with you — THREE options against the column's four.
 *
 * `inspire_trips.party` is solo|couple|friends|family; the live shelf is
 * 10/15/14/**1**. Offering "family" would score 39 of 40 guides a miss and hand
 * back the one family guide padded out by whatever tied behind it — precisely
 * the "same three trips whatever you pick" fault that widening this vocabulary
 * was meant to fix, rebuilt on a fresh axis. The column keeps `family` for the
 * day the shelf earns a second one. Only ask what the corpus can answer.
 *
 * Unlike the two below, this is NOT written to user_travel_preferences — there
 * is no column for it. It ranks the shelf and stays on the device.
 */
export const TRAVEL_PARTIES: ReadonlyArray<PrefOption> = [
  { value: "solo", label: "Just me", subtitle: "Your pace, nobody to negotiate with", icon: "person" },
  { value: "couple", label: "Two of us", subtitle: "One plan, two opinions", icon: "people2" },
  { value: "friends", label: "A group", subtitle: "Plans that survive a group chat", icon: "people3" },
]

/**
 * WHY `splurge` SURVIVES A CENSUS `family` FAILED. It is 3 guides of 40, and
 * measured over the whole answer space picking "No limit" lifts the share of
 * genuinely-splurge guides shown from 7.5% to 8.1%. As a RANKING signal it is
 * close to inert, and by the rule in TRAVEL_PARTIES above it would go.
 *
 * It stays because ranking is not all it does. `budget_style` and
 * `travel_rhythm` are columns of user_travel_preferences that build-itinerary
 * and refine-itinerary read server-side on every itinerary Drift builds this
 * person — which is what the screen's subtitle promises. A party answer has no
 * such column, so ranking the shelf is the whole of what it can do, and a
 * bucket too thin to rank makes it worthless. These two earn their place
 * elsewhere.
 */
export const DEFAULT_RHYTHM = "balanced"
export const DEFAULT_BUDGET = "smart_mix"

/** Everything the sort reads, and nothing else — so the shelf's own row shape
 *  can grow without this file knowing about it. */
export interface RankableGuide {
  /** The shape tags the row stores (`wild`, `stones`, …).
   *
   *  NO LONGER SCORED — kept because the shelf's category rails and free-text
   *  search read it. See `shapeMissFor` for what replaced it and why. */
  tags: string[]
  /** What the guide is FOR, ordered by prominence. Position 0 is the primary
   *  and is what the shape answer is actually scored on. */
  interests: string[]
  optimizeFor: string[]
  setting: string[]
  /** Stops the trip sleeps in. Read only by the `stay` shape. */
  cityCount: number
  /** Share of the trip's NIGHTS per shape, e.g. {"wild":0.65,"islands":0.21}.
   *  Derived from every stop's nights; see 20260912210000. Empty when absent. */
  shapeWeights: Record<string, number>
  /** One word for what the trip is. For drive and stay it is derived
   *  structurally and may carry a weight of 0 — being the primary counts as
   *  full strength, never as absence. Null when absent. */
  shapePrimary: string | null
  /** 12 scores, 0…100, index 0 = January (20260912230000). Empty when the
   *  column has not landed — `seasonScore` then falls back to bestMonths. */
  monthScores: number[]
  /** Months 1…12 the guide must NOT be offered — a park closed, a dated event
   *  that IS the trip. Hand-authored only. Removes, never scores. */
  blackoutMonths: number[]
  /** Months 1…12 the guide is editorially at its best. May be empty. */
  bestMonths: number[]
  /** `snapshot.day_count`. */
  days: number
  /** The editorial columns. Null = the row makes no claim, which ranks as a
   *  miss rather than as a match. */
  party: string | null
  pace: string | null
  budget: string | null
}

export interface RankingAnswers {
  /** Screen 3's chips. Empty means "show me everything". */
  shapes: ReadonlySet<string>
  /** Screen 3's pills. */
  length: TripLength
  /** Screen 4. Null/absent means the traveller did not answer — an unasked
   *  question cannot be got wrong and must not reorder anything. `party` is
   *  solo|couple|friends, `rhythm` easy|balanced|full_days, `budget`
   *  save|smart_mix|splurge: the SERVER's vocabulary, never the labels'. */
  party?: string | null
  rhythm?: string | null
  budget?: string | null
  /** 1…12, the month of the date the copy will ACTUALLY start on — see
   *  departureMonth in DaybreakFlow. Never the current month. */
  departureMonth: number
}

/**
 * Best first. Lexicographic rather than a weighted score: the precedence is a
 * product decision and a tuple states it plainly, where weights would bury it
 * in arithmetic nobody can argue with.
 *
 * 1. The shapes they picked — the loudest thing they chose explicitly.
 * 2. Who they travel with, against the guide's `party`.
 * 3. The length they said they had.
 * 4. Pace and budget SUMMED — matching one is better than matching neither.
 * 5. In season for the month they would actually leave in. NOT the current
 *    month: you cannot leave today, and the trip is booked from the first of
 *    the next month you could go, so ranking for "now" would recommend for a
 *    departure date nobody is offered.
 * 6. Editorial rank, as the incoming order — stable, so equal trips keep the
 *    shelf's own ordering rather than shuffling per visit.
 *
 * SEASON SITS BELOW EVERY ANSWER, which is a change: it used to come second.
 * It is DERIVED from a departure month nobody picked, so a guide that fits who
 * you travel with and how should beat one that is merely in season.
 *
 * Pace and budget share a component because iOS cannot spend two — Swift
 * defines `<` on tuples only up to six elements. An array key here has no such
 * ceiling, but parity is the point: the two platforms must return the same
 * three guides for the same answers, so this matches the shape iOS is forced
 * into rather than the shape TypeScript would allow. It is also the honest
 * grouping — two halves of one screen, neither obviously above the other.
 *
 * The index is carried explicitly rather than leaning on a stable `sort`: it is
 * the last key of the comparison iOS states in a tuple, and writing it down
 * is what makes that tie-break a decision rather than a property of whichever
 * engine is running.
 */
export function rankGuides<T extends RankableGuide>(
  guides: readonly T[],
  answers: RankingAnswers
): T[] {
  return guides
    .map((guide, index) => ({ guide, key: sortKey(guide, index, answers) }))
    .sort((a, b) => {
      for (let i = 0; i < a.key.length; i++) {
        if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i]
      }
      return 0
    })
    .map((entry) => entry.guide)
}

/** All components ascending: 0 is the better answer. */
/**
 * What counts as evidence for each shape, in three tiers of decreasing
 * confidence. Censused from the live corpus — every value here exists on real
 * rows; none is invented.
 *
 * WHY THIS EXISTS AT ALL. The shape answer used to be scored by asking whether
 * the guide's `tags` array contained the picked slug. Thirty of the ninety
 * active guides carry `islands`, so a reader who picked "Islands & beaches"
 * tied thirty guides at zero, the only thing they had said about scenery bought
 * nothing, and the decision fell through to party, pace, budget and editorial
 * rank. A Highland rail journey won that contest outright, and a safari took
 * third from the Maldives on a budget column.
 *
 * `interests` is a near 1:1 with the seven chips and its position 0 is 94%
 * consistent with the row's own tags — it is the signal that separates a beach
 * trip from a safari that ends at a beach. It was populated on all ninety rows
 * the entire time and neither platform selected it.
 *
 * WHAT IS DELIBERATELY ABSENT, because each would rebuild the original bug at a
 * larger scale: `nature_views` (57 of 90) and `adventure` (42, and it predicts
 * `high` and `wild` equally); `must_sees` (39); setting `city` (45) and
 * `countryside` (31); `meals` and `party_fit`, which carry identical values on
 * all ninety rows.
 *
 * KNOWN GAP: `cities_culture` sits on 44 guides, 8 of them as the primary
 * interest, and maps to no chip at all. A reader who wants a city break has
 * nothing to pick and falls through the shape question entirely — the same path
 * as the reported bug, reached by a missing option rather than a tie. That is a
 * product decision, not a ranking one.
 */
export const SHAPE_INTERESTS: Readonly<Record<string, readonly string[]>> = {
  wild: ["nature_wildlife", "wildlife_safari"],
  stones: ["history_ruins"],
  drive: ["road_trip"],
  eat: ["food_drink"],
  islands: ["islands_beaches"],
  high: ["mountains_hiking"],
  stay: ["one_base_slow", "wellness"],
}
const SHAPE_OPTIMIZE: Readonly<Record<string, readonly string[]>> = {
  wild: [],
  stones: ["culture_history"],
  drive: [],
  eat: ["food_local", "nightlife"],
  islands: ["beach_relax"],
  high: [],
  stay: ["soft_luxury", "neighborhood"],
}
const SHAPE_SETTING: Readonly<Record<string, readonly string[]>> = {
  wild: ["safari", "jungle", "arctic"],
  stones: [],
  drive: [],
  eat: [],
  islands: ["islands", "beach"],
  high: ["mountains", "lakes"],
  stay: [],
}

/**
 * How badly one guide misses one picked shape. 0 is a direct hit, 4 is no
 * evidence at all.
 *
 * FIRST MATCH WINS — the clauses return, they do not accumulate. A guide whose
 * primary interest is the shape scores 0 even though its setting would also
 * have matched at tier 3.
 *
 * PRESENCE ALONE IS NOT ENOUGH, and this is the part that is easy to get wrong.
 * A flat "does `interests` contain it" test was simulated against all ninety
 * rows and reproduces the original bug on five of the seven chips — it returns
 * the Highland rail journey first for both "Road trip" and "Mountains &
 * hiking", because 35 to 56 guides tie at zero and the tail decides again. The
 * tier is the fix, not the column.
 */
export function shapeMissFor(guide: RankableGuide, shape: string): number {
  const known = SHAPE_INTERESTS[shape]
  // An unknown shape scores a uniform miss rather than throwing: a chip added
  // to the survey before the tables are updated must not empty the shelf.
  if (!known) return 4

  // THE ONE STRUCTURAL CLAUSE, and it is `stay` only. In this corpus
  // `one_base_slow` means "unhurried", not "one base" — it sits on a six-city
  // river journey and on a guide whose own title is "Lodge to Lodge". The chip
  // says "One base, slow days", and the only column that actually says you do
  // not move is the stop count.
  //
  // TIER 1, NOT 0, deliberately: it must join an editorially-slow guide, never
  // outrank one. At tier 0 the chip becomes city-breaks-only and a guide
  // authored for families floats into a couple's top three.
  if (shape === "stay" && guide.cityCount <= 1) return 1

  if (guide.interests.length > 0 && known.includes(guide.interests[0])) return 0
  if (guide.interests.some((i) => known.includes(i))) return 1
  if (guide.optimizeFor.some((o) => (SHAPE_OPTIMIZE[shape] ?? []).includes(o))) return 2
  if (guide.setting.some((t) => (SHAPE_SETTING[shape] ?? []).includes(t))) return 3
  return 4
}

/**
 * How much of a guide is one shape, 0…1. The primary is full strength even
 * when its nights weight is 0, because drive and stay are derived from what
 * kind of trip it is rather than from where it sleeps.
 */
/**
 * How good a guide is in a month, 0…100.
 *
 * GRADED, because in-or-out threw information away: a guide whose best window
 * opens one month after you leave scored exactly as badly as one at its worst,
 * which is how Rio — the one defensible result in the reported shelf — was
 * demoted below a Highland rail journey. `month_scores` lets a shoulder month
 * rank as a shoulder month.
 *
 * Without that column this is EXACTLY the old test (90 in bestMonths, 15 out),
 * so shipping the reader ahead of the backfill changes no ordering.
 */
export function seasonScore(guide: RankableGuide, month: number): number {
  if (guide.monthScores.length === 12 && month >= 1 && month <= 12) {
    return Math.min(Math.max(guide.monthScores[month - 1], 0), 100)
  }
  return guide.bestMonths.includes(month) ? 90 : 15
}

export function shapeFit(guide: RankableGuide, shape: string): number {
  if (guide.shapePrimary === shape) return 1
  const w = guide.shapeWeights[shape] ?? 0
  return Math.min(Math.max(w, 0), 1)
}

function sortKey(guide: RankableGuide, index: number, a: RankingAnswers): number[] {
  // HOW MANY of the picked shapes it misses, not merely whether it misses any.
  // Binary was the reason the same three guides came back whatever was picked:
  // the shelf's three highest-ranked trips carry `islands`, `eat`, `stay` and
  // `stones` between them — four of the seven — so any pick among those scored
  // them 0 alongside everything else that matched, and the editorial tie-break
  // then handed back the same front of the shelf. Reported on both platforms as
  // "always the same 3 trips no matter the selection", and it was: for four of
  // the seven answers. The tags, the payload and the wiring were all correct.
  //
  // Counting makes a pick discriminate. Someone who chooses mountains AND
  // wildlife now gets the trip that is both, ahead of the popular one that is
  // merely one of them — while a single pick is still fully satisfied by a
  // single matching tag, so a narrow guide is not penalised against a broad one.
  //
  // COUNTING WAS ONLY HALF THE FIX. The note above is still true and the sum is
  // kept — but counting one thing is binary, so for a reader who picks a SINGLE
  // shape the term went back to being the very thing it was meant to stop. That
  // is the unfixed half, and it is what returned a safari for a beach.
  //
  // Each pick now scores 0…4 by how directly the guide is that kind of trip
  // (see shapeMissFor) instead of 0…1 by whether a tag is present. Sorted
  // before summing so a shared fixture prints the same per-shape tiers on both
  // platforms; addition commutes, but a test that reports them does not.
  const shapeMiss = !a.shapes.size
    ? 0
    : [...a.shapes].sort().reduce((n, s) => n + shapeMissFor(guide, s), 0)
  // HOW MUCH OF THE TRIP IS THAT SHAPE — the LAST tie-break, not the first.
  //
  // It was first. Folded into the shape term, it sat above party, so for the
  // reported answer set (islands, couple, October) every pure-beach guide beat
  // the Maldives and Uruguay's Coast regardless of who was travelling: the
  // Maldives fell from 3rd to 16th and a couple's shelf filled with four family
  // guides. The weight was outranking the reader's own answers.
  //
  // So it only decides between guides the reader's answers leave TIED — same
  // tier, party, length, style and season — folded into the final slot ahead of
  // editorial order: fitDeficit × 1000 + index. `index` is the shelf position
  // (under 1000), so editorial order still breaks a genuine tie, and it stays a
  // single component because Swift's `<` stops at six. Quarter buckets so
  // near-equal weights still fall through to the curator.
  const fitDeficit = !a.shapes.size
    ? 0
    : [...a.shapes].sort().reduce((n, s) => n + (4 - Math.floor(shapeFit(guide, s) * 4)), 0)
  // An empty `bestMonths` ranks with the out-of-season group: absent editorial
  // is not a claim that any month will do.
  // Graded 0…3 from seasonScore — best / shoulder / edge / off. Without
  // month_scores it is 0 or 3, which orders exactly as the old 0 or 1 did.
  const season = seasonScore(guide, a.departureMonth)
  const seasonMiss = season >= 90 ? 0 : season >= 65 ? 1 : season >= 40 ? 2 : 3
  const lengthMiss = lengthFits(a.length, guide.days) ? 0 : 1
  const partyMiss = miss(a.party, guide.party)
  // Summed, not binary: a guide matching one of the two is strictly better
  // than one matching neither. Binary here would leave them tied and let the
  // shelf order decide — the same fault the shape component had.
  const styleMiss = miss(a.rhythm, guide.pace) + miss(a.budget, guide.budget)
  return [shapeMiss, partyMiss, lengthMiss, styleMiss, seasonMiss, fitDeficit * 1000 + index]
}

/**
 * 0 when the traveller did not answer. An unasked question cannot be got
 * wrong, so it must not reorder anything.
 *
 * A NULL COLUMN, though, counts as a miss — the same stance `bestMonths` takes
 * two lines up. A guide seeded without these sinks below one that answered,
 * rather than being promoted for having said nothing.
 */
function miss(answer: string | null | undefined, guide: string | null): number {
  if (!answer) return 0
  return guide === answer ? 0 : 1
}

// ---------------------------------------------------------------------------
// Distance — shown on the card, never in the sort
// ---------------------------------------------------------------------------

export interface Coord {
  lat: number
  lng: number
}

/** The mean Earth radius, in metres. */
const EARTH_R = 6_371_008.8

/**
 * Great-circle distance from home to the guide's first located stop, or null
 * when either end is unknown.
 *
 * `(0,0)` is the corpus's unset sentinel and is rejected here as everywhere
 * else — the shelf's own `usableCoord` has already dropped it on the way in, so
 * this guard is the second of two on purpose: it is what makes "no distance"
 * rather than "a trip to the middle of the Atlantic" a property of this
 * function, testable without a shelf.
 *
 * A sphere, not the WGS84 ellipsoid iOS's CLLocation walks. The two disagree by
 * a few tenths of a percent, which cannot survive rounding to the nearest 100.
 */
export function metresFromHome(pin: Coord | null, home: Coord | null): number | null {
  if (!pin || !home) return null
  if (!usable(pin) || !usable(home)) return null

  const toRad = Math.PI / 180
  const dLat = (pin.lat - home.lat) * toRad
  const dLng = (pin.lng - home.lng) * toRad
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(home.lat * toRad) * Math.cos(pin.lat * toRad) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(a)))
}

function usable(c: Coord): boolean {
  if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return false
  if (c.lat === 0 && c.lng === 0) return false
  return Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180
}

/**
 * "8,400 km away" / "5,200 mi away".
 *
 * Rounded hard on purpose. These are intercontinental numbers standing in for
 * "how far is this, roughly", and a figure like 8,437 km claims a precision the
 * input does not have — the origin is a city centroid and the destination is
 * whichever stop the guide starts at.
 *
 * `locale` is an argument rather than read from `navigator` inside, so the unit
 * choice can be exercised without a browser.
 */
export function distanceText(
  pin: Coord | null,
  home: Coord | null,
  locale?: string
): string | null {
  const metres = metresFromHome(pin, home)
  if (metres === null || metres <= 1000) return null
  const miles = usesMiles(locale)
  const value = miles ? metres / 1609.34 : metres / 1000
  const rounded = value >= 1000 ? Math.round(value / 100) * 100 : Math.round(value / 10) * 10
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(rounded)
  return `${n} ${miles ? "mi" : "km"} away`
}

/** The three territories CLDR gives the US measurement system — the same set
 *  behind iOS's `Locale.measurementSystem == .us`, rather than the US alone. */
const MILE_REGIONS = new Set(["US", "LR", "MM"])

function usesMiles(locale?: string): boolean {
  const tag =
    locale ??
    (typeof navigator !== "undefined" ? navigator.language : undefined) ??
    new Intl.NumberFormat().resolvedOptions().locale
  try {
    // maximize(): "en" alone carries no region, and the browser's own default
    // for it is en-US. A tag with a region keeps the region it was given.
    return MILE_REGIONS.has(new Intl.Locale(tag).maximize().region ?? "")
  } catch {
    return false
  }
}

/**
 * The count, spelled, for "Three of ours fit that."
 *
 * A headline is a sentence and a sentence does not open with a numeral. Beyond
 * the table it falls back to the digits — the flow only ever shows three, so
 * the tail exists to be correct rather than to be read.
 */
const SPELLED = ["Nothing", "One", "Two", "Three", "Four", "Five"]
/** How the shelf was arrived at, so the screen can say so. */
export interface Shelf<T> {
  guides: T[]
  /** The requirement that had to be loosened to fill the shelf, or null when
   *  nothing was. Shown to the reader — a silently widened search is how a
   *  recommender loses trust it cannot get back. */
  relaxed: "style" | "length" | "season" | "shape" | null
}

/** Guides whose SHAPE genuinely matches: tier 0 or 1 on every pick. */
function clearsTheFloor(guide: RankableGuide, a: RankingAnswers): boolean {
  if (!a.shapes.size) return true
  return [...a.shapes].every((s) => shapeMissFor(guide, s) <= 1)
}

/**
 * The three (or two, or one) guides the first-run screen shows.
 *
 * STOP PADDING TO THREE. The ranker sorts and never filters, so the old
 * `.slice(0, 3)` filled the third slot by construction — with whatever was
 * least-bad in the whole corpus. On a first-run screen that slot is the
 * highest-stakes real estate in the product and it was the one guaranteed to
 * hold the weakest result. The reported failure was exactly that: one guide
 * cleared every term, and a safari and an out-of-season Rio were shown beside
 * it under a headline reading "Three of ours fit that."
 *
 * Better to show two good ones than three where one is wrong: a reader forgives
 * a short list and remembers a bad recommendation.
 *
 * THE FLOOR IS THE SHAPE, and only the shape. Length, budget, pace and season
 * are graded — hard-gating a graded attribute over a ninety-item corpus empties
 * the screen, which is the mirror-image bug. A guide that is genuinely the kind
 * of trip you asked for but slightly out of season still belongs on the shelf;
 * one that is the wrong kind of trip never does.
 *
 * WHEN NOTHING CLEARS IT, the shape requirement is loosened one tier at a time
 * and the caller is told which — never silently. `shape` as a relaxation value
 * means even tier 2-3 was needed, which is the honest signal that the corpus
 * has a hole rather than that the reader asked for something strange.
 */
export function shelfFor<T extends RankableGuide>(
  guides: readonly T[],
  answers: RankingAnswers,
  size = 3
): Shelf<T> {
  // BLACKOUTS REMOVE, before anything else is decided. A park that is closed in
  // the month you leave is not a lower-ranked answer, it is not an answer. Only
  // if that empties the corpus entirely — it cannot with hand-authored
  // blackouts on ninety guides — does the unfiltered order come back, because a
  // dead end in a reader's first minute is worse still.
  const open = rankGuides(guides, answers).filter(
    (g) => !g.blackoutMonths.includes(answers.departureMonth)
  )
  const ranked = open.length ? open : rankGuides(guides, answers)
  const clean = ranked.filter((g) => clearsTheFloor(g, answers))
  if (clean.length > 0) return { guides: clean.slice(0, size), relaxed: null }

  // Nothing is the right kind of trip. Widen once, and say so.
  const widened = ranked.filter(
    (g) => !answers.shapes.size || [...answers.shapes].every((s) => shapeMissFor(g, s) <= 3)
  )
  if (widened.length > 0) return { guides: widened.slice(0, size), relaxed: "shape" }

  // The corpus has nothing at all. Show the best of it rather than an empty
  // screen — the one case where padding is the lesser harm, because the
  // alternative is a dead end on a reader's first minute in the app.
  return { guides: ranked.slice(0, size), relaxed: "shape" }
}

/**
 * One clause saying why this guide is here, generated from the term that
 * actually fired.
 *
 * NEVER A PERCENTAGE, and that is evidence-based rather than taste: Herlocker,
 * Konstan and Riedl (CSCW 2000, 21 interfaces, 78 subjects) found four
 * STATISTICAL explanation styles scored significantly BELOW showing nothing at
 * all, while content-and-evidence explanations beat the no-explanation
 * baseline. So no "78% match", no confidence score, no "ranked #2 of 90".
 *
 * ONE CLAUSE, for the same reason: in that study the winning explanation beat a
 * strictly more informative version of itself, which scored below the bare
 * card.
 *
 * Tied to the term that decided, so it cannot drift from the ranking: if the
 * shape is what put the guide here, the shape is what it says.
 */
export function reasonFor(
  guide: RankableGuide,
  answers: RankingAnswers,
  labelFor: (shape: string) => string
): string | null {
  const picks = [...answers.shapes].sort()
  const direct = picks.find((s) => shapeMissFor(guide, s) === 0)
  if (direct) return labelFor(direct)
  const present = picks.find((s) => shapeMissFor(guide, s) === 1)
  if (present) return labelFor(present)
  // Nothing about the shape fired, so say the next truest thing rather than
  // inventing a reason. Season is the only remaining term the reader chose.
  if (seasonScore(guide, answers.departureMonth) >= 90) return "In season"
  return null
}

export function spelledCount(n: number): string {
  return SPELLED[n] ?? String(n)
}
