"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  attemptKey,
  copyErrorMessage,
  dayOf,
  mayHaveLanded,
  mintUuid,
  parseCopyResponse,
  RESERVED_TRIP_IDS,
} from "@/lib/drift/inspire"

// "Make it mine" for a trip somebody else took — the social sibling of the
// Inspire tailor.
//
// THE VOCABULARY IS BORROWED ON PURPOSE. The app does not say "copy" anywhere a
// traveller can read it; it says TAILOR and "Make it mine", and the promise
// under the button — "Stops, nights and places. No bookings, no prices." — is
// the only place the product states what a copy will NOT bring. A second
// affordance that created trips from other people's trips while inventing its
// own words for it would be a second product. So this reuses the sentence, the
// button label, and the error strings the Inspire copy already ships.
//
// WHAT IT DELIBERATELY IS NOT: the tailor. `tailor-trip` reads a curated
// Inspire snapshot and has not been generalised to arbitrary trips, so this
// asks for a start date and nothing else and sends copy-trip NO `plan` — the
// trip lands at its own natural length. A day dial here would have to promise
// an alteration the server cannot yet perform.
//
// AUTHORISATION IS NOT DECIDED HERE. The button is only rendered for a
// non-member, but that is presentation: copy-trip re-selects the source trip
// with the caller's own JWT, so a trip this viewer cannot read is a 404 no
// matter what the client believes. The refusal is deliberately 404 and not 403
// — a 403 would confirm that a private trip exists — which is why the 404 copy
// says "isn't available" rather than "you don't have access".

export default function MakeItMinePanel({
  sourceTripId,
  defaultTitle,
  sourceStartDate,
  onClose,
}: {
  sourceTripId: string
  defaultTitle: string
  /** The source trip's own start day, offered back only if it hasn't passed. */
  sourceStartDate: string | null
  onClose: () => void
}) {
  const router = useRouter()

  const [title, setTitle] = useState(defaultTitle)
  // Local today, not UTC: `min` on a date input is compared against what the
  // picker shows the user, which is their own calendar.
  const today = localToday()
  const suggested = dayOf(sourceStartDate)
  const [startDate, setStartDate] = useState(
    suggested && suggested >= today ? suggested : "",
  )

  const [copying, setCopying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  async function makeItMine() {
    if (copying || !startDate) return
    setCopying(true)
    setError(null)

    const trimmed = title.trim()
    const key = attemptKey(sourceTripId, startDate, trimmed || null, null)
    // The trip id is minted HERE, not by the function. copy-trip inserts AT the
    // supplied id and answers a duplicate on it — this same copy having already
    // landed — with the trip that is already there, as a success. Without it a
    // fetch that timed out after the row committed would invite a retry that
    // wrote a SECOND trip.
    const newTripId = RESERVED_TRIP_IDS.get(key) ?? mintUuid()
    RESERVED_TRIP_IDS.set(key, newTripId)

    try {
      const res = await fetch("/api/drift/copy-trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_trip_id: sourceTripId,
          trip_id: newTripId,
          start_date: startDate,
          ...(trimmed ? { title: trimmed } : {}),
        }),
      })
      const json: unknown = await res.json().catch(() => null)

      if (!res.ok) {
        // Every 4xx is pre-write, so the next attempt is a genuinely fresh copy
        // and must not inherit this id.
        if (!mayHaveLanded(res.status)) RESERVED_TRIP_IDS.delete(key)
        setError(copyErrorMessage(res.status))
        setCopying(false)
        return
      }

      // Per the wire contract every 200 carries a trip id — including the
      // partial state (`ok:false` with a trip_id), which is a 200 precisely so
      // the id survives. The trip exists either way; the trip screen is where
      // the traveller should find out what made it.
      const parsed = parseCopyResponse(json, startDate)
      if (!parsed) {
        RESERVED_TRIP_IDS.delete(key)
        setError(
          "Drift couldn't read the result of the copy. If the trip isn't in your list, refresh in a moment.",
        )
        setCopying(false)
        return
      }
      RESERVED_TRIP_IDS.delete(key)
      // Stays in the copying state through the push — the panel is about to be
      // torn down by the navigation, and re-enabling the button first offers a
      // second click that would write a second trip.
      router.push(`/app/trips/${parsed.id}`)
    } catch {
      // No answer ever arrived, so the row may exist. The id stays reserved so a
      // retry replays this copy rather than writing a second one.
      setError(copyErrorMessage(null))
      setCopying(false)
    }
  }

  return (
    // z-[60], NOT z-50: the app's bottom dock (AppNav) is also z-50 and renders
    // later in the DOM, so at equal z it paints over the panel and swallows the
    // confirm button on a phone.
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="aurora-card w-full max-w-md overflow-hidden rounded-b-none rounded-t-hero pb-[env(safe-area-inset-bottom)] sm:rounded-hero sm:pb-0"
        style={{ background: "rgba(16,34,47,0.98)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Make this trip mine"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            <h2 className="font-drift-display text-[20px] font-bold text-aurora-ink">
              Make it mine
            </h2>
            <p className="mt-0.5 text-[13px] text-aurora-ink2">
              Your own copy, private to you. Pick the day you&rsquo;re leaving.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 rounded-full px-2 py-1 text-[20px] leading-none text-aurora-ink3 transition-colors hover:text-aurora-ink"
          >
            ×
          </button>
        </div>

        <div className="space-y-3 px-5 pb-3 pt-4">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-aurora-ink3">
              Trip name
            </span>
            <input
              type="text"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              className="h-11 w-full rounded-xl border border-aurora-border bg-aurora-midnight2 px-3 text-[15px] text-aurora-ink outline-none focus:border-aurora-teal"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-aurora-ink3">
              Leaving
            </span>
            <input
              type="date"
              value={startDate}
              min={today}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-11 w-full rounded-xl border border-aurora-border bg-aurora-midnight2 px-3 text-[15px] text-aurora-ink outline-none focus:border-aurora-teal [color-scheme:dark]"
            />
          </label>

          {error && (
            <p
              className="rounded-xl border px-3 py-2 text-[13px]"
              style={{ borderColor: "rgba(255,99,88,0.35)", color: "rgba(255,140,130,0.95)" }}
            >
              {error}
            </p>
          )}
        </div>

        <div className="border-t border-aurora-border px-5 py-3">
          <button
            onClick={makeItMine}
            disabled={copying || !startDate}
            className="aurora-cta h-[52px] w-full text-[15.5px] disabled:opacity-50"
          >
            {copying ? "Making it yours…" : "Make it mine"}
          </button>
          {/* The standing promise. It is the only place the app says what a
              copy will NOT bring, and a copy that quietly carried someone
              else's hotels or prices would be the worst bug this feature could
              have — so it travels with every confirm button that makes one. */}
          <p className="mt-2 text-center text-[11.5px] text-aurora-ink3">
            Stops, nights and places. No bookings, no prices.
          </p>
        </div>
      </div>
    </div>
  )
}

/** The viewer's own calendar day as "yyyy-MM-dd". */
function localToday(): string {
  const t = new Date()
  return [
    t.getFullYear(),
    String(t.getMonth() + 1).padStart(2, "0"),
    String(t.getDate()).padStart(2, "0"),
  ].join("-")
}
