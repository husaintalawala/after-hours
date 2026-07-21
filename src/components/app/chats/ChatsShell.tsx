"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import TripChat, { renderRich } from "@/components/app/chat/TripChat"
import BackLink from "@/components/app/BackLink"
import { loadSessionMessages, type StoredMessage } from "@/lib/drift/chatStore"

// Chats — sidebar-and-thread layout (Husain-approved mockup). Desktop: the
// conversation history lives in a left sidebar under the app nav with cover-
// photo rows; the open thread fills the main pane. Mobile: full-screen thread
// with a slide-in drawer. Trip threads are the live Ask-Drift engine (same
// sessions as the trip studio); place/general threads render their history.

export interface ChatSessionVM {
  id: string
  kind: "trip" | "place" | "general"
  tripId: string | null
  title: string
  subtitle: string | null
  when: string
  photo: string | null
}

export interface TripPickVM {
  id: string
  title: string
  photo: string | null
  start: string | null
  dateRange: string
  destinations: Array<{ id: string; date: string; nights: number; label: string }>
  country: string | null
  stops: number
}

export interface MeVM {
  name: string
  username: string | null
  avatarUrl: string | null
}

type Selection =
  | { mode: "picker" }
  | { mode: "trip"; trip: TripPickVM }
  | { mode: "history"; session: ChatSessionVM }

export default function ChatsShell({
  sessions,
  trips,
  me,
}: {
  sessions: ChatSessionVM[]
  trips: TripPickVM[]
  me: MeVM
}) {
  const firstTripSession = sessions.find((s) => s.kind === "trip" && s.tripId)
  const initial: Selection = firstTripSession
    ? { mode: "trip", trip: trips.find((t) => t.id === firstTripSession.tripId) ?? tripStub(firstTripSession) }
    : trips.length
      ? { mode: "picker" }
      : { mode: "picker" }
  const [sel, setSel] = useState<Selection>(initial)
  const [drawer, setDrawer] = useState(false)

  const openSession = (s: ChatSessionVM) => {
    if (s.kind === "trip" && s.tripId) {
      const trip = trips.find((t) => t.id === s.tripId) ?? tripStub(s)
      setSel({ mode: "trip", trip })
    } else {
      setSel({ mode: "history", session: s })
    }
    setDrawer(false)
  }

  const activeTripId = sel.mode === "trip" ? sel.trip.id : null
  const activeSessionId = sel.mode === "history" ? sel.session.id : null
  const title =
    sel.mode === "trip" ? sel.trip.title : sel.mode === "history" ? sel.session.title : "New chat"
  const titlePhoto =
    sel.mode === "trip"
      ? sel.trip.photo
      : sel.mode === "history"
        ? sel.session.photo
        : null

  // Deep-link-safe exit from the full-screen mobile chat surface (which sits
  // at z-[60], covering the dock). A trip chat backs out to its trip studio;
  // any other chat backs out to Home. Always a real route — never
  // history.back() — so it resolves even on a cold load of /app/chats.
  const backHref = sel.mode === "trip" ? `/app/trips/${sel.trip.id}` : "/app"
  const backLabel = sel.mode === "trip" ? "trip" : "Home"

  const sidebar = (
    <>
      <div className="p-3 pb-1.5">
        <button
          onClick={() => {
            setSel({ mode: "picker" })
            setDrawer(false)
          }}
          className="flex w-full items-center gap-2.5 rounded-[14px] bg-white px-3.5 py-2.5 text-[14px] font-semibold text-drift-coral shadow-[0_1px_2px_rgba(31,31,36,0.06)]"
        >
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full text-[12px] text-white"
            style={{ background: "linear-gradient(135deg,#E0563B,#BF780A)" }}
          >
            ✦
          </span>
          New chat
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {(["trip", "place", "general"] as const).map((kind) => {
          const group = sessions.filter((s) => s.kind === kind)
          if (!group.length) return null
          return (
            <div key={kind}>
              <p className="mx-1.5 mb-1.5 mt-3.5 text-[11px] font-bold tracking-[0.1em] text-drift-text-tertiary">
                {kind === "trip" ? "TRIPS" : kind === "place" ? "PLACES" : "EARLIER"}
              </p>
              {group.map((s) => {
                const active =
                  (s.kind === "trip" && s.tripId === activeTripId) || s.id === activeSessionId
                return (
                  <button
                    key={s.id}
                    onClick={() => openSession(s)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-[7px] text-left text-[13.5px] transition-colors lg:gap-2.5 ${
                      active
                        ? "bg-drift-coral-50 font-semibold text-drift-coral-deep"
                        : "text-drift-ink hover:bg-white/85"
                    }`}
                  >
                    {s.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.photo}
                        alt=""
                        loading="lazy"
                        className="h-[34px] w-[34px] shrink-0 rounded-[10px] object-cover shadow-[inset_0_0_0_1px_rgba(31,31,36,0.08)] max-lg:h-10 max-lg:w-10 max-lg:rounded-xl"
                      />
                    ) : (
                      <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-white text-[14px] shadow-[inset_0_0_0_1px_#EBE7E1] max-lg:h-10 max-lg:w-10 max-lg:rounded-xl">
                        {kind === "trip" ? "🧭" : kind === "place" ? "📍" : "✦"}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                    <span className="shrink-0 text-[11px] font-normal text-drift-text-tertiary">
                      {s.when}
                    </span>
                  </button>
                )
              })}
            </div>
          )
        })}
        {!sessions.length && (
          <p className="px-2 pt-6 text-center text-[13px] text-drift-text-tertiary">
            No conversations yet.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2.5 border-t border-[#EBE7E1] p-3">
        {me.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.avatarUrl} alt="" className="h-[30px] w-[30px] rounded-full object-cover" />
        ) : (
          <span
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full text-[12.5px] font-bold text-white"
            style={{ background: "linear-gradient(135deg,#E0563B,#BF780A)" }}
          >
            {me.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{me.name}</p>
          {me.username && (
            <p className="truncate text-[11.5px] text-drift-text-tertiary">@{me.username}</p>
          )}
        </div>
        {/* The mobile chat surface covers the dock, so the drawer needs its
            own route back into the app. Hidden on desktop (top nav handles it). */}
        <Link
          href="/app"
          aria-label="Back to Home"
          className="ml-auto flex shrink-0 items-center gap-1 rounded-full border border-[#EBE7E1] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-drift-ink lg:hidden"
        >
          ‹ Home
        </Link>
      </div>
    </>
  )

  const thread =
    sel.mode === "trip" ? (
      <div className="flex h-full min-h-0 flex-col">
        {/* Anchor pill */}
        <div className="hidden shrink-0 justify-center px-5 pb-1 pt-3.5 lg:flex">
          <div className="flex items-center gap-2.5 rounded-full border border-[#EBE7E1] bg-white py-1.5 pl-3.5 pr-2 shadow-[0_1px_2px_rgba(31,31,36,0.04)]">
            {sel.trip.photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sel.trip.photo} alt="" className="h-6 w-6 rounded-lg object-cover" />
            )}
            <span className="text-[13px] font-semibold">{sel.trip.title}</span>
            <span className="text-[12px] text-drift-text-tertiary">
              {sel.trip.dateRange}
              {sel.trip.stops ? ` · ${sel.trip.stops} stop${sel.trip.stops === 1 ? "" : "s"}` : ""}
            </span>
            <Link
              href={`/app/trips/${sel.trip.id}`}
              className="rounded-full bg-drift-coral-50 px-3 py-1 text-[12px] font-semibold text-drift-coral"
            >
              Open trip →
            </Link>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <TripChat
            key={sel.trip.id}
            tripId={sel.trip.id}
            tripTitle={sel.trip.title}
            tripStart={sel.trip.start}
            country={sel.trip.country}
            destinations={sel.trip.destinations}
            bare
          />
        </div>
      </div>
    ) : sel.mode === "history" ? (
      <HistoryThread session={sel.session} />
    ) : (
      <Picker trips={trips} onPick={(t) => setSel({ mode: "trip", trip: t })} />
    )

  return (
    <>
      {/* ---------- Desktop ---------- */}
      <div className="fixed inset-x-0 bottom-0 top-[60px] hidden lg:flex">
        <aside className="flex w-[284px] shrink-0 flex-col border-r border-[#EBE7E1] bg-[#F4F1EC]">
          {sidebar}
        </aside>
        <main className="min-w-0 flex-1">{thread}</main>
      </div>

      {/* ---------- Mobile: full-screen thread + drawer ---------- */}
      <div className="fixed inset-0 z-[60] flex flex-col bg-[#FAF8F5] lg:hidden">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[#EBE7E1] bg-[rgba(250,248,245,0.92)] px-3 backdrop-blur-xl">
          <BackLink href={backHref} label={backLabel} />
          <button
            onClick={() => setDrawer(true)}
            aria-label="Conversations"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#EBE7E1] bg-white text-[16px]"
          >
            ☰
          </button>
          <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
            {titlePhoto && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={titlePhoto} alt="" className="h-[28px] w-[28px] rounded-[9px] object-cover" />
            )}
            <p className="truncate font-drift-display text-[16.5px] font-semibold">{title}</p>
          </div>
          <button
            onClick={() => setSel({ mode: "picker" })}
            aria-label="New chat"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[#EBE7E1] bg-white text-[15px]"
          >
            ✎
          </button>
        </div>
        <div className="min-h-0 flex-1">{thread}</div>

        {drawer && (
          <>
            <div className="fixed inset-0 z-[70] bg-[rgba(20,16,12,0.45)]" onClick={() => setDrawer(false)} />
            <div className="fixed bottom-0 left-0 top-0 z-[80] flex w-[82%] flex-col bg-[#F4F1EC] shadow-[24px_0_60px_-30px_rgba(0,0,0,0.5)]">
              {sidebar}
            </div>
          </>
        )}
      </div>
    </>
  )
}

function tripStub(s: ChatSessionVM): TripPickVM {
  return {
    id: s.tripId!,
    title: s.title,
    photo: s.photo,
    start: null,
    dateRange: "",
    destinations: [],
    country: null,
    stops: 0,
  }
}

// Read-only history for place/general sessions (their engines live on iOS).
function HistoryThread({ session }: { session: ChatSessionVM }) {
  const [msgs, setMsgs] = useState<StoredMessage[] | null>(null)
  useEffect(() => {
    let alive = true
    loadSessionMessages(session.id).then((m) => alive && setMsgs(m))
    return () => {
      alive = false
    }
  }, [session.id])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mx-auto w-full max-w-[780px] min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-6">
        {msgs === null && <p className="text-[14px] text-drift-text-tertiary">Loading…</p>}
        {msgs?.length === 0 && (
          <p className="text-[14px] text-drift-text-tertiary">No messages in this chat yet.</p>
        )}
        {msgs?.map((m, i) =>
          m.role === "assistant" ? (
            <div key={i} className="max-w-full text-[15px] leading-[1.65] text-drift-ink">
              {renderRich(m.text)}
            </div>
          ) : (
            <div key={i} className="text-right">
              <div
                className="inline-block max-w-[85%] rounded-[18px] rounded-br-[4px] px-4 py-3 text-left text-[14.5px] leading-relaxed text-white"
                style={{ background: "linear-gradient(135deg,#E0563B,#D14A2F)" }}
              >
                {m.text}
              </div>
            </div>
          )
        )}
      </div>
      <p className="shrink-0 px-5 pb-5 text-center text-[12.5px] text-drift-text-tertiary">
        {session.kind === "place" ? "Place chats" : "General chats"} continue on your iPhone for
        now — trip chats are fully live here.
      </p>
    </div>
  )
}

// New chat → pick the trip it's about.
function Picker({ trips, onPick }: { trips: TripPickVM[]; onPick: (t: TripPickVM) => void }) {
  return (
    <div className="mx-auto w-full max-w-[640px] px-5 py-10">
      <h2 className="font-drift-display text-[26px] font-semibold tracking-tight">
        Start a chat
      </h2>
      <p className="mt-1 text-[14px] text-drift-muted">
        Drift plans best with a trip in mind — pick one.
      </p>
      {trips.length === 0 && (
        <p className="mt-6 text-drift-muted">
          No trips yet —{" "}
          <Link href="/app" className="font-semibold text-drift-coral">
            plan one from Home
          </Link>{" "}
          first.
        </p>
      )}
      <ul className="mt-5 space-y-2.5">
        {trips.map((t) => (
          <li key={t.id}>
            <button
              onClick={() => onPick(t)}
              className="flex w-full items-center gap-3.5 rounded-[18px] border border-[#EBE7E1] bg-white p-3 text-left shadow-[0_1px_2px_rgba(31,31,36,0.04)] transition-all duration-150 hover:-translate-y-0.5 hover:border-drift-coral/35 hover:shadow-[0_14px_34px_-18px_rgba(31,31,36,0.28)]"
            >
              {t.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.photo} alt="" className="h-14 w-14 rounded-2xl object-cover" />
              ) : (
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg"
                  style={{ background: "linear-gradient(135deg,#FEEDE8,#F7F7F8)" }}
                >
                  🧭
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15.5px] font-semibold">{t.title}</p>
                <p className="text-[13px] text-drift-muted">{t.dateRange}</p>
              </div>
              <span className="text-[18px] text-[#C9C4BC]">›</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
