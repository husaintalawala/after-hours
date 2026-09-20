"use client"
import { activityScope } from "@/lib/activity"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  askDrift,
  orderedStreamedDays,
  resolvePlace,
  placePhotoUrl,
  toCardItinerary,
  type AskItineraryDay,
  type ChatAnswer,
  type ChatCard,
  type PlaceCandidate,
  type Turn,
} from "@/lib/drift/chat"
import { applyCreateStep, applyRemoveStep, type CreateStepOp } from "@/lib/drift/quickOp"
import { renderRich } from "@/lib/drift/richText"
import { addDays, dateOnly } from "@/lib/drift/dates"
import { ensureTripSession, loadTripMessages, saveMessage, getCurrentUserId, loadAuthorNames }
from "@/lib/drift/chatStore"
import { AnalyticsEvent, capture } from "@/lib/analytics"
import { checkTripActivated } from "@/lib/drift/activation"
import ItineraryCard, { itineraryRowKey, type PlanTools } from "@/components/app/chat/ItineraryCard"
import ChatBanner, { useChatBanner } from "@/components/app/chat/ChatBanner"
import {
  MUST_SEE_PREFILL,
  WALK_THROUGH,
  chipsForQuestion,
  modeSwitch,
  type PlanningMode,
} from "@/lib/drift/chatPlanning"
import { PlanningModePicker, ReplyChips } from "@/components/app/chat/PlanningControls"
import type { ChatItinerary, ItineraryPlace } from "@/lib/drift/generalChat"
import { dayDateFor, lastDestinationDay, pickDestinationId } from "@/lib/drift/itineraryPlacement"
import { ensureDestination } from "@/lib/drift/createTripFromItinerary"

// Trip-scoped Ask Drift: streaming answers, photo place-card carousel
// (hydrated via resolve-place, like DriftChatView), "You might want to ask"
// followups + reply chips, and draft→confirm→undo adds via apply-quick-op.

interface DestinationLite {
  id: string
  date: string
  nights: number
  label: string
}

interface HydratedCard extends ChatCard {
  candidate?: PlaceCandidate | null
  photo?: string | null
}

interface Msg {
  id: string
  role: "user" | "assistant"
  text: string
  /** Author of a user turn on a shared trip thread; absent = written by me. */
  authorId?: string | null
  authorName?: string | null
  image?: string
  cards?: HydratedCard[]
  followups?: string[]
  replyChips?: string[]
  /** A drafted day-by-day plan (ask-drift-chat `itinerary`). */
  itinerary?: ChatItinerary | null
  /** A plan reloaded from history that is not one of the latest two — drawn
   *  without re-resolving its photos. */
  stalePlan?: boolean
}

export default function TripChat({
  tripId,
  tripTitle,
  tripStart,
  destinations,
  country,
  fill = false,
  bare = false,
  prefill,
  onPrefillConsumed,
  initialSend,
  prompts,
}: {
  tripId: string
  tripTitle: string
  tripStart: string | null
  destinations: DestinationLite[]
  country?: string | null
  /** Fill the parent's height (desktop docked-panel mode). */
  fill?: boolean
  /** Chrome-less thread mode (Chats tab): no card shell/header, centered
   *  column, floating rounded composer. */
  bare?: boolean
  /** When set, loads into the composer (e.g. "Ask Drift about this" from the inspector). */
  prefill?: string | null
  onPrefillConsumed?: () => void
  /** When set, auto-sends this message once on mount (docked-composer handoff). */
  initialSend?: string | null
  /** Questions written for THIS reader, from `homeChatPrompts`. Rendered in the
   *  empty state; tapping one sends it. Empty or absent falls back to the line
   *  this used to show and nothing is lost. */
  prompts?: string[]
}) {
  const router = useRouter()
  // start_chat is a funnel step ("the user engaged Ask Drift"), so it fires on
  // the first message of a mounted thread — not on every turn, which would
  // count messages instead of chat starts.
  const startedRef = useRef(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [myId, setMyId] = useState<string | null>(null)
  const [streaming, setStreaming] = useState<string | null>(null)
  // `stop` is called from an event handler that closed over an older render, so
  // it cannot read `streaming` directly and see the newest delta.
  const streamingRef = useRef<string | null>(null)
  streamingRef.current = streaming
  // The turn's own message once its plan has started arriving — see onDay. Read
  // by `stop`, which has to persist a turn that is already on screen.
  const pendingIdRef = useRef<string | null>(null)
  const messagesRef = useRef<Msg[]>([])
  messagesRef.current = messages
  const [status, setStatus] = useState<string | null>(null)
  const [input, setInput] = useState("")
  // Attached photo (downscaled base64 data URL) for a vision question —
  // ask-drift-chat consumes `image` and answers about the photo.
  const [attached, setAttached] = useState<string | null>(null)

  // Message scroll: always land on the most recent turn, and offer a jump-to-
  // latest chevron once the user scrolls up.
  const scrollRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  const scrollToBottom = (smooth = true) => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" })
  }
  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
  }
  // On load + on new content, stay pinned to the bottom — unless the user has
  // scrolled up to read history (then the chevron handles it).
  useEffect(() => {
    if (atBottom) scrollToBottom(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, streaming])

  // Inspector "Ask Drift about this" → load the question into the composer.
  useEffect(() => {
    if (prefill) {
      setInput(prefill)
      onPrefillConsumed?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill])

  // Docked-composer handoff: fire the opening message once when this thread
  // mounts with an initialSend (after history has had a tick to hydrate).
  const initialSentRef = useRef(false)
  useEffect(() => {
    const msg = initialSend?.trim()
    if (msg && !initialSentRef.current) {
      initialSentRef.current = true
      void send(msg)
      // Tell the caller it is spent. The ref above only guards THIS mount, and
      // ChatsShell remounts this component on every trip switch (`key`), so a
      // question left live in the parent would be asked again the moment the
      // reader picked another thread.
      onPrefillConsumed?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSend])

  useEffect(() => {
    const onAsk = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail
      if (typeof detail === "string") setInput(detail)
    }
    window.addEventListener("drift:ask-about", onAsk)
    return () => window.removeEventListener("drift:ask-about", onAsk)
  }, [])

  // Persistence: find-or-create the trip's chat session and hydrate history
  // (fail-open — a persistence hiccup never blocks the conversation).
  const sessionRef = useRef<string | null>(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      // Resolve the canonical session for the WRITE path (appending new turns);
      // load the DISPLAY history by trip_id so the whole transcript shows even
      // when older turns live under a different/merged session id.
      const sid = await ensureTripSession(tripId)
      if (alive && sid) sessionRef.current = sid
      const [history, me] = await Promise.all([
        loadTripMessages(tripId),
        getCurrentUserId(),
      ])
      if (!alive) return
      if (alive && me) setMyId(me)
      if (!history.length) return
      const names = await loadAuthorNames(
        history.map((h) => h.userId ?? "").filter((id) => id && id !== me),
      )
      if (!alive) return
      // Plans come back from metadata; only the latest two look up photos again.
      const freshPlans = new Set(history.flatMap((h, i) => (h.itinerary ? [i] : [])).slice(-2))
      const hydrated: Msg[] = history.map((h, i) => ({
        id: nextId(),
        role: h.role === "assistant" ? "assistant" : "user",
        text: h.text,
        authorId: h.userId ?? null,
        authorName: h.userId ? names[h.userId] ?? null : null,
        itinerary: h.itinerary ?? null,
        stalePlan: !!h.itinerary && !freshPlans.has(i),
      }))
      // The chat plans the way its reader last chose — their OWN turn, since a
      // shared trip thread carries everyone's. And a planning question left
      // open gets its answers back: chips are not stored with the message.
      const mine = history.filter((h) => h.role !== "assistant" && (!h.userId || h.userId === me))
      const lastMode = mine.reverse().find((h) => h.planningMode)?.planningMode
      if (lastMode) setPlanningMode(lastMode)
      const tail = hydrated[hydrated.length - 1]
      if (tail?.role === "assistant") {
        const chips = chipsForQuestion(tail.text, null)
        if (chips) tail.replyChips = chips
      }
      // Merge history UNDER whatever is already on screen rather than bailing
      // when the list is non-empty. On the mobile dock path TripDockComposer
      // mounts this with a non-null initialSend, which pushes a message
      // synchronously before these awaits resolve — so `m.length` was already 1
      // and the ENTIRE fetched transcript was thrown away.
      setMessages((m) => [...hydrated, ...m])
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId])
  const [busy, setBusy] = useState(false)
  /** The in-flight turn, so the composer's STOP button can cancel it. */
  const abortRef = useRef<AbortController | null>(null)
  /** Whether THIS turn ended because the reader stopped it — see finishActivity. */
  const stoppedRef = useRef(false)
  // Every add reports through the banner (with Undo) — nothing is posted into
  // the transcript. `added` maps "<msgId>|<row>" → the step it wrote, so an
  // Undo from the banner flips exactly those Add buttons back.
  const banner = useChatBanner()
  // How this chat plans — quick (draft at once, the default) or guided (ask
  // first). Chosen in the opener, switched by the chips, and restored from the
  // reader's OWN latest turn when the thread reopens.
  const [planningMode, setPlanningMode] = useState<PlanningMode>("quick")
  const addedRef = useRef<Record<string, string>>({})
  const [added, setAdded] = useState<Record<string, string>>({})
  const markAdded = (key: string, stepId: string) => {
    addedRef.current = { ...addedRef.current, [key]: stepId }
    setAdded(addedRef.current)
  }
  const unmarkSteps = (ids: Set<string>) => {
    addedRef.current = Object.fromEntries(
      Object.entries(addedRef.current).filter(([, s]) => !ids.has(s))
    )
    setAdded(addedRef.current)
  }
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const nextId = () => `m${seq.current++}`

  const destIdForDate = (date: string | null): string | null => {
    const d = dateOnly(date)
    if (!d) return null
    for (const dest of destinations) {
      const start = dateOnly(dest.date)
      if (!start) continue
      if (d >= start && d <= addDays(start, dest.nights)) return dest.id
    }
    return null
  }

  async function hydrateCards(msgId: string, cards: ChatCard[]) {
    // Photo + coords per card via the shared POI cache (max 4, parallel).
    const targets = cards.slice(0, 4)
    await Promise.all(
      targets.map(async (card) => {
        const cand = await resolvePlace(
          card.place_query || card.title,
          card.locality ?? destinations[0]?.label,
          country ?? undefined
        )
        if (!cand) return
        setMessages((m) =>
          m.map((msg) =>
            msg.id === msgId && msg.cards
              ? {
                  ...msg,
                  cards: msg.cards.map((c) =>
                    c === card || c.title === card.title
                      ? { ...c, candidate: cand, photo: placePhotoUrl(cand) }
                      : c
                  ),
                }
              : msg
          )
        )
      })
    )
  }

  async function send(textArg?: string) {
    const text = (textArg ?? input).trim()
    const img = attached
    if ((!text && !img) || busy) return
    if (!startedRef.current) {
      startedRef.current = true
      capture(AnalyticsEvent.StartChat, { has_trip: !!tripId, has_image: !!img })
    }
    const activity = activityScope(), actionId = crypto.randomUUID(), started = performance.now()
    let outcomeRecorded = false
    stoppedRef.current = false
    activity("chat_message_sent","chat","started",{},actionId)
    const finishActivity = (outcome: "succeeded" | "failed", errorCode?: "cancelled") => { if (!outcomeRecorded) { outcomeRecorded=true; activity("chat_response_completed","chat",outcome,{duration_ms:Math.round(performance.now()-started),...(errorCode?{error_code:errorCode}:{})},actionId) } }
    setError(null)
    setInput("")
    setAttached(null)
    setBusy(true)
    setStatus(null)
    // "Walk me through it" / "Just draft it", tapped or typed, switch the mode
    // this turn — and the chat — plans in.
    const mode = modeSwitch(text) ?? planningMode
    if (mode !== planningMode) setPlanningMode(mode)

    const history = messages
    setMessages((m) => [...m, { id: nextId(), role: "user", text, image: img ?? undefined }])
    if (sessionRef.current) void saveMessage(sessionRef.current, tripId, "user", text, null, mode)
    const conversation: Turn[] = history.map((m) => ({ role: m.role, text: m.text }))
    let streamBuf = ""
    setStreaming("")

    // A plan is ~75% of a long turn's wall clock and every day of it is written
    // long before the payload can be parsed, so the days stream in one frame at
    // a time. They land in the turn's OWN message, which the payload then
    // finishes in place: one card, growing, rather than a card that is thrown
    // away and redrawn (which would re-look-up every photo and lose any Add
    // already made on a row).
    const dayBuf: Record<number, AskItineraryDay> = {}
    let pendingId: string | null = null
    // What that message holds, kept beside it: the turn has to be WRITTEN if it
    // ends any way but a payload, and a `day` frame and an `error` frame can
    // arrive in the same chunk — `messagesRef` would not have rendered yet.
    let pendingText = ""
    let pendingPlan: ChatItinerary | null = null
    const planOf = (itin: { title: string; days: AskItineraryDay[] }) =>
      toCardItinerary(itin, {
        tripTitle,
        country: country ?? null,
        fallbackDestination: destinations[0]?.label ?? null,
      })

    const controller = new AbortController()
    abortRef.current = controller

    await askDrift(
      // The mode rides along: in guided the function asks the plan's questions
      // itself, one per turn, before it drafts. A deployment that predates the
      // field ignores it and drafts as it always did.
      { tripId, message: text, conversation, image: img, planningMode: mode },
      {
        onStatus: (s) => setStatus(s === "searching" ? "Searching…" : "Thinking…"),
        onDelta: (d) => {
          streamBuf += d
          setStreaming(streamBuf)
        },
        onDay: (index, day) => {
          dayBuf[index] = day
          const days = orderedStreamedDays(dayBuf)
          if (!days.length) return
          // The plan's own title only arrives with the payload; until then the
          // card wears the same fallback it would have worn anyway.
          const plan = planOf({ title: "", days })
          pendingPlan = plan
          if (pendingId) {
            const id = pendingId
            setMessages((m) => m.map((x) => (x.id === id ? { ...x, itinerary: plan } : x)))
            return
          }
          // The prose is FINISHED by the time the first day lands — the answer
          // schema writes `itinerary` last — so the streaming block has nothing
          // left to say. Commit it as this turn's message and let the plan grow
          // inside it; the payload fills in the rest of the same message.
          const id = nextId()
          pendingId = id
          pendingIdRef.current = id
          pendingText = streamBuf
          setMessages((m) => [...m, { id, role: "assistant", text: streamBuf, itinerary: plan }])
          setStreaming(null)
          setStatus(null)
        },
        onPayload: (answer: ChatAnswer) => {
          finishActivity("succeeded")
          const id = pendingId ?? nextId()
          const finalText = answer.assistant_text || streamBuf
          // The payload stays authoritative: its plan REPLACES the streamed
          // days rather than joining them, so a day the stream missed, or an
          // answer that arrived a different way (the blocking retry), leaves
          // exactly what the server sent on screen.
          const plan = answer.itinerary ? planOf(answer.itinerary) : null
          const turn = {
            id,
            role: "assistant" as const,
            text: finalText,
            cards: answer.cards as HydratedCard[],
            followups: answer.followups,
            replyChips: answer.reply_chips,
            itinerary: plan,
          }
          setMessages((m) =>
            pendingId ? m.map((x) => (x.id === id ? { ...x, ...turn } : x)) : [...m, turn]
          )
          pendingId = null
          pendingIdRef.current = null
          setStreaming(null)
          setStatus(null)
          if (sessionRef.current)
            void saveMessage(sessionRef.current, tripId, "assistant", finalText, plan)
          if (answer.cards?.length) void hydrateCards(id, answer.cards)
        },
        onError: (msg) => {
          finishActivity("failed")
          // Whatever streamed KEEPS its place, the way a stopped turn does: the
          // days already on screen are real, and a row someone has added is
          // theirs to take back. Only this turn's claim on the message ends.
          //
          // Keeping it means WRITING it. Only onPayload saves, so a plan that
          // ended in an error was a card someone could read and add from until
          // the next reload took it away — the same hole `stop` was given a
          // branch for. What the screen shows and what the thread holds are the
          // same thing now, on every way out of a turn.
          if (pendingId && sessionRef.current)
            void saveMessage(sessionRef.current, tripId, "assistant", pendingText, pendingPlan)
          pendingId = null
          pendingIdRef.current = null
          setStreaming(null)
          setStatus(null)
          setError(msg)
        },
      },
      controller.signal
    )
    // A user Stop is not a failure of ours: recorded as cancelled so the chat
    // success rate is not dragged down by answers nobody waited for.
    if (!outcomeRecorded) finishActivity("failed", stoppedRef.current ? "cancelled" : undefined)
    if (abortRef.current === controller) abortRef.current = null
    pendingIdRef.current = null
    setBusy(false)
  }

  /** Stop an answer that is still being written.
   *
   *  Whatever has already streamed is KEPT, as a finished assistant message —
   *  the user asked it to stop, not to throw away what it had said, and a half
   *  answer that vanishes reads as a crash. Nothing is recorded as an error,
   *  and the composer returns to idle so they can type straight away. The
   *  abort reaches the fetch itself, so the request really is cancelled. */
  function stop() {
    const controller = abortRef.current
    if (!controller) return
    abortRef.current = null
    stoppedRef.current = true
    controller.abort()
    const partial = streamingRef.current
    const pendingId = pendingIdRef.current
    if (partial && partial.trim()) {
      const id = nextId()
      setMessages((m) => [...m, { id, role: "assistant", text: partial }])
      if (sessionRef.current) void saveMessage(sessionRef.current, tripId, "assistant", partial)
    } else if (pendingId) {
      // Stopped while the plan was still arriving. The turn is already on
      // screen with the days that made it — keep those too, so a stopped plan
      // is still there after a reload.
      const turn = messagesRef.current.find((m) => m.id === pendingId)
      if (turn && sessionRef.current)
        void saveMessage(sessionRef.current, tripId, "assistant", turn.text, turn.itinerary ?? null)
    }
    pendingIdRef.current = null
    setStreaming(null)
    setStatus(null)
    setError(null)
    setBusy(false)
  }

  async function confirmCard(msgId: string, cardIndex: number, card: HydratedCard) {
    // Every suggestion card is addable. Cards with a proposed_op carry the
    // model's date/time/type; itinerary/route cards arrive without one, so we
    // synthesize a plain create_step from the card itself (spot, no schedule).
    const p = card.proposed_op
    setError(null)
    const op: CreateStepOp = {
      op: "create_step",
      type: normalizeType(p?.type ?? "spot"),
      title: p?.title || card.title,
      destination_ref: p?.destination_ref ?? null,
      destination_id: destIdForDate(p?.date ?? null) ?? null,
      date: p?.date ?? null,
      time: p?.time ?? null,
      duration_minutes: p?.duration_minutes ?? null,
      notes: p?.notes ?? null,
    }
    const resolved = resolvedPlaceFor(card.candidate, card.title)
    try {
      const step = await applyCreateStep(tripId, op, resolved)
      // The other half of add_to_itinerary: confirming a chat suggestion card.
      // Discover's "+" sheet is already instrumented; without this the
      // activation step under-counts every add that came from Ask Drift.
      capture(AnalyticsEvent.AddToItinerary, {
        source: "chat",
        step_type: op.type,
        has_day: !!op.date,
      })
      void checkTripActivated(tripId)
      markAdded(`${msgId}|card:${cardIndex}`, step.id)
      banner.succeed({
        tripId,
        tripTitle,
        names: [op.title],
        stepIds: [step.id],
        detail: op.date ? `${op.title} · ${shortDate(op.date)}` : op.title,
      })
      scheduleRefresh()
    } catch {
      banner.fail({ tripId, tripTitle, title: `Couldn’t add ${op.title} — try again` }, () =>
        void confirmCard(msgId, cardIndex, card)
      )
    }
  }

  // One refresh after a burst of writes, not one per write — "Add all" makes a
  // dozen in a row and each refresh re-runs the trip page's server queries.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleRefresh = () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => router.refresh(), 600)
  }
  /** A destination this thread had to create, reused by every later add. */
  const createdDestRef = useRef<string | null>(null)

  /**
   * Add one itinerary place to THIS trip, now.
   *
   * The day is the plan's own date when it has one, else the day's offset from
   * the trip start; the parent is the destination covering that day. A trip
   * with no destination gets one (iOS addPlaceNow) rather than a question.
   */
  async function writeItineraryPlace(
    itin: ChatItinerary,
    place: ItineraryPlace,
    dayIndex: number,
    cand: PlaceCandidate | null
  ): Promise<{ stepId: string; date: string | null } | null> {
    const day = itin.days[dayIndex]
    const date = dayDateFor(dayIndex, {
      dayDate: day?.date ?? null,
      tripStart,
      tripEnd: lastDestinationDay(destinations),
    })
    let destinationId =
      pickDestinationId(destinations, date, day?.destinationRef) ?? createdDestRef.current
    if (!destinationId) {
      destinationId = await ensureDestination(tripId, {
        city: day?.destinationRef || itin.destination,
        country: country ?? null,
        date: date ?? dateOnly(tripStart),
        lat: cand?.latitude ?? null,
        lng: cand?.longitude ?? null,
      })
      if (!destinationId) return null
      createdDestRef.current = destinationId
    }
    const op: CreateStepOp = {
      op: "create_step",
      type: normalizeType(place.type ?? "spot"),
      title: place.name,
      destination_ref: day?.destinationRef ?? null,
      destination_id: destinationId,
      date,
      time: date ? place.time ?? null : null,
      duration_minutes: null,
      notes: null,
    }
    try {
      const step = await applyCreateStep(tripId, op, resolvedPlaceFor(cand, place.name))
      capture(AnalyticsEvent.AddToItinerary, { source: "chat", step_type: op.type, has_day: !!date })
      void checkTripActivated(tripId)
      scheduleRefresh()
      return { stepId: step.id, date }
    } catch {
      return null
    }
  }

  async function addItineraryPlace(
    msgId: string,
    itin: ChatItinerary,
    place: ItineraryPlace,
    dayIndex: number,
    cand: PlaceCandidate | null
  ) {
    const res = await writeItineraryPlace(itin, place, dayIndex, cand)
    if (!res) {
      banner.fail({ tripId, tripTitle, title: `Couldn’t add ${place.name} — try again` }, () =>
        void addItineraryPlace(msgId, itin, place, dayIndex, cand)
      )
      return
    }
    markAdded(`${msgId}|${itineraryRowKey(dayIndex, place.name)}`, res.stepId)
    banner.succeed({
      tripId,
      tripTitle,
      names: [place.name],
      stepIds: [res.stepId],
      detail: `${place.name} · Day ${dayIndex + 1}${res.date ? `, ${shortDate(res.date)}` : ""}`,
    })
  }

  /** "Add all to <trip>": sequential writes under one working banner, which
   *  becomes one success banner whose Undo removes every step it wrote. */
  async function addAllItinerary(
    msgId: string,
    itin: ChatItinerary,
    resolved: Record<string, PlaceCandidate>
  ) {
    const pending = itin.days
      .flatMap((d, i) => d.places.map((p) => ({ p, i })))
      .filter(({ p, i }) => !addedRef.current[`${msgId}|${itineraryRowKey(i, p.name)}`])
    if (!pending.length) return
    banner.working(tripId, tripTitle, pending.length)
    const landed: Array<{ id: string; name: string; day: number }> = []
    let failed = 0
    for (const [n, { p, i }] of pending.entries()) {
      const res = await writeItineraryPlace(itin, p, i, resolved[p.name] ?? null)
      if (res) {
        markAdded(`${msgId}|${itineraryRowKey(i, p.name)}`, res.stepId)
        landed.push({ id: res.stepId, name: p.name, day: i })
      } else {
        failed++
      }
      banner.progress(n + 1)
    }
    if (!landed.length) {
      banner.fail({ tripId, tripTitle, title: `Couldn’t add the plan to ${tripTitle} — try again` }, () =>
        void addAllItinerary(msgId, itin, resolved)
      )
      return
    }
    // A place taken back from its own card WHILE the run was going is not in
    // the receipt: leaving it in would offer Undo on a step already removed and
    // count a place that is no longer on the trip.
    const live = new Set(Object.values(addedRef.current))
    const kept = landed.filter((l) => live.has(l.id))
    if (!kept.length) return
    const days = new Set(kept.map((k) => k.day))
    banner.succeed({
      tripId,
      tripTitle,
      names: kept.map((k) => k.name),
      stepIds: kept.map((k) => k.id),
      title: `Added to ${tripTitle}`,
      detail:
        `${kept.length} ${kept.length === 1 ? "place" : "places"} across ${days.size} ${days.size === 1 ? "day" : "days"}` +
        (failed ? ` · ${failed} couldn’t be added` : ""),
    })
  }

  /**
   * "Added" on a plan row, tapped: take that place back off the trip.
   *
   * Down the SAME path the banner's Undo takes, so the trip, the banner and the
   * card cannot disagree — and it reports through the banner like every other
   * write here, which also retires the one still offering to undo this step,
   * since that Undo would now fail on a step already gone.
   */
  async function undoItineraryPlace(msgId: string, place: ItineraryPlace, dayIndex: number) {
    const stepId = addedRef.current[`${msgId}|${itineraryRowKey(dayIndex, place.name)}`]
    if (!stepId) return
    const failedIds = await undoSteps(tripId, [stepId])
    if (failedIds.length) {
      banner.fail({ tripId, tripTitle, title: `Couldn’t undo ${place.name} — try again` }, () =>
        void undoItineraryPlace(msgId, place, dayIndex)
      )
      return
    }
    banner.removed({ tripId, tripTitle, name: place.name })
  }

  /** "Add day": that day's places only, as one run with one Undo — Add all
   *  with the plan's other days emptied, so the day keeps its index and date. */
  async function addDayOfItinerary(
    msgId: string,
    itin: ChatItinerary,
    dayIndex: number,
    resolved: Record<string, PlaceCandidate>
  ) {
    const one: ChatItinerary = {
      ...itin,
      days: itin.days.map((d, i) => (i === dayIndex ? d : { ...d, places: [] })),
    }
    await addAllItinerary(msgId, one, resolved)
  }

  /**
   * The latest plan's tools. Tune and Swap re-draft through the chat, Add day
   * lands one day on this trip, and "Walk me through it" turns the chat guided
   * (send() reads the switch from the words) and asks the plan's questions.
   */
  function planTools(m: Msg): PlanTools {
    return {
      mode: planningMode,
      onTune: (prompt) => void send(prompt),
      onWalkThrough: () => void send(WALK_THROUGH),
      onAddMustSee: () => setInput(MUST_SEE_PREFILL),
      onAddDay: (dayIndex, resolved) => addDayOfItinerary(m.id, m.itinerary!, dayIndex, resolved),
    }
  }

  /** Banner Undo: remove the steps, flip their Add buttons back. Resolves to
   *  the ids that could not be removed. */
  async function undoSteps(tid: string, stepIds: string[]): Promise<string[]> {
    const failed: string[] = []
    for (const id of stepIds) {
      try {
        await applyRemoveStep(tid, id)
      } catch {
        failed.push(id)
      }
    }
    unmarkSteps(new Set(stepIds.filter((id) => !failed.includes(id))))
    scheduleRefresh()
    return failed
  }

  // Tune / Swap / Add day belong to the plan being worked on — the latest one.
  const latestPlanId = [...messages].reverse().find((m) => m.itinerary)?.id ?? null

  return (
    <section
      className={
        bare
          ? "relative flex h-full flex-col"
          : `relative overflow-hidden rounded-[22px] border border-aurora-border bg-aurora-glass shadow-aurora-glow ${
              fill ? "flex h-full flex-col" : ""
            }`
      }
    >
      {!bare && (
        <div
          className="flex shrink-0 items-center gap-3 border-b border-aurora-border px-5 py-4"
          style={{ background: "linear-gradient(180deg,#0B1A25,#16222F)" }}
        >
          <span
            className="flex h-[38px] w-[38px] items-center justify-center rounded-full text-[17px] text-white shadow-[0_6px_16px_-6px_rgba(224,86,59,0.6)]"
            style={{ background: "linear-gradient(135deg,#37D6C4,#6B5CFF)" }}
          >
            ✦
          </span>
          <div>
            <p className="font-drift-display text-[19px] font-semibold tracking-tight">
              Ask Drift
            </p>
            <p className="text-[12.5px] text-drift-text-tertiary">
              Your co-planner for {tripTitle}
            </p>
          </div>
        </div>
      )}

      {/* Action banner: just below the header, over the transcript. */}
      <ChatBanner api={banner} onUndo={undoSteps} className={bare ? "top-3" : "top-[80px]"} />

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={
          bare
            ? "mx-auto w-full max-w-[780px] min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-6"
            : `space-y-4 overflow-y-auto px-5 py-5 ${
                fill ? "min-h-0 max-h-[480px] flex-1 lg:max-h-none" : "max-h-[480px]"
              }`
        }
      >
        {messages.length === 0 && streaming === null && (
          /* THE PHONE SAW NO PROMPTS AT ALL. homeChatPrompts has existed and
             been written from the reader's own trip and preferences, but both
             of its render sites are `hidden lg:block` — so on a phone, where
             the only way in is a bare /app/chats, this screen offered one grey
             sentence. These are the same questions the desktop home offers, in
             the place a phone actually reaches.

             `send(q)` directly, not a router.push with `?ask=` — that would put
             an SSR query wave between the tap and the answer for a message this
             component can already deliver. */
          <div className="space-y-3">
            <p className="text-sm text-drift-text-tertiary">
              Ask about the trip, or add a place to a day.
            </p>
            <PlanningModePicker mode={planningMode} onChange={setPlanningMode} />
            {prompts && prompts.length > 0 && (
              <div className="flex flex-col items-start gap-2">
                {prompts.map((q) => (
                  <button
                    key={q}
                    onClick={() => void send(q)}
                    className="rounded-2xl border border-aurora-border bg-aurora-glass px-3.5 py-2.5 text-left text-[13.5px] leading-snug text-drift-ink transition-colors hover:border-aurora-teal/50 hover:bg-aurora-glass2"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id}>
            {m.role === "user" && (!m.authorId || m.authorId === myId) ? (
              <div className="text-right">
                {m.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.image}
                    alt="Attached"
                    className="mb-1.5 inline-block max-h-56 max-w-[85%] rounded-[16px] object-cover shadow-sm"
                  />
                )}
                {m.text && (
                  <div
                    className="inline-block max-w-[85%] rounded-[18px] rounded-br-[4px] px-4 py-3 text-left text-[14.5px] leading-relaxed text-white shadow-[0_8px_20px_-10px_rgba(224,86,59,0.5)]"
                    style={{ background: "linear-gradient(135deg,#37D6C4,#6B5CFF)" }}
                  >
                    {m.text}
                  </div>
                )}
              </div>
            ) : m.role === "user" ? (
              /* Someone else's turn on a shared trip thread. Left-aligned and
                 neutral: the gradient pill above means "you said this", so
                 painting a buddy's question in it is misattribution. */
              <div className="text-left">
                <p className="mb-1 text-[11px] font-semibold text-drift-ink/55">
                  {m.authorName || "Traveler"}
                </p>
                {m.text && (
                  <div className="inline-block max-w-[85%] rounded-[18px] rounded-bl-[4px] border border-drift-ink/10 bg-drift-ink/[0.04] px-4 py-3 text-left text-[14.5px] leading-relaxed text-drift-ink">
                    {m.text}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="max-w-full text-[15px] leading-[1.65] text-drift-ink">
                  {renderRich(m.text)}
                </div>

                {/* Day-by-day plan — the same card the general chat draws, with
                    Add writing to this trip and "Add all" instead of a new trip. */}
                {m.itinerary && (
                  <ItineraryCard
                    itin={m.itinerary}
                    resolvePhotos={!m.stalePlan}
                    addAllTo={tripTitle}
                    onOpenTrip={() => router.push(`/app/trips/${tripId}`)}
                    isAdded={(key) => !!added[`${m.id}|${key}`]}
                    onAdd={(p, i, c) => addItineraryPlace(m.id, m.itinerary!, p, i, c)}
                    onUndo={(p, i) => undoItineraryPlace(m.id, p, i)}
                    onAddAll={(resolved) => addAllItinerary(m.id, m.itinerary!, resolved)}
                    /* Tools only under the LATEST plan: an older one is a
                       record, not a second control panel. */
                    planTools={m.id === latestPlanId ? planTools(m) : undefined}
                  />
                )}

                {/* Place-card carousel */}
                {m.cards && m.cards.length > 0 && (
                  <div className="-mx-1 mt-3 flex gap-3 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {m.cards.map((card, i) => (
                      <PlaceCardView
                        key={`${m.id}-c${i}`}
                        card={card}
                        added={!!added[`${m.id}|card:${i}`]}
                        onAdd={() => confirmCard(m.id, i, card)}
                      />
                    ))}
                  </div>
                )}

                {/* Reply chips (interview answers) — on the LATEST turn only,
                    since an older question's chips would answer it out of
                    order. The way out is not an answer, so it sits under them
                    as a quiet link rather than as one more option. */}
                {m.id === messages[messages.length - 1]?.id && m.replyChips && m.replyChips.length > 0 && (
                  <ReplyChips chips={m.replyChips} onPick={(chip) => void send(chip)} />
                )}

                {/* "You might want to ask" followups */}
                {m.followups && m.followups.length > 0 && (
                  <div className="mt-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-drift-text-tertiary">
                      You might want to ask
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {m.followups.map((f) => (
                        <button
                          key={f}
                          onClick={() => send(f)}
                          className="rounded-full border border-drift-divider bg-aurora-glass2 px-3 py-1.5 text-[13px] text-drift-ink"
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {streaming !== null && (
          <div className="max-w-full text-[15px] leading-[1.65] text-drift-ink">
            {streaming ? (
              renderRich(streaming)
            ) : (
              <span className="text-drift-text-tertiary">{status ?? "Thinking…"}</span>
            )}
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-drift-coral-50 px-3 py-2 text-sm text-drift-coral-deep">
            {error}
          </p>
        )}
      </div>

      {!atBottom && (
        <button
          onClick={() => {
            scrollToBottom(true)
            setAtBottom(true)
          }}
          aria-label="Jump to latest"
          className="absolute bottom-[74px] lg:bottom-[86px] left-1/2 z-20 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-aurora-border bg-aurora-glass text-drift-ink shadow-[0_8px_24px_-8px_rgba(31,31,36,0.35)] transition-transform hover:scale-105"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      )}

      <div
        className={
          bare
            ? // FLUSH ON A PHONE, floating on a laptop.
              //
              // `bare` serves both the phone chat panel and the desktop Chats
              // pane, so this is breakpoint-scoped rather than a second prop.
              // On a phone the tab bar now sits directly beneath this, and a
              // rounded, bordered, glowing pill inset 20px on top of a
              // full-width bar is the same "one control cut in half" the iOS
              // chat tab had. Below lg it becomes the top of that bar; from lg
              // up — where the app has a left rail and no bottom dock — it is
              // exactly the capsule it has always been.
              //
              // The phone variant also drops `mb-5`, which was doing the
              // safe-area job badly: 20px against a 34px home indicator. The
              // inline AppNav's `pb-[env(safe-area-inset-bottom)]` does it
              // properly now.
              "flex shrink-0 flex-col gap-2 border-t border-aurora-border bg-aurora-glass px-3 py-2.5 lg:mx-auto lg:mb-5 lg:w-[calc(100%-40px)] lg:max-w-[780px] lg:rounded-[24px] lg:border lg:px-4 lg:py-3 lg:shadow-aurora-glow"
            : "flex shrink-0 flex-col gap-2 border-t border-aurora-border px-4 py-3.5"
        }
        style={bare ? undefined : { background: "#0B1A25" }}
      >
        {attached && (
          <div className="flex items-center gap-2 self-start rounded-xl bg-drift-alt-bg p-1.5 pr-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={attached} alt="attachment" className="h-11 w-11 rounded-lg object-cover" />
            <span className="text-[12.5px] text-drift-muted">Photo attached</span>
            <button
              onClick={() => setAttached(null)}
              aria-label="Remove photo"
              className="text-drift-text-tertiary hover:text-drift-ink"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex items-center gap-2.5">
          {/* Label-wrap pattern: clicking the label natively opens the OS file
              picker — no programmatic .click() on a display:none input (which
              silently fails in several browsers). Input is sr-only, not hidden. */}
          <label
            aria-label="Attach a photo"
            className={`flex h-[46px] w-[46px] shrink-0 cursor-pointer items-center justify-center rounded-full border border-aurora-border bg-aurora-midnight text-[22px] leading-none text-drift-muted transition-colors hover:border-drift-coral hover:text-drift-coral ${
              busy ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) fileToDataUrl(f).then((url) => url && setAttached(url))
                e.target.value = ""
              }}
            />
            +
          </label>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            disabled={busy}
            placeholder={attached ? "Ask about this photo…" : "Plan with Drift…"}
            className="h-[46px] min-w-0 flex-1 rounded-full border border-aurora-border bg-aurora-midnight px-5 text-[14.5px] outline-none transition-colors focus:border-drift-coral disabled:opacity-60"
          />
          {/* One control, two jobs. While an answer is being written this is
              STOP; the rest of the time it is Send. A separate stop button
              would sit dead and greyed for the whole of every idle moment. */}
          {busy ? (
            <button
              onClick={stop}
              aria-label="Stop generating"
              title="Stop"
              className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-drift-coral text-white shadow-[0_8px_18px_-8px_rgba(224,86,59,0.65)]"
            >
              <span className="block h-3.5 w-3.5 rounded-[3px] bg-white" />
            </button>
          ) : (
            <button
              onClick={() => send()}
              disabled={!input.trim() && !attached}
              aria-label="Send"
              className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-drift-coral text-[17px] text-white shadow-[0_8px_18px_-8px_rgba(224,86,59,0.65)] disabled:opacity-50"
            >
              ↑
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

// Downscale a picked image to a compact JPEG data URL (~max 1280px) so the
// vision payload to ask-drift-chat stays small. Falls back to the raw data URL.
async function fileToDataUrl(file: File): Promise<string | null> {
  try {
    const raw = await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result as string)
      r.onerror = reject
      r.readAsDataURL(file)
    })
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = raw
    })
    const max = 1280
    const scale = Math.min(1, max / Math.max(img.width, img.height))
    const w = Math.round(img.width * scale)
    const h = Math.round(img.height * scale)
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return raw
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL("image/jpeg", 0.82)
  } catch {
    return null
  }
}

// One card in the carousel: hero photo, title, why-text, chips, Add/Map pills.
function PlaceCardView({
  card,
  added,
  onAdd,
}: {
  card: HydratedCard
  /** Flips Add to a non-interactive "✓ Added" (and back if undone). */
  added: boolean
  onAdd: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    card.map_query || card.place_query || card.title
  )}`
  const rating = card.candidate?.rating

  return (
    <div className="w-60 shrink-0 overflow-hidden rounded-2xl border border-drift-divider bg-aurora-glass">
      <div className="relative h-28 bg-drift-alt-bg">
        {card.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.photo} alt="" className="h-full w-full object-cover" />
        ) : (
          <div
            className="h-full w-full"
            style={{ background: "linear-gradient(135deg,#16222F,#0B1A25)" }}
          />
        )}
        {rating != null && rating > 0 && (
          <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
            ★ {rating.toFixed(1)}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="truncate text-[14.5px] font-semibold">{card.title}</p>
        {card.subtitle && (
          <p className="truncate text-[12px] text-drift-muted">{card.subtitle}</p>
        )}
        {card.body && (
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-drift-muted">
            {card.body}
          </p>
        )}
        {card.chips && card.chips.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {card.chips.slice(0, 3).map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-drift-alt-bg px-2 py-0.5 text-[10.5px] text-drift-muted"
              >
                {chip}
              </span>
            ))}
          </div>
        )}
        <div className="mt-2.5 flex items-center gap-2">
          {added ? (
            <span
              aria-label={`${card.title} added`}
              className="rounded-full border border-drift-coral/40 px-3 py-1.5 text-[12.5px] font-semibold text-drift-coral"
            >
              ✓ Added
            </span>
          ) : (
            <button
              onClick={async () => {
                if (busy) return
                setBusy(true)
                try {
                  await onAdd()
                } finally {
                  setBusy(false)
                }
              }}
              disabled={busy}
              aria-label={`Add ${card.title}`}
              className="rounded-full bg-drift-coral px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Adding…" : "Add"}
              {!busy && card.proposed_op?.date ? ` · ${shortDate(card.proposed_op.date)}` : ""}
              {!busy && card.proposed_op?.time ? ` ${card.proposed_op.time}` : ""}
            </button>
          )}
          <a
            href={mapHref}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-drift-divider px-3 py-1.5 text-[12.5px] font-medium text-drift-ink"
          >
            Map
          </a>
        </div>
      </div>
    </div>
  )
}

function shortDate(iso: string): string {
  const [y, mo, d] = iso.split("-").map(Number)
  if (!y || !mo || !d) return iso
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

function normalizeType(t: string): CreateStepOp["type"] {
  return t === "activity" || t === "food" || t === "stay" ? t : "spot"
}

/** resolved_place: coords always; place_id only for Google-sourced ids
 *  (OSM/Geonames ids are deliberately not sent — iOS parity). */
function resolvedPlaceFor(cand: PlaceCandidate | null | undefined, fallbackName: string) {
  return cand
    ? {
        name: cand.name || fallbackName,
        lat: cand.latitude ?? null,
        lng: cand.longitude ?? null,
        place_id: !cand.source || cand.source === "google" ? cand.id : null,
      }
    : { name: fallbackName }
}

// renderRich (assistant markdown + [label](places:…) links → tappable chips) is
// shared with the destination Curious tab — see @/lib/drift/richText.
