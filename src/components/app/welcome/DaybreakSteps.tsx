"use client"

import TripCoverImg from "@/components/app/TripCoverImg"
import CoverCredit from "@/components/app/CoverCredit"
import {
  BUDGET_STYLES,
  distanceText,
  spelledCount,
  TRAVEL_PARTIES,
  TRAVEL_RHYTHMS,
  TRIP_LENGTHS,
  type Coord,
  type TripLength,
} from "@/lib/drift/daybreak"
import { plateForTag, type Plate } from "@/lib/drift/daybreakArt"
import { tripCover } from "@/lib/drift/tripCover"
import type { DaybreakGuide } from "@/lib/drift/inspirePromo"
import type { PlaceCandidate } from "@/lib/drift/chat"

// The seven screens of the first-run flow. Each one owns a question and nothing
// else — the sky, the photograph, the progress bar, the back button and every
// transition live in DaybreakFlow, so a screen here is only its content.
//
// Ported from Drift/Views/DaybreakSteps.swift. Every headline, subtitle, button
// and skip label is verbatim: the two platforms are one product and must not
// say different things about the same question.

// MARK: - Shared furniture

/**
 * The question at the top of every screen. One size, one weight, everywhere —
 * the flow's whole rhythm is that the headline is the largest thing on screen
 * and the answer is directly beneath it.
 *
 * The line breaks are the iOS ones, kept rather than left to the browser: the
 * column is phone-width by design and "Where do you / set out from?" is a
 * chosen break, not an accident of wrapping.
 */
export function Question({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="space-y-[7px]">
      <h1 className="whitespace-pre-line font-drift-display text-[30px] font-bold leading-[1.08] text-aurora-ink">
        {title}
      </h1>
      {subtitle && (
        // ink2, NOT ink3. This line sits on a sky that ends the flow at
        // #FFA96B, and ink3 (#7D8C98) is grey-on-peach by the last screen —
        // legible in the first four and nearly gone in the sixth. Paired with
        // the scrim in DaybreakSky.
        <p className="text-[13px] leading-snug text-aurora-ink2">{subtitle}</p>
      )}
    </div>
  )
}

/** The one filled action at the bottom of every screen. `aurora-cta` is the
 *  house teal gradient — `bg-aurora-teal` is a backgroundImage, so it only
 *  behaves as a fill through that class. */
export function Cta({
  label,
  disabled = false,
  onClick,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="aurora-cta flex h-[50px] w-full items-center justify-center text-[15.5px] disabled:opacity-45"
    >
      {label}
    </button>
  )
}

/** The way out. Present on every screen after the first, because the account is
 *  already usable before any of this and nothing here is allowed to be a gate. */
export function Skip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full py-2.5 text-[13.5px] font-semibold text-aurora-ink3 transition-colors hover:text-aurora-ink2"
    >
      {label}
    </button>
  )
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[18px] border border-aurora-border bg-aurora-glass ${className}`}>
      {children}
    </div>
  )
}

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** The bottom of a screen: the action, and the way past it. `mt-auto` is what
 *  floats the answer into the space between the question and the button rather
 *  than stacking everything against the headline. */
function Footer({ children }: { children: React.ReactNode }) {
  return <div className="mt-auto pt-5">{children}</div>
}

// MARK: - The photographic canvas

/**
 * Full-bleed photograph, scrim, and the credit the licence requires.
 *
 * The flow ran over a CSS-gradient sky. In an app whose whole asset is 108
 * photographed places, a person could answer four screens before seeing one — so
 * the picture is the ground now and the question sits on it. DaybreakSky
 * survives UNDERNEATH as the fallback, for the moment before the shelf lands and
 * for a shelf that never does: this draws nothing at all when there is no
 * photograph, rather than painting a flat colour over a sunrise that is already
 * correct.
 *
 * A SCRIM IS NOT OPTIONAL. White serif over an unknown photograph is legible
 * only by luck, and the corpus runs from an aurora at midnight to a lemon
 * terrace at noon. It lives inside this component rather than in the flow so
 * there is no way to put a photograph on screen without it.
 *
 * NEITHER IS THE CREDIT. Both licences bind attribution to the DISPLAY, so a
 * full-bleed photo without one is a licence problem rather than a styling
 * choice. `showCredit={false}` on the image and CoverCredit rendered here is the
 * case that prop was added for — the same photo, credited somewhere the layout
 * can actually hold it. The chip cannot ride at the photo's own bottom-right
 * because the photo is the whole viewport and that corner belongs to the skip
 * link, so it sits top-right the way iOS does, aligned to the reading column at
 * every width and above it in the stack.
 */
export function Backdrop({ plate, deep = false }: { plate: Plate | null; deep?: boolean }) {
  const cover = plate?.cover
  if (!cover?.url) return null

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        <TripCoverImg cover={cover} sizes="100vw" showCredit={false} priority />
        <div
          className="absolute inset-0"
          style={{
            // Scrim.photoTop and Scrim.photoBottomDeep, the same two values
            // GuideCard already uses. `deep` is for the screens whose content
            // reaches the top of the frame — the mosaic and the three cards.
            background: deep
              ? "linear-gradient(to bottom, rgba(0,0,0,0.85), rgba(0,0,0,0.70) 50%, rgba(0,0,0,0.45))"
              : "linear-gradient(to bottom, rgba(0,0,0,0.45), transparent 50%, rgba(0,0,0,0.85))",
          }}
        />
      </div>

      {cover.credit && (
        // pointer-events-none on the strip, auto on the chip: this layer spans
        // the top of the screen above the chrome, and without it the back
        // button underneath would stop responding.
        <div className="pointer-events-none fixed inset-x-0 top-0 z-20 mx-auto flex w-full max-w-[440px] justify-end px-[18px]">
          <div className="pointer-events-auto">
            <CoverCredit text={cover.credit.text} href={cover.credit.href} placement="inline" />
          </div>
        </div>
      )}
    </>
  )
}

// MARK: - 01 · Is this you?

/**
 * Confirmation, not a form.
 *
 * The screen it replaces was `UsernameSetupView` — a root view with no exit
 * whose Continue button arrived DISABLED for the 29 of 41 accounts that signed
 * up by email, and 7 of them never got past it.
 */
export function IdentityStep({
  displayName,
  username,
  avatarUrl,
  onEdit,
  onNext,
}: {
  displayName: string
  username: string
  avatarUrl: string | null
  onEdit: () => void
  onNext: () => void
}) {
  const initial = (displayName.trim()[0] ?? "D").toUpperCase()
  return (
    <>
      <Question
        title="Is this you?"
        subtitle="Your crew sees this when you share a trip. Change any of it now, or never."
      />

      {/* Floated rather than stacked under the headline — the answer belongs in
          the space between the question and the button. */}
      <div className="my-auto py-6">
        <Panel className="px-4 py-5 text-center">
          <span className="mx-auto block h-[72px] w-[72px] overflow-hidden rounded-full ring-2 ring-aurora-teal/50">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-aurora-indigo font-drift-display text-[28px] font-bold text-white">
                {initial}
              </span>
            )}
          </span>
          <p className="mt-[9px] truncate font-drift-display text-[20px] font-semibold text-aurora-ink">
            {displayName.trim() || "Traveler"}
          </p>
          <p className="mt-[9px] text-[12px] text-aurora-ink3">@{username || "drift"}</p>
          <button
            type="button"
            onClick={onEdit}
            className="mt-3 text-[12px] font-bold text-aurora-teal hover:opacity-80"
          >
            Edit name, handle or photo
          </button>
        </Panel>
      </div>

      <Footer>
        <Cta label="Yes, that's me" onClick={onNext} />
      </Footer>
    </>
  )
}

// MARK: - 02 · Where do you set out from?

/**
 * Every travel app opens on "Where are you going?" — the hardest question in
 * the product, asked at the moment the user knows least, which is usually why
 * they downloaded it. This asks the inverse: where you leave from is stable,
 * answerable without deciding anything, and the one fact that keeps paying —
 * distance from home in Travel Stats, and never having to ask which airport.
 */
export function OriginStep({
  query,
  onQuery,
  onSearch,
  searching,
  saving,
  results,
  chosen,
  onPick,
  onNext,
  onSkip,
}: {
  query: string
  onQuery: (v: string) => void
  onSearch: () => void
  searching: boolean
  saving: boolean
  results: PlaceCandidate[]
  chosen: string | null
  onPick: (c: PlaceCandidate) => void
  onNext: () => void
  onSkip: () => void
}) {
  return (
    <>
      <Question
        title={"Where do you\nset out from?"}
        subtitle="So we can measure how far you've gone — and stop asking where you're flying out of."
      />

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          onSearch()
        }}
      >
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={chosen ?? "Your home city"}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-[18px] border border-aurora-border bg-aurora-glass px-3.5 py-3.5 text-[16px] text-aurora-ink outline-none placeholder:text-aurora-ink3 focus:border-aurora-teal"
        />
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="shrink-0 rounded-[18px] border border-aurora-border bg-aurora-glass px-4 text-[13.5px] font-semibold text-aurora-ink2 disabled:opacity-45"
        >
          {searching ? "…" : "Search"}
        </button>
      </form>

      {/* Filled as you type — DaybreakFlow debounces the lookup and drops
          out-of-order answers, so this list is always the newest query's. It
          stays in flow rather than floating over the screen: the only thing
          below it is the Continue button, and a question with an open list of
          answers should not also be offering to move on. An empty result is an
          empty list, never a row saying so. */}
      {results.length > 0 ? (
        <Panel className="mt-3 overflow-hidden py-1">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={saving}
              onClick={() => onPick(c)}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-aurora-glass2 disabled:opacity-50"
            >
              <PinGlyph />
              <span className="min-w-0">
                <span className="block truncate text-[14px] text-aurora-ink">{c.name}</span>
                {c.address && (
                  <span className="block truncate text-[11px] text-aurora-ink3">{c.address}</span>
                )}
              </span>
            </button>
          ))}
        </Panel>
      ) : (
        chosen && (
          <p className="mt-3 flex items-center gap-1.5 text-[13px] font-semibold text-aurora-teal">
            <CheckGlyph />
            {chosen}
          </p>
        )
      )}

      <Footer>
        <Cta label="Continue" onClick={onNext} />
        <Skip label="Skip for now" onClick={onSkip} />
      </Footer>
    </>
  )
}

// MARK: - 03 · What pulls you (the mosaic)

/**
 * Seven chips become seven photographs.
 *
 * The words were reported as simply not understood — "Old stones", "Up high" —
 * and renaming them helped, but the deeper fault was asking in WORDS what this
 * app can ask in PICTURES. Each tile is a real destination from the highest-
 * ranked guide carrying that tag (see daybreakArt.ts), so the answer looks like
 * what it means, and nothing here is a place name typed into a source file.
 */
export function MosaicStep({
  categories,
  shelf,
  picked,
  onToggle,
  length,
  onLength,
  onNext,
  onSkip,
}: {
  categories: ReadonlyArray<{ slug: string; name: string }>
  /** In rank order — plateForTag reads "highest ranked" as "first". */
  shelf: readonly DaybreakGuide[]
  picked: ReadonlySet<string>
  onToggle: (slug: string) => void
  length: TripLength
  onLength: (v: TripLength) => void
  onNext: () => void
  onSkip: () => void
}) {
  return (
    <>
      <Question
        title="What pulls you?"
        subtitle={
          picked.size ? `${picked.size} picked. Pick as many as fit.` : "Pick as many as fit."
        }
      />

      {/* Two columns, deliberately uneven heights: a flat grid of seven equal
          rectangles reads as a form, which is the thing this screen exists to
          stop being. `items-start` is what keeps it uneven — CSS grid stretches
          a short cell to its row by default, which would quietly flatten the
          mosaic back into the form.

          Six in the grid, the seventh full width beneath it. Seven items in two
          columns leaves the last one beside a hole, and a hole in a mosaic reads
          as a tile that failed to load rather than as layout. */}
      <div className="mt-3 grid grid-cols-2 items-start gap-[7px]">
        {categories.slice(0, 6).map((c, i) => (
          <Tile
            key={c.slug}
            category={c}
            shelf={shelf}
            on={picked.has(c.slug)}
            onToggle={() => onToggle(c.slug)}
            tall={i % 3 === 0}
          />
        ))}
      </div>
      {categories[6] && (
        <div className="mt-[7px]">
          <Tile
            category={categories[6]}
            shelf={shelf}
            on={picked.has(categories[6].slug)}
            onToggle={() => onToggle(categories[6].slug)}
            tall={false}
          />
        </div>
      )}

      {/* The second half of the question, on the same screen rather than an
          eighth. ink2 rather than ink3 for the label: this sits on a photograph
          now, where the muted tertiary grey is very nearly gone. */}
      <div className="mt-4">
        <p className="text-[9.5px] font-bold tracking-[0.11em] text-aurora-ink2">
          HOW LONG HAVE YOU GOT?
        </p>
        <div className="mt-1.5 flex gap-1.5">
          {TRIP_LENGTHS.map((option) => (
            <PhotoPill
              key={option.id}
              label={option.label}
              on={length === option.id}
              onClick={() => onLength(option.id)}
            />
          ))}
        </div>
      </div>

      <Footer>
        {/* "Show me everything" is only honest when NEITHER half was answered.
            A length with no shapes is still an answer, and a button that says
            everything while three of the pills are excluding trips is the flow
            claiming not to have heard what it just read. */}
        <Cta
          label={!picked.size && length === "any" ? "Show me everything" : "Continue"}
          onClick={onNext}
        />
        <Skip label="Skip for now" onClick={onSkip} />
      </Footer>
    </>
  )
}

/**
 * One photographed tile.
 *
 * STRETCHED BUTTON, NOT A WRAPPER, and the button carries NO z-index — the same
 * shape, and the same reason, as GuideCard below. The photo credit is itself a
 * button, so it cannot sit inside the selection control and has to stay
 * clickable through it; TripCoverImg draws it at z-10 inside the photo box,
 * which is `relative` with z-index auto and therefore starts no stacking context
 * of its own, so the credit is compared against the stretched button directly
 * and wins. Giving the button any z-index at all would bury it — and a button
 * nested inside a button is invalid markup besides.
 *
 * ONE CREDIT PER TILE, which is stricter than the phone: iOS's mosaic draws
 * these photographs bare. Both licences bind attribution to the display and
 * every one of these is a display, so on web the obligation rides along for free
 * — TripCoverImg cannot render a stock photo without it.
 */
function Tile({
  category,
  shelf,
  on,
  onToggle,
  tall,
}: {
  category: { slug: string; name: string }
  shelf: readonly DaybreakGuide[]
  on: boolean
  onToggle: () => void
  tall: boolean
}) {
  const plate = plateForTag(category.slug, shelf)
  // Rung 4 — the deterministic gradient with the category's initial on it. This
  // is what a slow network actually holds, and it is a designed state rather
  // than a hole: the tile stays readable, tappable and the same size.
  const cover = plate?.cover ?? tripCover({ id: category.slug, title: category.name })

  return (
    <div className={`relative ${tall ? "h-[118px]" : "h-[82px]"}`}>
      <div
        className={`relative h-full overflow-hidden rounded-[13px] border-2 ${
          on ? "border-aurora-teal" : "border-transparent"
        }`}
      >
        <TripCoverImg cover={cover} sizes="(max-width: 480px) 50vw, 220px" />
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(to bottom, transparent 45%, rgba(0,0,0,0.85))" }}
        />
        {/* Cleared to the left of the credit chip, exactly as GuideCard is. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2 pr-[74px]">
          <p className="line-clamp-2 text-[12px] font-bold leading-tight text-white">
            {category.name}
          </p>
          {plate?.place && (
            <p className="truncate text-[8px] font-semibold uppercase tracking-[0.06em] text-white/70">
              {plate.place}
            </p>
          )}
        </div>
        {/* Selection reads on a photograph only if it has its own ground. */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute right-[7px] top-[7px] flex h-[18px] w-[18px] items-center justify-center rounded-full ${
            on ? "bg-aurora-teal text-aurora-teal-ink" : "border-[1.4px] border-white/80"
          }`}
        >
          {on && <CheckGlyph className="h-2.5 w-2.5" />}
        </span>
      </div>

      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        aria-label={category.name}
        className="absolute inset-0 rounded-[13px] outline-none focus-visible:ring-2 focus-visible:ring-aurora-teal/50"
      />
    </div>
  )
}

/** A small pill that has to read on a photograph. The glass fill the rest of the
 *  flow uses disappears over one, so selection is a solid teal fill and the rest
 *  is white at 14%. `bg-aurora-teal` is the house gradient — the same filled
 *  teal GuideCard's selection dot uses. */
function PhotoPill({
  label,
  on,
  onClick,
}: {
  label: string
  on: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`h-8 flex-1 truncate rounded-full px-2 text-[11.5px] font-semibold transition-colors ${
        on ? "bg-aurora-teal text-aurora-teal-ink" : "bg-white/[0.14] text-aurora-ink"
      }`}
    >
      {label}
    </button>
  )
}

// MARK: - 04 · How you travel

/**
 * Two questions the app ALREADY reads and the flow never asked.
 *
 * `travel_rhythm` and `budget_style` are columns of `user_travel_preferences`
 * that build-itinerary and refine-itinerary consume server-side, so these
 * answers are load-bearing the moment they are given — this is not a survey.
 * The values written are NOT the labels shown; see TRAVEL_RHYTHMS in daybreak.ts
 * for why, and for what iOS gets wrong about it.
 *
 * "Who's usually with you" WAS absent, for the reason this file gives
 * everywhere else: the corpus recorded who a trip is for only in prose —
 * "Amalfi Coast — Girls' Trip" — so asking would have been a question with
 * nothing behind it. `inspire_trips.party` now carries it as data, derived from
 * the recorded traveller count rather than from reading titles, so the question
 * has an answer and is asked. See TRAVEL_PARTIES for why it offers three
 * options and not the column's four.
 */
export function StyleStep({
  party,
  onParty,
  rhythm,
  onRhythm,
  budget,
  onBudget,
  onNext,
  onSkip,
}: {
  party: string
  onParty: (v: string) => void
  rhythm: string
  onRhythm: (v: string) => void
  budget: string
  onBudget: (v: string) => void
  onNext: () => void
  onSkip: () => void
}) {
  return (
    <>
      <Question
        title={"And how do\nyou travel?"}
        subtitle="This shapes every itinerary Drift builds you, not just this one."
      />

      {/* Floated into the space between the question and the button. Pinned to
          the top it rendered as a header, a small box, and two thirds of a phone
          of nothing. */}
      <div className="my-auto py-6">
        <Panel className="space-y-3.5 p-3.5">
          <Choice
            label="WHO'S WITH YOU"
            options={TRAVEL_PARTIES}
            value={party}
            onChange={onParty}
          />
          <Choice label="PACE" options={TRAVEL_RHYTHMS} value={rhythm} onChange={onRhythm} />
          <Choice label="BUDGET" options={BUDGET_STYLES} value={budget} onChange={onBudget} />
        </Panel>
      </div>

      <Footer>
        <Cta label="Continue" onClick={onNext} />
        <Skip label="Skip for now" onClick={onSkip} />
      </Footer>
    </>
  )
}

function Choice({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: ReadonlyArray<{ value: string; label: string }>
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <p className="text-[9.5px] font-bold tracking-[0.11em] text-aurora-ink3">{label}</p>
      <div className="mt-1.5 flex gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`h-[34px] flex-1 truncate rounded-full px-2 text-[12px] font-semibold transition-colors ${
              value === o.value
                ? "bg-aurora-teal text-aurora-teal-ink"
                : "bg-white/10 text-aurora-ink2"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// MARK: - 05 · Three of ours fit that

/** The payoff for screen 3: real trips that real people finished, ranked by
 *  what was just said. */
export function PickStep({
  guides,
  home,
  chosen,
  onChoose,
  onNext,
  onBrowseAll,
}: {
  guides: DaybreakGuide[]
  /** Shown on each card when known — see daybreak.ts: distance informs the
   *  choice, it does not reorder it. */
  home: Coord | null
  chosen: string | null
  onChoose: (tripId: string) => void
  onNext: () => void
  onBrowseAll: () => void
}) {
  return (
    <>
      <Question
        title={
          guides.length
            ? `${spelledCount(guides.length)} of ours\nfit that.`
            : "Finding your\nfirst trip."
        }
        subtitle="Someone finished each of these. Take one and every day is already in the order that worked."
      />

      <div className="mt-3.5 space-y-3">
        {guides.map((g) => (
          <GuideCard
            key={g.tripId}
            guide={g}
            home={home}
            selected={chosen === g.tripId}
            onChoose={() => onChoose(g.tripId)}
          />
        ))}
      </div>

      <Footer>
        <Cta label="Make it mine" disabled={!chosen} onClick={onNext} />
        <Skip label="Show me all of them instead" onClick={onBrowseAll} />
      </Footer>
    </>
  )
}

/**
 * A wide guide card.
 *
 * STRETCHED BUTTON, NOT A WRAPPER, and the button carries NO z-index. The photo
 * credit is itself a button — the Unsplash/Commons obligation travels with
 * every display of these photos — so it cannot sit inside the selection
 * control, and it has to stay clickable through it. TripCoverImg draws it at
 * z-10 inside the photo box; the photo box is `relative` with z-index auto and
 * therefore starts no stacking context of its own, so the credit is compared
 * against the stretched button directly and wins. Giving the button any
 * z-index at all would bury it. Same shape, and the same reason, as the home
 * deck's StartHere tile.
 */
function GuideCard({
  guide,
  home,
  selected,
  onChoose,
}: {
  guide: DaybreakGuide
  home: Coord | null
  selected: boolean
  onChoose: () => void
}) {
  // "10 DAYS · ICELAND · 2,900 KM AWAY". The distance is the one fact a person
  // cannot get from the photo, and without it two cards that look equally
  // appealing can be a short hop and a long-haul flight. Appended HERE rather
  // than built into the shelf's kicker: home is a client answer that may have
  // been given thirty seconds ago, on screen 2, after the server rendered.
  const far = distanceText(guide.pin, home)
  const kicker = far ? `${guide.kicker} · ${far}` : guide.kicker

  return (
    <article className="relative">
      <div
        className={`relative h-[132px] overflow-hidden rounded-[18px] border ${
          selected ? "border-2 border-aurora-teal" : "border-aurora-border"
        }`}
      >
        <TripCoverImg cover={guide.cover} sizes="(max-width: 480px) 100vw, 440px" />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.42) 0%, transparent 45%, rgba(0,0,0,0.86))",
          }}
        />
        {/* Cleared to the right of the credit chip. A floated credit over a
            title is the overlap this component's own notes warn about. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 pr-[86px]">
          <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-aurora-teal">
            {kicker}
          </p>
          <p className="line-clamp-2 font-drift-display text-[17px] font-semibold leading-tight text-white">
            {guide.title}
          </p>
        </div>
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute right-2.5 top-2.5 flex h-[22px] w-[22px] items-center justify-center rounded-full ${
            selected ? "bg-aurora-teal text-aurora-teal-ink" : "border-[1.5px] border-white/75"
          }`}
        >
          {selected && <CheckGlyph className="h-3 w-3" />}
        </span>
      </div>

      <button
        type="button"
        onClick={onChoose}
        aria-pressed={selected}
        aria-label={guide.aria}
        className="absolute inset-0 rounded-[18px] outline-none focus-visible:ring-2 focus-visible:ring-aurora-teal/50"
      />
    </article>
  )
}

// MARK: - 06 · Who's coming with you?

/**
 * Group trips and the shared ledger are the wedge, and a trip with someone else
 * in it is the only kind that has ever retained — so this earns a whole screen.
 *
 * THE INVITE IS NOT MINTED HERE. `create_trip_invite` needs a trip_id and the
 * trip does not exist until the next screen copies it, so this screen records
 * the intent and DaybreakFlow mints the link the moment there is something to
 * invite someone to.
 */
export function CrewStep({
  displayName,
  guide,
  onInvite,
  onAlone,
}: {
  displayName: string
  guide: DaybreakGuide | null
  onInvite: () => void
  onAlone: () => void
}) {
  const initial = (displayName.trim()[0] ?? "D").toUpperCase()
  return (
    <>
      <Question
        title={"Who's coming\nwith you?"}
        subtitle="They get the itinerary, the map and the running total. No app needed to look."
      />

      <div className="mt-3.5 space-y-3">
        <Panel className="flex items-center gap-[11px] p-[13px]">
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-aurora-indigo text-[12px] font-bold text-white">
            {initial}
          </span>
          <span>
            <span className="block text-[13.5px] font-semibold text-aurora-ink">You</span>
            <span className="block text-[11px] text-aurora-ink3">Organiser</span>
          </span>
        </Panel>

        {/* The empty seat, drawn as an empty seat. Without it the screen was a
            question about other people showing exactly one person, and the only
            way to find out what "Send an invite" does was to press it.

            AND IT IS A BUTTON. It shipped as a plain div: a dashed border, a
            plus, and a line of action text — by some distance the most inviting
            thing on the screen — wired to nothing. Reported on iOS as "cannot
            search anyone or generate a link", and pressing the row was the
            natural way to try to do either. Same defect here, same fix: it does
            what the CTA does, because the row and the CTA are one intention. */}
        <button
          type="button"
          onClick={onInvite}
          className="flex w-full items-center gap-[11px] rounded-[18px] border border-dashed border-aurora-teal/35 bg-aurora-glass p-[13px] text-left transition-colors hover:bg-white/[0.06]"
        >
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-aurora-teal/[0.18] text-[15px] font-bold leading-none text-aurora-teal">
            +
          </span>
          {/* "…, name or number" promised three routes where one works: there
              is no phone-number invite in the app at all, and the name search
              (iOS only, and reading the people you follow) finds nobody for the
              brand-new account this screen exists to serve. */}
          <span className="text-[13px] text-aurora-ink2">Invite with a link</span>
        </button>

        {guide && (
          <Panel className="p-[13px]">
            <p className="text-[9.5px] font-bold tracking-[0.11em] text-aurora-ink3">
              THEY&rsquo;LL LAND ON
            </p>
            <p className="mt-0.5 line-clamp-2 text-[13.5px] font-semibold text-aurora-ink">
              {guide.title}
            </p>
            <p className="line-clamp-2 text-[11px] text-aurora-ink3">{guide.shapeLine}</p>
          </Panel>
        )}
      </div>

      <Footer>
        <Cta label="Send an invite" onClick={onInvite} />
        <Skip label="I'm going alone" onClick={onAlone} />
      </Footer>
    </>
  )
}

// MARK: - 07 · Daybreak

/**
 * The wait, made into the best screen in the flow.
 *
 * Every line here is a real step copy-trip takes, and it ends on the globe
 * lighting up — which is the thing the user actually came to see. The ticks are
 * PACED rather than measured: copy-trip is one call that returns when the whole
 * itinerary has landed, so there are no intermediate events to report. That
 * makes the four rows an honest description of what the server is doing and a
 * dishonest clock — so the last row does not complete until the call actually
 * returns, and a failure REPLACES the whole list rather than freezing it
 * mid-tick.
 */
export function BuildStep({
  tripTitle,
  stopsLine,
  stage,
  failed,
  inviteUrl,
  copied,
  onShareInvite,
  onOpen,
  onRetry,
}: {
  tripTitle: string
  stopsLine: string
  /** 0…3, the index of the step currently running. 4 = finished. */
  stage: number
  failed: string | null
  inviteUrl: string | null
  copied: boolean
  onShareInvite: () => void
  onOpen: () => void
  onRetry: () => void
}) {
  const steps = [
    { icon: <SuitcaseGlyph />, title: "Copying the pattern", detail: "Every day, in order" },
    { icon: <PinGlyph />, title: "Placing your stops", detail: stopsLine },
    {
      icon: <CalendarGlyph />,
      title: "Setting your dates",
      detail: "From the next month you could go",
    },
    { icon: <GlobeGlyph />, title: "Lighting your globe", detail: "Your first pin" },
  ]

  return (
    <>
      <Question
        title={failed ? "That didn't\ngo through." : "Putting it on\nyour globe."}
        subtitle={failed ?? tripTitle}
      />

      {!failed && (
        <div className="mt-3.5 space-y-3">
          {steps.map((s, i) => (
            <Panel
              key={s.title}
              className={`flex items-center gap-[11px] p-[11px] ${i <= stage ? "" : "opacity-[0.42]"}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-aurora-teal/15 text-aurora-teal">
                {s.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-aurora-ink">{s.title}</span>
                <span className="block truncate text-[10.5px] text-aurora-ink3">{s.detail}</span>
              </span>
              <span className="flex h-4 w-4 shrink-0 items-center justify-center text-aurora-teal">
                {i < stage ? (
                  <CheckGlyph className="h-3.5 w-3.5" />
                ) : i === stage ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  <span className="block h-[13px] w-[13px] rounded-full border-2 border-aurora-ink3/40" />
                )}
              </span>
            </Panel>
          ))}
        </div>
      )}

      {/* The link only exists once the trip does, which is why it lands here
          rather than on the screen that asked for it. */}
      {!failed && inviteUrl && (
        <Panel className="mt-3 p-[13px]">
          <p className="text-[9.5px] font-bold tracking-[0.11em] text-aurora-ink3">
            YOUR INVITE LINK
          </p>
          <p className="mt-1 truncate text-[12.5px] text-aurora-ink2">{inviteUrl}</p>
          <button
            type="button"
            onClick={onShareInvite}
            className="mt-2 rounded-full border border-aurora-border px-3.5 py-1.5 text-[12.5px] font-semibold text-aurora-teal"
          >
            {copied ? "Copied" : "Share it"}
          </button>
        </Panel>
      )}

      <Footer>
        {failed ? (
          <>
            <Cta label="Try again" onClick={onRetry} />
            <Skip label="Skip — take me in" onClick={onOpen} />
          </>
        ) : stage >= steps.length ? (
          <Cta label="Open my trip" onClick={onOpen} />
        ) : (
          <p className="pb-4 text-center text-[12px] text-aurora-ink3">A few seconds</p>
        )}
      </Footer>
    </>
  )
}

// MARK: - Glyphs
// SF Symbols on the phone; hand-drawn here so the four checklist rows carry the
// same four ideas without pulling an icon package into this route's bundle.

function CheckGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m5 13 4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PinGlyph() {
  return (
    <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.9" />
    </svg>
  )
}

function SuitcaseGlyph() {
  return (
    <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="7" width="18" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.9" />
      <path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2" stroke="currentColor" strokeWidth="1.9" />
    </svg>
  )
}

function CalendarGlyph() {
  return (
    <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.9" />
      <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

function GlobeGlyph() {
  return (
    <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.9" />
      <path d="M3 12h18M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18" stroke="currentColor" strokeWidth="1.9" />
    </svg>
  )
}
