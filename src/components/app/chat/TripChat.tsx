"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  askDrift,
  resolvePlace,
  placePhotoUrl,
  type ChatAnswer,
  type ChatCard,
  type PlaceCandidate,
  type Turn,
} from "@/lib/drift/chat"
import { applyCreateStep, applyRemoveStep, type CreateStepOp } from "@/lib/drift/quickOp"
import { addDays, dateOnly } from "@/lib/drift/dates"
import { ensureTripSession, loadSessionMessages, saveMessage } from "@/lib/drift/chatStore"

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
  cards?: HydratedCard[]
  followups?: string[]
  replyChips?: string[]
}

export default function TripChat({
  tripId,
  tripTitle,
  destinations,
  country,
  fill = false,
  prefill,
  onPrefillConsumed,
}: {
  tripId: string
  tripTitle: string
  tripStart: string | null
  destinations: DestinationLite[]
  country?: string | null
  /** Fill the parent's height (desktop docked-panel mode). */
  fill?: boolean
  /** When set, loads into the composer (e.g. "Ask Drift about this" from the inspector). */
  prefill?: string | null
  onPrefillConsumed?: () => void
}) {
  const router = useRouter()
  const [messages, setMessages] = useState<Msg[]>([])
  const [streaming, setStreaming] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [input, setInput] = useState("")

  // Inspector "Ask Drift about this" → load the question into the composer.
  useEffect(() => {
    if (prefill) {
      setInput(prefill)
      onPrefillConsumed?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill])

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
      const sid = await ensureTripSession(tripId)
      if (!alive || !sid) return
      sessionRef.current = sid
      const history = await loadSessionMessages(sid)
      if (!alive || !history.length) return
      setMessages((m) =>
        m.length
          ? m
          : history.map((h) => ({
              id: nextId(),
              role: h.role === "assistant" ? "assistant" : "user",
              text: h.text,
            }))
      )
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId])
  const [busy, setBusy] = useState(false)
  const [undo, setUndo] = useState<{ label: string; stepId: string } | null>(null)
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
    if (!text || busy) return
    setError(null)
    setInput("")
    setBusy(true)
    setStatus(null)

    const history = messages
    setMessages((m) => [...m, { id: nextId(), role: "user", text }])
    if (sessionRef.current) void saveMessage(sessionRef.current, tripId, "user", text)
    const conversation: Turn[] = history.map((m) => ({ role: m.role, text: m.text }))
    let streamBuf = ""
    setStreaming("")

    await askDrift(
      { tripId, message: text, conversation },
      {
        onStatus: (s) => setStatus(s === "searching" ? "Searching…" : "Thinking…"),
        onDelta: (d) => {
          streamBuf += d
          setStreaming(streamBuf)
        },
        onPayload: (answer: ChatAnswer) => {
          const id = nextId()
          const finalText = answer.assistant_text || streamBuf
          setMessages((m) => [
            ...m,
            {
              id,
              role: "assistant",
              text: finalText,
              cards: answer.cards as HydratedCard[],
              followups: answer.followups,
              replyChips: answer.reply_chips,
            },
          ])
          setStreaming(null)
          setStatus(null)
          if (sessionRef.current)
            void saveMessage(sessionRef.current, tripId, "assistant", finalText)
          if (answer.cards?.length) void hydrateCards(id, answer.cards)
        },
        onError: (msg) => {
          setStreaming(null)
          setStatus(null)
          setError(msg)
        },
      }
    )
    setBusy(false)
  }

  async function confirmCard(card: HydratedCard) {
    const p = card.proposed_op
    if (!p) return
    setError(null)
    const op: CreateStepOp = {
      op: "create_step",
      type: normalizeType(p.type),
      title: p.title || card.title,
      destination_ref: p.destination_ref ?? null,
      destination_id: destIdForDate(p.date) ?? null,
      date: p.date ?? null,
      time: p.time ?? null,
      duration_minutes: p.duration_minutes ?? null,
      notes: p.notes ?? null,
    }
    // resolved_place: coords always; place_id only for Google-sourced ids
    // (OSM/Geonames ids are deliberately not sent — iOS parity).
    const cand = card.candidate
    const resolved = cand
      ? {
          name: cand.name || card.title,
          lat: cand.latitude ?? null,
          lng: cand.longitude ?? null,
          place_id:
            !cand.source || cand.source === "google" ? cand.id : null,
        }
      : { name: card.title }
    try {
      const step = await applyCreateStep(tripId, op, resolved)
      setUndo({ label: `Added ${op.title}`, stepId: step.id })
      setMessages((m) =>
        m.map((msg) =>
          msg.cards ? { ...msg, cards: msg.cards.filter((c) => c !== card) } : msg
        )
      )
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that.")
    }
  }

  async function doUndo() {
    if (!undo) return
    const { stepId } = undo
    setUndo(null)
    try {
      await applyRemoveStep(tripId, stepId)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't undo.")
    }
  }

  return (
    <section
      className={`overflow-hidden rounded-[22px] border border-[#EBE7E1] bg-white shadow-[0_24px_60px_-30px_rgba(31,31,36,0.25)] ${
        fill ? "flex h-full flex-col" : ""
      }`}
    >
      <div
        className="flex shrink-0 items-center gap-3 border-b border-[#EBE7E1] px-5 py-4"
        style={{ background: "linear-gradient(180deg,#FFFDFB,#FFF)" }}
      >
        <span
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full text-[17px] text-white shadow-[0_6px_16px_-6px_rgba(224,86,59,0.6)]"
          style={{ background: "linear-gradient(135deg,#E0563B,#BF780A)" }}
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

      <div
        className={`space-y-4 overflow-y-auto px-5 py-5 ${
          fill ? "min-h-0 max-h-[480px] flex-1 lg:max-h-none" : "max-h-[480px]"
        }`}
      >
        {messages.length === 0 && streaming === null && (
          <p className="text-sm text-drift-text-tertiary">
            Ask about the trip, or add a place to a day.
          </p>
        )}

        {messages.map((m) => (
          <div key={m.id}>
            {m.role === "user" ? (
              <div className="text-right">
                <div
                  className="inline-block max-w-[85%] rounded-[18px] rounded-br-[4px] px-4 py-3 text-left text-[14.5px] leading-relaxed text-white shadow-[0_8px_20px_-10px_rgba(224,86,59,0.5)]"
                  style={{ background: "linear-gradient(135deg,#E0563B,#D14A2F)" }}
                >
                  {m.text}
                </div>
              </div>
            ) : (
              <div>
                <div className="max-w-full text-[15px] leading-[1.65] text-drift-ink">
                  {renderRich(m.text)}
                </div>

                {/* Place-card carousel */}
                {m.cards && m.cards.length > 0 && (
                  <div className="-mx-1 mt-3 flex gap-3 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {m.cards.map((card, i) => (
                      <PlaceCardView
                        key={`${m.id}-c${i}`}
                        card={card}
                        onAdd={() => confirmCard(card)}
                      />
                    ))}
                  </div>
                )}

                {/* Reply chips (interview answers) */}
                {m.replyChips && m.replyChips.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {m.replyChips.map((chip) => (
                      <button
                        key={chip}
                        onClick={() => send(chip)}
                        className="rounded-full bg-drift-coral px-3 py-1.5 text-[13px] font-medium text-white"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
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
                          className="rounded-full border border-drift-divider bg-white px-3 py-1.5 text-[13px] text-drift-ink"
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

      {undo && (
        <div className="flex items-center justify-between border-t border-drift-divider bg-white px-4 py-2 text-sm">
          <span className="text-drift-muted">{undo.label}</span>
          <button onClick={doUndo} className="font-medium text-drift-coral">
            Undo
          </button>
        </div>
      )}

      <div
        className="flex shrink-0 items-center gap-2.5 border-t border-[#EBE7E1] px-4 py-3.5"
        style={{ background: "#FFFDFB" }}
      >
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
          placeholder="Plan with Drift…"
          className="h-[46px] min-w-0 flex-1 rounded-full border border-[#EBE7E1] bg-[#FAF8F5] px-5 text-[14.5px] outline-none transition-colors focus:border-drift-coral disabled:opacity-60"
        />
        <button
          onClick={() => send()}
          disabled={busy || !input.trim()}
          aria-label="Send"
          className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-drift-coral text-[17px] text-white shadow-[0_8px_18px_-8px_rgba(224,86,59,0.65)] disabled:opacity-50"
        >
          ↑
        </button>
      </div>
    </section>
  )
}

// One card in the carousel: hero photo, title, why-text, chips, Add/Map pills.
function PlaceCardView({
  card,
  onAdd,
}: {
  card: HydratedCard
  onAdd: () => void
}) {
  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    card.map_query || card.place_query || card.title
  )}`
  const rating = card.candidate?.rating

  return (
    <div className="w-60 shrink-0 overflow-hidden rounded-2xl border border-drift-divider bg-white">
      <div className="relative h-28 bg-drift-alt-bg">
        {card.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.photo} alt="" className="h-full w-full object-cover" />
        ) : (
          <div
            className="h-full w-full"
            style={{ background: "linear-gradient(135deg,#FEEDE8,#F7F7F8)" }}
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
          {card.proposed_op && (
            <button
              onClick={onAdd}
              className="rounded-full bg-drift-coral px-3 py-1.5 text-[12.5px] font-semibold text-white"
            >
              Add
              {card.proposed_op.date ? ` · ${shortDate(card.proposed_op.date)}` : ""}
              {card.proposed_op.time ? ` ${card.proposed_op.time}` : ""}
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

// ---- Rich text renderer for assistant messages ----
// The model emits markdown-ish text: **bold**, and [label](places:?q=...) place
// links (plus occasional http links). Render bold as <strong>, place links as
// coral tappable spans (tap → prefill "Tell me about {label}"), http links as
// real anchors. Paragraphs split on blank lines.

function renderRich(text: string): React.ReactNode {
  const paragraphs = text.split(/\n{2,}/)
  return paragraphs.map((para, pi) => (
    <p key={pi} className={pi > 0 ? "mt-2.5" : undefined}>
      {renderInline(para)}
    </p>
  ))
}

function renderInline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  // Tokenize links first, then bold within the remaining text.
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  const pushText = (t: string) => {
    // Bold segments within plain text.
    const parts = t.split(/\*\*([^*]+)\*\*/g)
    parts.forEach((part, i) => {
      if (!part) return
      if (i % 2 === 1) out.push(<strong key={`b${key++}`}>{part}</strong>)
      else
        part.split("\n").forEach((line, li, arr) => {
          out.push(<span key={`t${key++}`}>{line}</span>)
          if (li < arr.length - 1) out.push(<br key={`br${key++}`} />)
        })
    })
  }
  while ((m = linkRe.exec(text))) {
    pushText(text.slice(last, m.index))
    const [, label, href] = m
    if (href.startsWith("http")) {
      out.push(
        <a
          key={`l${key++}`}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-drift-coral underline decoration-drift-coral/50 underline-offset-2"
        >
          {label}
        </a>
      )
    } else {
      // places:?q=… (or any app link): coral tappable → ask Drift about it.
      out.push(
        <button
          key={`p${key++}`}
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("drift:ask-about", { detail: `Tell me about ${label}` })
            )
          }
          className="font-semibold text-drift-coral [border-bottom:1.5px_dotted_rgba(224,86,59,0.5)]"
        >
          {label}
        </button>
      )
    }
    last = m.index + m[0].length
  }
  pushText(text.slice(last))
  return out
}
