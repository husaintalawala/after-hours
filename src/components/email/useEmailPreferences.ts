"use client"

import { useRef, useState } from "react"
import {
  readEmailPrefsResponse,
  saveOutcomeUnknown,
  type EmailPrefsResponse,
  type SubscribedMap,
} from "@/lib/drift/emailPreferences"

/** The browser gives up before the route's own upstream timeout would, plus
 *  margin, so a dropped connection ends as our `network` answer, not a spinner. */
const CLIENT_TIMEOUT_MS = 25_000

export async function postPrefs(url: string, body: Record<string, unknown>): Promise<EmailPrefsResponse> {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    })
    // readEmailPrefsResponse turns "no answer" into code:"network".
    return readEmailPrefsResponse(await r.json().catch(() => null))
  } catch {
    return readEmailPrefsResponse(null)
  }
}

/**
 * The switches' state, with an optimistic save that is undone when the server
 * does not confirm it.
 *
 * One save at a time. Each answer carries the whole saved map, and if two
 * answers arrive out of order the screen would settle on whichever landed last
 * rather than on what the person last chose — so while one is in flight the
 * switches say busy and ignore presses.
 *
 * `next` is only what the screen shows while saving. What is SENT is the
 * caller's `request`, which carries just the switch that changed — see
 * readSubscribedChanges.
 */
export function useEmailPreferences(initial: SubscribedMap | null) {
  const [subscribed, setSubscribed] = useState<SubscribedMap | null>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const inFlight = useRef(false)

  async function change(opts: {
    next: SubscribedMap
    request: () => Promise<EmailPrefsResponse>
    /** Reads what is saved, for a failure that may have landed anyway. */
    reload: () => Promise<EmailPrefsResponse>
    saved: string
    failed: (code: string | null, reloaded: boolean) => string
  }): Promise<EmailPrefsResponse | null> {
    if (inFlight.current || !subscribed) return null
    inFlight.current = true
    const previous = subscribed
    setSubscribed(opts.next)
    setBusy(true)
    setError(null)
    setAnnouncement("Saving…")

    const res = await opts.request()
    if (res.ok) {
      // The server's map when it sends one: it is what will actually be
      // honoured, and it is the truth if anything else changed meanwhile.
      setSubscribed(res.subscribed ?? opts.next)
      setAnnouncement(opts.saved)
    } else {
      // A timeout can end after the write has happened, so putting the switch
      // back could show the opposite of what is saved. Ask instead; only if
      // that fails too does the screen fall back to what it showed before, and
      // the message then says it could not confirm either way. Still inside
      // the in-flight guard, so no new press can race the answer.
      let shown = previous
      let reloaded = false
      if (saveOutcomeUnknown(res.code)) {
        const now = await opts.reload()
        if (now.ok && now.subscribed) {
          shown = now.subscribed
          reloaded = true
        }
      }
      setSubscribed(shown)
      // The alert announces itself; the status region is cleared so the two
      // do not talk over each other.
      setAnnouncement("")
      setError(opts.failed(res.code, reloaded))
    }
    inFlight.current = false
    setBusy(false)
    return res
  }

  return { subscribed, setSubscribed, busy, error, setError, announcement, setAnnouncement, change }
}
