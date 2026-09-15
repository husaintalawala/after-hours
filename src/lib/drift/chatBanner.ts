/**
 * The chat's action banner, as state: what it says, and how adds merge.
 *
 * Every chat action — a place added, "Add all", a destination made, a trip
 * started from a plan — reports here instead of posting "Added X" into the
 * transcript. Pure so the merge rules can be pinned by a test; the timer, the
 * buttons and the writes live in ChatBanner.tsx and its callers.
 */

export interface Banner {
  kind: "working" | "success" | "failure"
  /** Bumped by every show and merge, so the dismiss timer restarts and a
   *  stale timer cannot close a newer banner. */
  seq: number
  tripId: string | null
  tripTitle: string
  title: string
  detail: string
  /** Places this banner covers, oldest first. */
  names: string[]
  /** Steps Undo removes — every merged add, not only the latest. */
  stepIds: string[]
  done: number
  total: number
}

export type BannerAction =
  | { type: "working"; tripId: string | null; tripTitle: string; total: number }
  | { type: "progress"; done: number }
  | {
      type: "success"
      tripId: string | null
      tripTitle: string
      names: string[]
      stepIds: string[]
      title?: string
      detail?: string
    }
  | { type: "failure"; tripId: string | null; tripTitle?: string; title: string; detail?: string }
  | { type: "dismiss" }
  | { type: "expire"; seq: number }

/** "Omoide Yokocho, Shinjuku +1" — the latest two names, newest first. */
export function namesDetail(names: string[]): string {
  const rev = [...names].reverse()
  if (rev.length <= 2) return rev.join(", ")
  return `${rev[0]}, ${rev[1]} +${rev.length - 2}`
}

const workingText = (tripTitle: string, done: number, total: number) => ({
  title: `Adding to ${tripTitle}…`,
  detail: `${done} of ${total}`,
})

export function bannerReducer(state: Banner | null, a: BannerAction): Banner | null {
  const seq = (state?.seq ?? 0) + 1
  switch (a.type) {
    case "working":
      return {
        kind: "working",
        seq,
        tripId: a.tripId,
        tripTitle: a.tripTitle,
        ...workingText(a.tripTitle, 0, a.total),
        names: [],
        stepIds: [],
        done: 0,
        total: a.total,
      }
    case "progress":
      if (state?.kind !== "working") return state
      return { ...state, done: a.done, ...workingText(state.tripTitle, a.done, state.total) }
    case "success": {
      // Another add to the SAME trip while its success banner is up joins it.
      if (state?.kind === "success" && state.tripId && state.tripId === a.tripId) {
        const names = [...state.names, ...a.names]
        const stepIds = [...state.stepIds, ...a.stepIds]
        return {
          ...state,
          seq,
          names,
          stepIds,
          title: `${names.length} ${names.length === 1 ? "place" : "places"} added to ${state.tripTitle}`,
          detail: namesDetail(names),
        }
      }
      return {
        kind: "success",
        seq,
        tripId: a.tripId,
        tripTitle: a.tripTitle,
        title: a.title ?? `Added to ${a.tripTitle}`,
        detail: a.detail ?? namesDetail(a.names),
        names: a.names,
        stepIds: a.stepIds,
        done: 0,
        total: 0,
      }
    }
    case "failure":
      return {
        kind: "failure",
        seq,
        tripId: a.tripId,
        tripTitle: a.tripTitle ?? "",
        title: a.title,
        detail: a.detail ?? "",
        names: [],
        stepIds: [],
        done: 0,
        total: 0,
      }
    case "dismiss":
      return null
    case "expire":
      // Only the banner the timer was set for, and never one still working.
      return state && state.seq === a.seq && state.kind !== "working" ? null : state
  }
}
