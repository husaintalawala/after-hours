"use client"

import { useEffect, useMemo, useReducer, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { bannerReducer, type BannerAction } from "@/lib/drift/chatBanner"

const DISMISS_MS = 6000

/**
 * The chat's action banner state, and the calls that drive it.
 *
 * Callers report what an action did — working, done, failed — and never write
 * "Added X" into the transcript. See chatBanner.ts for the merge rules.
 */
export function useChatBanner() {
  const [state, dispatch] = useReducer(bannerReducer, null)
  const retry = useRef<(() => void) | null>(null)
  return useMemo(
    () => ({
      state,
      dispatch,
      retry,
      working: (tripId: string | null, tripTitle: string, total: number) =>
        dispatch({ type: "working", tripId, tripTitle, total }),
      progress: (done: number) => dispatch({ type: "progress", done }),
      succeed: (p: Omit<Extract<BannerAction, { type: "success" }>, "type">) =>
        dispatch({ type: "success", ...p }),
      /** `again` re-runs exactly the action that failed. */
      fail: (p: Omit<Extract<BannerAction, { type: "failure" }>, "type">, again: () => void) => {
        retry.current = again
        dispatch({ type: "failure", ...p })
      },
      dismiss: () => dispatch({ type: "dismiss" }),
    }),
    [state]
  )
}

export type ChatBannerApi = ReturnType<typeof useChatBanner>

/**
 * A floating glass banner at the top of the chat panel, over the transcript.
 *
 * Badge (spinner / teal check / amber "!"), title and detail, then View, Undo
 * or Retry, then ×. Success and failure close themselves after six seconds
 * unless hovered or focused; working never does, and shows done/total along
 * its bottom edge. The live region stays mounted so each change is announced.
 */
export default function ChatBanner({
  api,
  onUndo,
  className = "top-3",
}: {
  api: ChatBannerApi
  /** Remove these steps; resolves to the ids that could NOT be removed. */
  onUndo: (tripId: string, stepIds: string[]) => Promise<string[]>
  /** Vertical placement inside the (relative) chat panel. */
  className?: string
}) {
  const router = useRouter()
  const b = api.state
  const [paused, setPaused] = useState(false)
  const [entered, setEntered] = useState(false)
  const visible = !!b

  useEffect(() => {
    if (!visible) {
      setEntered(false)
      setPaused(false)
      return
    }
    const r = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(r)
  }, [visible])

  useEffect(() => {
    if (!b || b.kind === "working" || paused) return
    const seq = b.seq
    const t = setTimeout(() => api.dispatch({ type: "expire", seq }), DISMISS_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b?.seq, b?.kind, paused])

  const canView = !!b?.tripId && b.kind !== "working"
  const view = () => {
    if (!b?.tripId) return
    api.dismiss()
    router.push(`/app/trips/${b.tripId}`)
  }

  async function undo(tripId: string, tripTitle: string, stepIds: string[]) {
    api.dismiss()
    const left = await onUndo(tripId, stepIds)
    if (left.length) {
      api.fail({ tripId, tripTitle, title: "Couldn’t undo that — try again" }, () =>
        void undo(tripId, tripTitle, left)
      )
    }
  }

  return (
    <div
      aria-live="polite"
      role="status"
      className={`pointer-events-none absolute inset-x-3 z-30 ${className}`}
    >
      {b && (
        <div
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          className={`pointer-events-auto relative mx-auto flex max-w-[640px] items-center gap-3 overflow-hidden rounded-[18px] border border-aurora-border bg-aurora-glass/95 py-2.5 pl-3 pr-2 shadow-[0_14px_36px_-14px_rgba(0,0,0,0.6)] backdrop-blur-xl transition-all duration-300 ease-out ${
            entered ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
          }`}
        >
          <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full">
            {b.kind === "working" ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-aurora-teal border-t-transparent motion-reduce:animate-none" />
            ) : b.kind === "success" ? (
              <span className="grid h-8 w-8 place-items-center rounded-full bg-aurora-teal text-aurora-teal-ink">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
              </span>
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-full bg-aurora-warn text-[15px] font-bold text-aurora-midnight">
                !
              </span>
            )}
          </span>

          {canView ? (
            <button
              type="button"
              onClick={view}
              aria-label={`${b.title}. ${b.detail}. View trip`}
              className="min-w-0 flex-1 text-left outline-none focus-visible:underline"
            >
              <BannerText title={b.title} detail={b.detail} />
            </button>
          ) : (
            <div className="min-w-0 flex-1">
              <BannerText title={b.title} detail={b.detail} />
            </div>
          )}

          {b.kind !== "working" && (
            <div className="flex shrink-0 items-center gap-2">
              {b.kind === "success" && b.stepIds.length > 0 && b.tripId && (
                <button
                  type="button"
                  onClick={() => void undo(b.tripId!, b.tripTitle, b.stepIds)}
                  aria-label={`Undo: ${b.title}`}
                  className="px-1 text-[12.5px] font-semibold text-aurora-ink2 hover:text-aurora-ink"
                >
                  Undo
                </button>
              )}
              {b.kind === "failure" && api.retry.current && (
                <button
                  type="button"
                  onClick={() => {
                    const again = api.retry.current
                    api.dismiss()
                    again?.()
                  }}
                  aria-label="Retry"
                  className="rounded-full bg-aurora-teal px-3 py-1 text-[12px] font-bold text-aurora-teal-ink"
                >
                  Retry
                </button>
              )}
              {canView && (
                <button
                  type="button"
                  onClick={view}
                  aria-label="View trip"
                  className="rounded-full bg-aurora-teal px-3 py-1 text-[12px] font-bold text-aurora-teal-ink"
                >
                  View
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={api.dismiss}
            aria-label="Dismiss notification"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[16px] leading-none text-aurora-ink3 hover:bg-aurora-glass2 hover:text-aurora-ink"
          >
            &times;
          </button>

          {b.kind === "working" && b.total > 0 && (
            <span
              aria-hidden
              className="absolute bottom-0 left-0 h-[3px] bg-aurora-teal transition-[width] duration-300"
              style={{ width: `${Math.round((b.done / b.total) * 100)}%` }}
            />
          )}
        </div>
      )}
    </div>
  )
}

function BannerText({ title, detail }: { title: string; detail: string }) {
  return (
    <>
      <span className="block truncate text-[13.5px] font-semibold leading-snug text-aurora-ink">{title}</span>
      {detail && <span className="block truncate text-[12px] leading-snug text-aurora-ink3">{detail}</span>}
    </>
  )
}
