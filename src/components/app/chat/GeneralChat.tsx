"use client"

import { useEffect, useRef, useState } from "react"
import { renderRich } from "@/lib/drift/richText"
import ItineraryCard from "@/components/app/chat/ItineraryCard"
import {
  askGeneral,
  flattenTurns,
  generalSystemPrompt,
  type ChatItinerary,
  type GeneralTrip,
} from "@/lib/drift/generalChat"
import { createGeneralSession, loadSessionMessages, saveMessage } from "@/lib/drift/chatStore"

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
}: {
  trips: GeneralTrip[]
  homeCity?: string | null
  /** Sent once on mount — the home's prompts and `?ask=` arrive this way. */
  initialSend?: string | null
  /** Offered when the thread is empty; tapping one sends it. */
  prompts?: string[]
}) {
  const [messages, setMessages] = useState<
    Array<{ id: string; role: "user" | "assistant"; text: string; itinerary?: ChatItinerary | null }>
  >([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

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

    const mine = { id: `${Date.now()}-u`, role: "user" as const, text }
    const history = [...messages, mine]
    setMessages(history)

    // The session is opened on the FIRST turn, not on mount: a thread nobody
    // spoke in is a row in the sidebar that says nothing.
    if (!sessionRef.current) sessionRef.current = await createGeneralSession()
    const sid = sessionRef.current
    if (sid) void saveMessage(sid, null, "user", text)

    const { text: answer, itinerary, error } = await askGeneral(
      generalSystemPrompt({ trips, homeCity }),
      flattenTurns(history)
    )

    // A turn that is ONLY a plan is still a turn. When the model follows the
    // instruction to keep the intro short it sometimes emits nothing but the
    // block, and treating an empty prose half as a failure threw away the very
    // itinerary the reader asked for.
    if (!answer && !itinerary) {
      setFailed(true)
      setBusy(false)
      return
    }
    const shown =
      answer ||
      "Here's a day-by-day plan — create the trip to save it, or ask me to change a day."
    setMessages((m) => [
      ...m,
      { id: `${Date.now()}-a`, role: "assistant", text: shown, itinerary },
    ])
    if (sid) void saveMessage(sid, null, "assistant", shown)
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
      setMessages(
        rows.map((r, i) => ({
          id: `${i}-${r.role}`,
          role: r.role === "assistant" ? "assistant" : "user",
          text: r.text,
        }))
      )
    })()
    return () => {
      alive = false
    }
  }, [])

  const empty = messages.length === 0 && !busy

  return (
    <div className="flex h-full min-h-0 flex-col">
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
                {m.itinerary && <ItineraryCard itin={m.itinerary} />}
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
