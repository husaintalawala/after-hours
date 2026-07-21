"use client"

import { useRef, useState } from "react"
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
}: {
  tripId: string
  tripTitle: string
  tripStart: string | null
  destinations: DestinationLite[]
  country?: string | null
}) {
  const router = useRouter()
  const [messages, setMessages] = useState<Msg[]>([])
  const [streaming, setStreaming] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [input, setInput] = useState("")
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
          setMessages((m) => [
            ...m,
            {
              id,
              role: "assistant",
              text: answer.assistant_text || streamBuf,
              cards: answer.cards as HydratedCard[],
              followups: answer.followups,
              replyChips: answer.reply_chips,
            },
          ])
          setStreaming(null)
          setStatus(null)
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
    <section className="rounded-2xl border border-drift-divider bg-drift-alt-bg">
      <div className="border-b border-drift-divider px-4 py-3">
        <p className="font-drift-display text-lg font-medium">Ask Drift</p>
        <p className="text-sm text-drift-muted">
          Plan {tripTitle} — try &ldquo;add dinner at Dill on day 2&rdquo;.
        </p>
      </div>

      <div className="max-h-[480px] space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && streaming === null && (
          <p className="text-sm text-drift-text-tertiary">
            Ask about the trip, or add a place to a day.
          </p>
        )}

        {messages.map((m) => (
          <div key={m.id}>
            {m.role === "user" ? (
              <div className="text-right">
                <div className="inline-block max-w-[85%] rounded-2xl bg-drift-coral px-3.5 py-2 text-left text-white">
                  {m.text}
                </div>
              </div>
            ) : (
              <div>
                <div className="max-w-[95%] whitespace-pre-wrap text-[15px] leading-relaxed text-drift-ink">
                  {m.text}
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
          <div className="max-w-[95%] whitespace-pre-wrap text-[15px] leading-relaxed text-drift-ink">
            {streaming || (
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

      <div className="flex items-center gap-2 border-t border-drift-divider p-3">
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
          placeholder="Message Drift…"
          className="min-w-0 flex-1 rounded-full border border-drift-divider bg-white px-4 py-2 outline-none focus:border-drift-coral disabled:opacity-60"
        />
        <button
          onClick={() => send()}
          disabled={busy || !input.trim()}
          className="shrink-0 rounded-full bg-drift-coral px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          Send
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
