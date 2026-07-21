"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { askDrift, type ChatCard, type Turn } from "@/lib/drift/chat"
import { applyCreateStep, applyRemoveStep, type CreateStepOp } from "@/lib/drift/quickOp"
import { addDays, dateOnly } from "@/lib/drift/dates"

interface DestinationLite {
  id: string
  date: string
  nights: number
  label: string
}

interface Msg {
  id: string
  role: "user" | "assistant"
  text: string
  cards?: ChatCard[]
}

export default function TripChat({
  tripId,
  tripTitle,
  destinations,
}: {
  tripId: string
  tripTitle: string
  tripStart: string | null
  destinations: DestinationLite[]
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
      const end = addDays(start, dest.nights)
      if (d >= start && d <= end) return dest.id
    }
    return null
  }

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setError(null)
    setInput("")
    setBusy(true)
    setStatus(null)

    const userMsg: Msg = { id: nextId(), role: "user", text }
    const history = messages
    setMessages((m) => [...m, userMsg])

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
        onPayload: (answer) => {
          setMessages((m) => [
            ...m,
            {
              id: nextId(),
              role: "assistant",
              text: answer.assistant_text || streamBuf,
              cards: answer.cards,
            },
          ])
          setStreaming(null)
          setStatus(null)
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

  async function confirmCard(card: ChatCard) {
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
    try {
      const step = await applyCreateStep(tripId, op)
      const label = `Added ${op.title}`
      setUndo({ label, stepId: step.id })
      // Consume the card so it can't be double-added.
      setMessages((m) =>
        m.map((msg) =>
          msg.cards
            ? { ...msg, cards: msg.cards.filter((c) => c !== card) }
            : msg
        )
      )
      router.refresh() // re-fetch the itinerary so the new item shows up
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
    <section className="mt-10 rounded-2xl border border-drift-divider bg-drift-alt-bg">
      <div className="border-b border-drift-divider px-4 py-3">
        <p className="font-drift-display text-lg font-medium">Ask Drift</p>
        <p className="text-sm text-drift-muted">
          Plan {tripTitle} — try “add dinner at Dill on day 2”.
        </p>
      </div>

      <div className="max-h-[420px] space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !streaming && (
          <p className="text-sm text-drift-text-tertiary">
            Ask about the trip, or add a place to a day.
          </p>
        )}

        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "text-right" : ""}>
            <div
              className={
                m.role === "user"
                  ? "inline-block max-w-[85%] rounded-2xl bg-drift-coral px-3 py-2 text-left text-white"
                  : "max-w-[95%] whitespace-pre-wrap text-drift-ink"
              }
            >
              {m.text}
            </div>

            {m.cards && m.cards.length > 0 && (
              <div className="mt-2 space-y-2">
                {m.cards.map((card, i) => (
                  <CardRow
                    key={`${m.id}-c${i}`}
                    card={card}
                    onAdd={() => confirmCard(card)}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        {streaming !== null && (
          <div className="max-w-[95%] whitespace-pre-wrap text-drift-ink">
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
          onClick={send}
          disabled={busy || !input.trim()}
          className="shrink-0 rounded-full bg-drift-coral px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </section>
  )
}

function CardRow({ card, onAdd }: { card: ChatCard; onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-drift-divider bg-white p-3">
      <p className="font-medium">{card.title}</p>
      {card.subtitle && (
        <p className="text-sm text-drift-muted">{card.subtitle}</p>
      )}
      {card.body && <p className="mt-1 text-sm text-drift-muted">{card.body}</p>}
      {card.proposed_op && (
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={onAdd}
            className="rounded-full bg-drift-coral px-3 py-1 text-sm font-medium text-white"
          >
            Add{card.proposed_op.date ? ` · ${card.proposed_op.date}` : ""}
            {card.proposed_op.time ? ` ${card.proposed_op.time}` : ""}
          </button>
        </div>
      )}
    </div>
  )
}

function normalizeType(t: string): CreateStepOp["type"] {
  return t === "activity" || t === "food" || t === "stay" ? t : "spot"
}
