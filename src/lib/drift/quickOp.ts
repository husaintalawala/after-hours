// apply-quick-op client — the ONLY step writer (create_step / remove_step).
// Goes through the same-origin proxy /api/drift/quick-op which attaches the
// user's access token and forwards to the edge function (service-role writer,
// owner-or-accepted-buddy authorization).

export interface ResolvedPlace {
  name?: string | null
  lat?: number | null
  lng?: number | null
  place_id?: string | null
}

export interface CreateStepOp {
  op: "create_step"
  type: "spot" | "activity" | "food" | "stay"
  title: string
  destination_ref?: string | null
  destination_id?: string | null
  date?: string | null // "yyyy-MM-dd"
  time?: string | null // "HH:MM"
  duration_minutes?: number | null
  notes?: string | null
}

export interface RemoveStepOp {
  op: "remove_step"
  step_id: string
}

export interface CreatedStep {
  id: string
  trip_id?: string
  parent_step_id?: string | null
  step_type?: string
  title?: string
  location_name?: string | null
  date?: string | null
  scheduled_at?: string | null
  latitude?: number | null
  longitude?: number | null
  place_id?: string | null
}

interface QuickOpResponse {
  ok: boolean
  step?: CreatedStep
  removed_step_id?: string
  error?: string
}

const QUICK_OP_URL = "/api/drift/quick-op"

async function post(body: unknown): Promise<QuickOpResponse> {
  const res = await fetch(QUICK_OP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as QuickOpResponse
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `quick-op failed: ${res.status}`)
  }
  return json
}

export async function applyCreateStep(
  tripId: string,
  op: CreateStepOp,
  resolvedPlace?: ResolvedPlace
): Promise<CreatedStep> {
  const json = await post({
    trip_id: tripId,
    op,
    resolved_place: resolvedPlace,
    risk_acknowledged: false,
  })
  if (!json.step) throw new Error("quick-op returned no step")
  return json.step
}

/**
 * @param riskAcknowledged the server refuses to remove a CONFIRMED booking
 *   (a flight, hotel, or reservation someone actually holds) unless this is
 *   set. The guard exists to stop the assistant deleting a real booking on its
 *   own initiative — it is not meant to stop a person. Pass true only when the
 *   user has been told the step is a confirmed booking and asked to remove it
 *   anyway; never pass it for an assistant-initiated removal.
 */
export async function applyRemoveStep(
  tripId: string,
  stepId: string,
  riskAcknowledged = false
): Promise<void> {
  await post({
    trip_id: tripId,
    op: { op: "remove_step", step_id: stepId } satisfies RemoveStepOp,
    risk_acknowledged: riskAcknowledged,
  })
}

/** The server's refusal, which is a protocol string and must never be shown
 *  to a user. Matches both wordings the validator has used. */
export function isConfirmedBookingRefusal(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e ?? "")
  return /refused to (remove|touch|move) confirmed booking/i.test(m)
}
