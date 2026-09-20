"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { renderRich } from "@/lib/drift/richText"
import ItineraryCard, { itineraryRowKey, type PlanTools } from "@/components/app/chat/ItineraryCard"
import ChatBanner, { useChatBanner } from "@/components/app/chat/ChatBanner"
import { PlanningModePicker, ReplyChips } from "@/components/app/chat/PlanningControls"
import {
  MUST_SEE_PREFILL,
  WALK_THROUGH,
  chipsForQuestion,
  decide,
  guidedModeRules,
  modeSwitch,
  splitChipsBlock,
  type PlanningMode,
} from "@/lib/drift/chatPlanning"
import {
  askGeneral,
  chooseTripForItinerary,
  flattenTurns,
  generalSystemPrompt,
  planForSingleAdd,
  type ChatItinerary,
  type GeneralTrip,
  type ItineraryPlace,
  type TravelPrefs,
} from "@/lib/drift/generalChat"
import { createGeneralSession, loadSessionMessages, saveMessage } from "@/lib/drift/chatStore"
import type { PlaceCandidate } from "@/lib/drift/chat"
import { applyCreateStep, applyRemoveStep } from "@/lib/drift/quickOp"
import { createTripFromItinerary, ensureDestination } from "@/lib/drift/createTripFromItinerary"
import { dayDateFor, pickDestinationId, shortDate } from "@/lib/drift/itineraryPlacement"
import { AnalyticsEvent, capture } from "@/lib/analytics"
import { activityScope } from "@/lib/activity"
import { checkTripActivated } from "@/lib/drift/activation"

/**
 * A thread about nothing in particular — the web's `general` chat.
 *
 * WHY IT IS A SEPARATE COMPONENT FROM TripChat. TripChat is the Ask-Drift
 * engine: it streams from ask-drift-chat, hydrates place cards through
 * resolve-place, and applies quick-ops against a trip. Every one of those needs
 * a tripId, and there isn't one here. Giving TripChat a nullable trip would put
 * an `if (!tripId)` in front of its streaming, its persistence, its card
 * hydration and its add-to-trip flow — four branches through the most
 * load-bearing component in the app, to serve the case that has none of them.
 *
 * So this is the smaller surface for the smaller contract: one turn in, an
 * answer out, and — when the answer carries a plan — the itinerary drawn as days
 * with a button that saves it. No streaming and no trip tools, because neither
 * exists without a trip to run them against.
 *
 * What it shares with iOS is the part that matters: the same system prompt,
 * seeded with the same trips digest, so the assistant knows the account's trips
 * by name and answers "do I have a Lisbon trip?" instead of recommending
 * another app.
 */
export default function GeneralChat({
  trips,
  homeCity,
  initialSend,
  prompts = [],
  prefs = null,
}: {
  trips: GeneralTrip[]
  homeCity?: string | null
  /** Sent once on mount — the home's prompts and `?ask=` arrive this way. */
  initialSend?: string | null
  /** Offered when the thread is empty; tapping one sends it. */
  prompts?: string[]
  /** The first-run answers, so the assistant never asks for them again. */
  prefs?: TravelPrefs | null
}) {
  const router = useRouter()
  /** Trips this thread created from an Add, until the page's own list has them. */
  const createdTripsRef = useRef<GeneralTrip[]>([])
  /** Destinations this thread had to create, by trip id. */
  const createdDestRef = useRef<Record<string, string>>({})
  /** Which trip each written step went to — a general chat spreads a plan's
   *  places across whichever trips fit, so an Undo has to know which one. */
  const stepTripsRef = useRef<Record<string, string>>({})
  // Adds report through the banner; `added` maps "<msgId>|<row>" → step id
  // (or "trip:<id>" for a place that started a trip) so Undo flips rows back.
  const banner = useChatBanner()
  const [added, setAdded] = useState<Record<string, string>>({})

  async function undoSteps(tripId: string, stepIds: string[]): Promise<string[]> {
    const failed: string[] = []
    for (const id of stepIds) {
      try {
        await applyRemoveStep(tripId, id)
      } catch {
        failed.push(id)
      }
    }
    const gone = new Set(stepIds.filter((id) => !failed.includes(id)))
    setAdded((a) => Object.fromEntries(Object.entries(a).filter(([, s]) => !gone.has(s))))
    return failed
  }

  /**
   * "Added" on a plan row, tapped: take that place back off the trip it joined.
   *
   * Down the SAME path the banner's Undo takes. A place that STARTED a trip is
   * not a step to remove, so `canUndo` leaves those rows inert rather than
   * offering an action that would have to fail.
   */
  async function undoFromPlan(msgId: string, place: ItineraryPlace, dayIndex: number) {
    const key = `${msgId}|${itineraryRowKey(dayIndex, place.name)}`
    const stepId = added[key]
    const tripId = stepId ? stepTripsRef.current[stepId] : null
    if (!stepId || !tripId) return
    const failedIds = await undoSteps(tripId, [stepId])
    if (failedIds.length) {
      banner.fail({ tripId: null, title: `Couldn’t undo ${place.name} — try again` }, () =>
        void undoFromPlan(msgId, place, dayIndex)
      )
      return
    }
    banner.forget([stepId])
  }

  /**
   * Add one plan place — to the trip going there, else the next trip, else a
   * new trip holding just this place. Decided, never asked; the banner names
   * the trip it went to and offers Undo.
   */
  async function addFromPlan(
    msgId: string,
    itin: ChatItinerary,
    place: ItineraryPlace,
    dayIndex: number,
    cand: PlaceCandidate | null
  ): Promise<void> {
    const rowKey = `${msgId}|${itineraryRowKey(dayIndex, place.name)}`
    const again = () => void addFromPlan(msgId, itin, place, dayIndex, cand)
    const fail = () =>
      banner.fail({ tripId: null, title: `Couldn’t add ${place.name} — try again` }, again)
    const pool = [
      ...trips.filter((t) => t.id),
      ...createdTripsRef.current.filter((c) => !trips.some((t) => t.id === c.id)),
    ]
    const today = new Date().toISOString().slice(0, 10)
    const target = chooseTripForItinerary(pool, itin, today)

    if (!target?.id) {
      // The whole plan's span, holding just this place on its own day.
      const single = planForSingleAdd(itin, dayIndex, place)
      const coords = cand
        ? { [place.name]: { lat: cand.latitude ?? null, lng: cand.longitude ?? null, placeId: cand.id || null } }
        : {}
      // A trip creation like "Create this trip", and recorded as one — iOS runs
      // both through the same routine, so both are the "chat" entrypoint.
      const activity = activityScope(), actionId = crypto.randomUUID()
      activity("trip_creation_started","trips","started",{entrypoint:"chat"},actionId)
      const res = await createTripFromItinerary(single, coords)
      if ("error" in res) {
        activity("create_trip","trips","failed",{entrypoint:"chat",error_code:res.code},actionId)
        return fail()
      }
      activity("create_trip","trips","succeeded",{entrypoint:"chat"},actionId)
      createdTripsRef.current.push({
        id: res.tripId,
        title: single.title,
        city: itin.destination,
        country: itin.country,
        startDate: res.startDate,
        endDate: res.endDate,
        destinations: res.destinationId
          ? [
              {
                id: res.destinationId,
                date: res.startDate,
                // Same span createTripFromItinerary writes on the anchor.
                nights: Math.max(1, itin.days.length - 1),
                label: itin.destination,
              },
            ]
          : [],
      })
      capture(AnalyticsEvent.AddToItinerary, { source: "chat", step_type: "spot", has_day: true })
      setAdded((a) => ({ ...a, [rowKey]: `trip:${res.tripId}` }))
      banner.succeed({
        tripId: res.tripId,
        tripTitle: single.title,
        names: [place.name],
        stepIds: [],
        title: `Started ${single.title} with ${place.name}`,
        detail: [itin.destination, itin.country].filter(Boolean).join(", "),
      })
      router.refresh()
      return
    }

    const tripId = target.id
    const date = dayDateFor(dayIndex, {
      dayDate: itin.days[dayIndex]?.date ?? null,
      planStart: itin.startDate,
      tripStart: target.startDate,
      tripEnd: target.endDate ?? null,
    })
    let destinationId: string | null =
      pickDestinationId(target.destinations ?? [], date, itin.destination) ??
      createdDestRef.current[tripId] ??
      null
    if (!destinationId) {
      destinationId = await ensureDestination(tripId, {
        city: itin.destination,
        country: itin.country,
        date: date ?? target.startDate?.slice(0, 10) ?? null,
        lat: cand?.latitude ?? null,
        lng: cand?.longitude ?? null,
      })
      if (!destinationId) return fail()
      createdDestRef.current[tripId] = destinationId
    }
    const type = place.type ?? "spot"
    try {
      const step = await applyCreateStep(
        tripId,
        {
          op: "create_step",
          type,
          title: place.name,
          destination_id: destinationId,
          date,
          time: date ? place.time ?? null : null,
        },
        cand
          ? {
              name: cand.name || place.name,
              lat: cand.latitude ?? null,
              lng: cand.longitude ?? null,
              place_id: !cand.source || cand.source === "google" ? cand.id : null,
            }
          : { name: place.name }
      )
      capture(AnalyticsEvent.AddToItinerary, { source: "chat", step_type: type, has_day: !!date })
      void checkTripActivated(tripId)
      stepTripsRef.current[step.id] = tripId
      setAdded((a) => ({ ...a, [rowKey]: step.id }))
      banner.succeed({
        tripId,
        tripTitle: target.title,
        names: [place.name],
        stepIds: [step.id],
        detail: `${place.name} · Day ${dayIndex + 1}${date ? `, ${shortDate(date)}` : ""}`,
      })
    } catch {
      fail()
    }
  }
  const [messages, setMessages] = useState<
    Array<{
      id: string
      role: "user" | "assistant"
      text: string
      itinerary?: ChatItinerary | null
      /** Tappable answers to a question this turn asked. */
      replyChips?: string[]
    }>
  >([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  // How this chat plans — quick (draft at once, the default) or guided (ask
  // first). claude-complete has no trip, so the interview runs here.
  const [planningMode, setPlanningMode] = useState<PlanningMode>("quick")

  const sessionRef = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentRef = useRef(false)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight })
  }, [messages, busy])

  async function send(textArg?: string) {
    const text = (textArg ?? input).trim()
    if (!text || busy) return
    setInput("")
    setBusy(true)
    setFailed(false)
    // "Walk me through it" / "Just draft it", tapped or typed, switch the mode
    // this turn — and the chat — plans in.
    const mode = modeSwitch(text) ?? planningMode
    if (mode !== planningMode) setPlanningMode(mode)

    const mine = { id: `${Date.now()}-u`, role: "user" as const, text }
    const history = [...messages, mine]
    setMessages(history)

    // The session is opened on the FIRST turn, not on mount: a thread nobody
    // spoke in is a row in the sidebar that says nothing.
    if (!sessionRef.current) sessionRef.current = await createGeneralSession()
    const sid = sessionRef.current
    if (sid) void saveMessage(sid, null, "user", text, null, mode)

    // Quick or guided. There is no trip here, so the interview runs in the
    // browser — ChatPlanning asks exactly what ask-drift-chat asks a trip chat,
    // and instantly, with no model round trip.
    const planning = decide(mode, text, messages, prefs)
    if (planning.kind === "ask") {
      setMessages((m) => [
        ...m,
        { id: `${Date.now()}-a`, role: "assistant", text: planning.text, replyChips: planning.chips },
      ])
      if (sid) void saveMessage(sid, null, "assistant", planning.text)
      setBusy(false)
      return
    }

    // A finished interview drafts from its brief: the request plus the choices
    // made, which is what the model should plan from.
    const turns =
      planning.kind === "draft" ? [...messages, { ...mine, text: planning.brief }] : history
    const { text: raw, itinerary, error } = await askGeneral(
      generalSystemPrompt({ trips, homeCity, prefs }) + guidedModeRules(mode),
      flattenTurns(turns)
    )
    // A guided follow-up question carries its answers as a block.
    const { text: answer, chips } = splitChipsBlock(raw)

    // A turn that is ONLY a plan is still a turn. When the model follows the
    // instruction to keep the intro short it sometimes emits nothing but the
    // block, and treating an empty prose half as a failure threw away the very
    // itinerary the reader asked for. A guided follow-up's chips count the same
    // way — answers with no question above them are still an answer.
    if (!answer && !itinerary && !chips.length) {
      setFailed(true)
      setBusy(false)
      return
    }
    const shown =
      answer ||
      (itinerary
        ? "Here's a day-by-day plan — create the trip to save it, or ask me to change a day."
        : "Which one sounds right?")
    setMessages((m) => [
      ...m,
      { id: `${Date.now()}-a`, role: "assistant", text: shown, itinerary, replyChips: chips },
    ])
    if (sid) void saveMessage(sid, null, "assistant", shown, itinerary)
    setBusy(false)
    if (error) setFailed(false)
  }

  // The opening question, fired once — same one-shot shape as TripChat's
  // initialSend, and guarded by a ref for the same reason.
  useEffect(() => {
    const msg = initialSend?.trim()
    if (msg && !sentRef.current) {
      sentRef.current = true
      void send(msg)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSend])

  // A thread reopened from the sidebar rehydrates; a fresh one starts blank.
  useEffect(() => {
    const sid = sessionRef.current
    if (!sid) return
    let alive = true
    void (async () => {
      const rows = await loadSessionMessages(sid)
      if (!alive || !rows.length) return
      // The chat plans the way it last did, and a question left open gets its
      // answers back: chips are not stored with the message.
      const lastMode = [...rows].reverse().find((r) => r.planningMode)?.planningMode
      if (lastMode) setPlanningMode(lastMode)
      const last = rows.length - 1
      setMessages(
        rows.map((r, i) => ({
          id: `${i}-${r.role}`,
          role: r.role === "assistant" ? "assistant" : "user",
          text: r.text,
          itinerary: r.itinerary ?? null,
          replyChips:
            i === last && r.role === "assistant" ? chipsForQuestion(r.text, prefs) ?? undefined : undefined,
        }))
      )
    })()
    return () => {
      alive = false
    }
  }, [])

  const empty = messages.length === 0 && !busy
  // Tune / Swap belong to the plan being worked on — the latest one. There is
  // no "Add day" here: without one trip to land it on, the plan's own button is
  // what starts a trip.
  const latestPlanId = [...messages].reverse().find((m) => m.itinerary)?.id ?? null
  const planTools: PlanTools = {
    mode: planningMode,
    onTune: (prompt) => void send(prompt),
    onWalkThrough: () => void send(WALK_THROUGH),
    onAddMustSee: () => setInput(MUST_SEE_PREFILL),
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <ChatBanner api={banner} onUndo={undoSteps} className="top-3" />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto w-full max-w-[680px]">
          {empty && (
            <div>
              <h2 className="font-drift-display text-[26px] font-semibold tracking-tight text-aurora-ink">
                Ask Drift anything
              </h2>
              <p className="mt-1 text-[14px] text-aurora-ink3">
                No trip needed. It already knows the ones you have.
              </p>
              <div className="mt-4">
                <PlanningModePicker mode={planningMode} onChange={setPlanningMode} />
              </div>
              {prompts.length > 0 && (
                <ul className="mt-5 space-y-2.5">
                  {prompts.map((q) => (
                    <li key={q}>
                      <button
                        type="button"
                        onClick={() => void send(q)}
                        className="group flex w-full items-center gap-3 rounded-[18px] border border-aurora-border bg-aurora-glass px-4 py-3.5 text-left outline-none transition-colors hover:border-aurora-teal/45 focus-visible:ring-2 focus-visible:ring-aurora-teal/40"
                      >
                        <span className="min-w-0 flex-1 font-drift-display text-[14px] font-light italic leading-snug text-aurora-ink2 transition-colors group-hover:text-aurora-ink">
                          {q}
                        </span>
                        <span
                          aria-hidden
                          className="shrink-0 text-[14px] text-aurora-ink3 transition-transform group-hover:translate-x-0.5"
                        >
                          &rarr;
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={`mb-4 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-[18px] bg-aurora-teal px-4 py-2.5 text-[14.5px] text-aurora-teal-ink"
                    : "max-w-[92%] text-[14.5px] leading-relaxed text-aurora-ink2"
                }
              >
                {m.role === "assistant" ? renderRich(m.text) : m.text}
                {m.itinerary && (
                  <ItineraryCard
                    itin={m.itinerary}
                    isAdded={(key) => !!added[`${m.id}|${key}`]}
                    onAdd={(p, i, c) => addFromPlan(m.id, m.itinerary!, p, i, c)}
                    onUndo={(p, i) => undoFromPlan(m.id, p, i)}
                    /* A place that STARTED a trip is not a step to remove. */
                    canUndo={(key) => !added[`${m.id}|${key}`]?.startsWith("trip:")}
                    /* Tools only under the LATEST plan: an older one is a
                       record, not a second control panel. */
                    planTools={m.id === latestPlanId ? planTools : undefined}
                  />
                )}
                {/* Answer chips on the LATEST turn only — an older question's
                    chips would answer it out of order. */}
                {m.id === messages[messages.length - 1]?.id && m.replyChips && m.replyChips.length > 0 && (
                  <ReplyChips chips={m.replyChips} onPick={(chip) => void send(chip)} />
                )}
              </div>
            </div>
          ))}

          {busy && <p className="text-[14px] text-aurora-ink3">Thinking&hellip;</p>}

          {failed && (
            <p className="mt-2 text-[13px] text-aurora-ink3">
              That one didn&rsquo;t come back.{" "}
              <button
                type="button"
                onClick={() => void send(messages[messages.length - 1]?.text)}
                className="font-semibold text-aurora-teal underline-offset-2 hover:underline"
              >
                Try again
              </button>
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-aurora-border p-4">
        <form
          className="mx-auto flex w-full max-w-[680px] items-center gap-2 rounded-full border border-aurora-border bg-aurora-glass px-4 py-2"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Drift&hellip;"
            aria-label="Ask Drift"
            className="min-w-0 flex-1 bg-transparent text-[14.5px] text-aurora-ink outline-none placeholder:text-aurora-ink3"
          />
          <button
            type="submit"
            disabled={!input.trim() || busy}
            aria-label="Send"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-aurora-teal text-aurora-teal-ink disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.6 11.2l16-7-7 16-2-7-7-2z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}
