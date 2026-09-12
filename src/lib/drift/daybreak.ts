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
export const TRIP_SHAPES: ReadonlyArray<{
  slug: string
  label: string
  subtitle: string
  icon: string
}> = [
  { slug: "wild", label: "Nature & wildlife", subtitle: "Parks, animals, big landscapes", icon: "leaf" },
  { slug: "stones", label: "History & ruins", subtitle: "Old towns, temples, museums", icon: "columns" },
  { slug: "drive", label: "Road trip", subtitle: "The route is half the trip", icon: "car" },
  { slug: "eat", label: "Food & drink", subtitle: "Markets, long dinners, bars", icon: "bowl" },
  { slug: "islands", label: "Islands & beaches", subtitle: "Coast, swimming, slow sun", icon: "umbrella" },
  { slug: "high", label: "Mountains & hiking", subtitle: "Trails, altitude, big views", icon: "mountain" },
  { slug: "stay", label: "One base, slow days", subtitle: "Unpack once and go deep", icon: "house" },
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
  /** The shape tags the row stores (`wild`, `stones`, …). */
  tags: string[]
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
  const shapeMiss = !a.shapes.size
    ? 0
    : [...a.shapes].reduce((n, s) => n + (guide.tags.includes(s) ? 0 : 1), 0)
  // An empty `bestMonths` ranks with the out-of-season group: absent editorial
  // is not a claim that any month will do.
  const seasonMiss = guide.bestMonths.includes(a.departureMonth) ? 0 : 1
  const lengthMiss = lengthFits(a.length, guide.days) ? 0 : 1
  const partyMiss = miss(a.party, guide.party)
  // Summed, not binary: a guide matching one of the two is strictly better
  // than one matching neither. Binary here would leave them tied and let the
  // shelf order decide — the same fault the shape component had.
  const styleMiss = miss(a.rhythm, guide.pace) + miss(a.budget, guide.budget)
  return [shapeMiss, partyMiss, lengthMiss, styleMiss, seasonMiss, index]
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
export function spelledCount(n: number): string {
  return SPELLED[n] ?? String(n)
}
