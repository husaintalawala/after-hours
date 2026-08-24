"use client"

import { useState } from "react"
import Link from "next/link"
import TripCoverImg from "@/components/app/TripCoverImg"
import CoverCredit from "@/components/app/CoverCredit"
import OptimizedImg from "@/components/app/OptimizedImg"
import FollowButton from "@/components/app/people/FollowButton"
import type {
  ActivityPerson,
  ActivityPulse,
  ActivityReviewCard,
  ActivitySignal,
  ActivityUpNext,
} from "@/app/app/(protected)/activity/page"

// The web half of the iOS Activity tab, to the same canvas. Two modes, because
// the two jobs have different rhythms: in one scroll, discovery always loses —
// which is exactly what happened when it sat at the bottom of a single feed.
//
// Only the mode needs state, so this is the one client island; the page stays
// an RSC that hands it fully-formed data.

type Mode = "updates" | "people"

/** The shared rail track. Fifteenth copy of this class string in the codebase
 *  is fourteen too many, so it lives here for this screen. */
const RAIL =
  "flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"

export default function ActivityShell({
  meId,
  upNext,
  reviewCards,
  pulse,
  people,
  signals,
}: {
  meId: string
  upNext: ActivityUpNext | null
  reviewCards: ActivityReviewCard[]
  pulse: ActivityPulse[]
  people: ActivityPerson[]
  signals: ActivitySignal[]
}) {
  const [mode, setMode] = useState<Mode>("updates")

  const crew = people.filter((p) => p.tier === "crew")
  const others = people.filter((p) => p.tier !== "crew")
  const standfirst = [
    crew.length ? `${crew.length} you've travelled with` : null,
    others.length ? `${others.length} worth knowing` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  const updatesEmpty = !upNext && !reviewCards.length && !pulse.length && !signals.length

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-28 pt-6">
      <h1 className="font-drift-display text-3xl font-medium tracking-tight text-aurora-ink">
        Activity
      </h1>

      <div className="mt-4 flex gap-1 rounded-full bg-aurora-glass p-1">
        <ModeTab label="Updates" active={mode === "updates"} onClick={() => setMode("updates")} />
        <ModeTab
          label="People"
          badge={crew.length}
          active={mode === "people"}
          onClick={() => setMode("people")}
        />
      </div>

      {mode === "updates" ? (
        updatesEmpty ? (
          <Empty
            title="Nothing yet"
            body="Plan a trip, or travel with someone — what they add shows up here."
          />
        ) : (
          <>
            {upNext && <Lead trip={upNext} />}
            {reviewCards.length > 0 && <WaitingOnYou cards={reviewCards} />}
            {pulse.length > 0 && <FromYourCrew items={pulse} />}
            {signals.length > 0 && <Signals items={signals} />}
            {people.length > 0 && (
              <button
                onClick={() => setMode("people")}
                className="mt-6 flex w-full items-center gap-3 border-t border-aurora-border pt-5 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-aurora-ink">
                    {standfirst || "People worth knowing"}
                  </span>
                  <span className="block text-[12px] text-drift-muted">Open People</span>
                </span>
                <span className="shrink-0 text-[15px] text-aurora-teal">→</span>
              </button>
            )}
          </>
        )
      ) : (
        <People meId={meId} crew={crew} others={others} />
      )}
    </main>
  )
}

function ModeTab({
  label,
  badge = 0,
  active,
  onClick,
}: {
  label: string
  badge?: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={badge > 0 ? `${label}, ${badge}` : label}
      className={`flex flex-1 items-center justify-center gap-2 rounded-full py-2 text-[14px] transition-colors ${
        active
          ? "bg-aurora-teal font-bold text-aurora-teal-ink"
          : "font-medium text-drift-muted hover:text-aurora-ink"
      }`}
    >
      {label}
      {badge > 0 && !active && (
        <span className="rounded-full bg-aurora-teal px-1.5 py-0.5 text-[11px] font-extrabold text-aurora-teal-ink">
          {badge}
        </span>
      )}
    </button>
  )
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-drift-muted">{children}</p>
  )
}

function BandHeader({ title, kicker }: { title: string; kicker?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="font-drift-display text-[20px] font-bold text-aurora-ink">{title}</h2>
      {kicker && (
        <span className="shrink-0 text-[12px] font-bold uppercase tracking-[0.12em] text-drift-muted">
          {kicker}
        </span>
      )}
    </div>
  )
}

/** UP NEXT — one hero, the trip you are about to take. */
function Lead({ trip }: { trip: ActivityUpNext }) {
  const away =
    trip.daysAway === null
      ? "TRAVELLING NOW"
      : trip.daysAway === 0
        ? "STARTS TODAY"
        : `${trip.daysAway} DAY${trip.daysAway === 1 ? "" : "S"} AWAY`
  return (
    <section className="mt-6">
      <Kicker>Up next</Kicker>
      {/* A stretched link rather than a <Link> wrapping everything: the credit
          is itself a button, and an anchor may not contain one — it would be
          invalid markup and the anchor would swallow its clicks. The overlay is
          pointer-events-none so the whole card still navigates; only the credit
          takes its taps back. */}
      <div className="relative mt-2.5 h-[212px] overflow-hidden rounded-3xl">
        <TripCoverImg cover={trip.cover} sizes="(max-width: 768px) 100vw, 640px" showCredit={false} />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 38%, rgba(0,0,0,0.82))" }}
        />
        <Link
          href={`/app/trips/${trip.id}`}
          aria-label={trip.title}
          className="absolute inset-0"
        />
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
          <span className="w-fit rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-bold tracking-wide text-white">
            {away}
          </span>
          <div>
            <p className="font-drift-display text-[30px] font-bold leading-none text-white">
              {trip.title}
            </p>
            <p className="mt-1.5 text-[13px] text-white/80">
              {[trip.dateText, `${trip.travellers} traveller${trip.travellers === 1 ? "" : "s"}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {trip.reviewCount > 0 && (
              <span className="mt-3 inline-block rounded-full bg-aurora-teal px-3 py-1.5 text-[12.5px] font-bold text-aurora-teal-ink">
                {trip.reviewCount} to review
              </span>
            )}
            {/* A sourced cover MUST carry its credit wherever it is shown.
                Inline, not corner: a floated chip lands on this card's own
                title and chips — the overlap TripTabs documents. */}
            {trip.cover.credit && (
              <div className="pointer-events-auto">
                <CoverCredit
                  text={trip.cover.credit.text}
                  href={trip.cover.credit.href}
                  placement="inline"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/** Several trips as ONE swipe, never one row each. The kicker counts the size
 *  of the job — bookings — not where it lives. */
function WaitingOnYou({ cards }: { cards: ActivityReviewCard[] }) {
  const total = cards.reduce((n, c) => n + c.count, 0)
  return (
    <section className="mt-7 border-t border-aurora-border pt-6">
      <BandHeader
        title="Waiting on you"
        kicker={`${total} BOOKING${total === 1 ? "" : "S"}`}
      />
      <div className={`${RAIL} mt-3`}>
        {cards.map((c) => (
          <Link
            key={c.id}
            href={`/app/trips/${c.id}`}
            className="relative h-[150px] w-[126px] shrink-0 overflow-hidden rounded-2xl"
          >
            <TripCoverImg cover={c.cover} sizes="126px" showCredit={false} />
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(to bottom, transparent 45%, rgba(0,0,0,0.72))" }}
            />
            <span className="absolute right-2 top-2 rounded-full bg-aurora-teal px-1.5 py-0.5 text-[11px] font-extrabold text-aurora-teal-ink">
              {c.count}
            </span>
            <div className="absolute inset-x-0 bottom-0 p-2.5">
              <p className="truncate text-[13px] font-bold text-white">{c.title}</p>
              {c.dateText && <p className="truncate text-[11px] text-white/75">{c.dateText}</p>}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

/** Grouped per trip and actor — "Rashida added 3 stops", not three rows. */
function FromYourCrew({ items }: { items: ActivityPulse[] }) {
  return (
    <section className="mt-7 border-t border-aurora-border pt-6">
      <BandHeader title="From your crew" kicker="LAST 30 DAYS" />
      <ul className="mt-3 space-y-1">
        {items.map((p) => (
          <li key={p.id} className="flex items-baseline gap-2 py-2">
            <span className="min-w-0 flex-1 text-[14px] text-aurora-ink">
              <span className="font-semibold">{p.who ?? p.text}</span>
              {p.who && <span className="text-drift-muted"> {p.text}</span>}
              <span className="text-drift-muted"> · {p.tripTitle}</span>
            </span>
            <time className="shrink-0 text-[11.5px] text-drift-muted">{p.agoText}</time>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Signals({ items }: { items: ActivitySignal[] }) {
  return (
    <section className="mt-7 border-t border-aurora-border pt-6">
      <BandHeader title="Signals" />
      <ul className="mt-3 space-y-1">
        {items.map((s) => (
          <li key={s.id} className="flex items-center gap-3 py-2">
            <Avatar url={s.avatar} name={s.actor} size={32} />
            <span className="min-w-0 flex-1 text-[14px] text-aurora-ink">
              <span className="font-semibold">{s.actor}</span>{" "}
              <span className="text-drift-muted">{s.text}</span>
            </span>
            <time className="shrink-0 text-[11.5px] text-drift-muted">{s.agoText}</time>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Discovery, ordered by how EARNED the connection is. Nobody is invented to
 *  fill the page — an account with no graph gets an honest line. */
function People({
  meId,
  crew,
  others,
}: {
  meId: string
  crew: ActivityPerson[]
  others: ActivityPerson[]
}) {
  if (!crew.length && !others.length) {
    return (
      <Empty
        title="Nobody to show yet"
        body="Take a trip with someone — people you've travelled with show up here first."
      />
    )
  }
  return (
    <>
      {crew.length > 0 && (
        <section className="mt-6">
          <Kicker>You&apos;ve travelled together</Kicker>
          <ul className="mt-3 space-y-1">
            {crew.map((p) => (
              <PersonRow key={p.id} meId={meId} person={p} />
            ))}
          </ul>
        </section>
      )}
      {others.length > 0 && (
        <section className="mt-7 border-t border-aurora-border pt-6">
          <Kicker>New on Drift</Kicker>
          <ul className="mt-3 space-y-1">
            {others.map((p) => (
              <PersonRow key={p.id} meId={meId} person={p} />
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function PersonRow({ meId, person }: { meId: string; person: ActivityPerson }) {
  // Where they go, since that is why you would follow a traveller.
  const sub = person.places.length ? person.places.join(" · ") : person.why
  return (
    <li className="flex items-center gap-3 py-2.5">
      <Link href={`/app/people/${person.id}`} className="shrink-0">
        <Avatar url={person.avatar} name={person.name} size={44} />
      </Link>
      <Link href={`/app/people/${person.id}`} className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-aurora-ink">
          {person.name}
        </span>
        {sub && <span className="block truncate text-[12.5px] text-drift-muted">{sub}</span>}
      </Link>
      <div className="shrink-0">
        <FollowButton meId={meId} targetId={person.id} initiallyFollowing={person.isFollowing} />
      </div>
    </li>
  )
}

function Avatar({ url, name, size }: { url: string | null; name: string; size: number }) {
  if (url) {
    return (
      <span
        className="block overflow-hidden rounded-full"
        style={{ width: size, height: size }}
      >
        <OptimizedImg src={url} alt="" width={size} height={size} className="h-full w-full object-cover" />
      </span>
    )
  }
  return (
    <span
      className="flex items-center justify-center rounded-full bg-aurora-glass font-semibold text-aurora-ink"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  )
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-8">
      <p className="font-drift-display text-[22px] font-bold text-aurora-ink">{title}</p>
      <p className="mt-1.5 text-[14px] text-drift-muted">{body}</p>
    </div>
  )
}
