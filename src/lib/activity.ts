"use client"

import { installActivityScope } from "./activity-scope"
import { createClient } from "@/lib/supabase/client"

// No content or object IDs. This module deliberately does not forward to PostHog.
export type Feature = "app" | "discover" | "inspire" | "backpocket" | "trips" | "chat" | "onboarding" | "profile" | "settings" | "expenses" | "invites"
type Outcome = "observed" | "started" | "succeeded" | "failed"
type ActivityEvent = { event_id: string; event_name: string; feature: Feature; outcome: Outcome; is_foreground: boolean; session_id: string; platform: "web"; environment: "production" | "test"; app_version: string; schema_version: 1; consent_version: string; occurred_at: string; action_id?: string; properties: Record<string, string | number | boolean> }
const PREFIX = "drift.privateActivity.v1."
function queueKey() { let id = sessionStorage.getItem(PREFIX); if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(PREFIX,id) }; return PREFIX+id }
const permitted = new Set(["session_started","foreground_active","feature_viewed","trip_creation_started","create_trip","guide_opened","guide_adopted","backpocket_saved","backpocket_unsaved","add_to_itinerary","trip_activated","chat_message_sent","chat_response_completed","onboarding_step_viewed","onboarding_step_completed","onboarding_completed","invite_link_created","invite_accepted","expense_added","search_started","search_completed"])
let owner: string | null = null, enabled = false, pending: ActivityEvent[] = [], session = "", lastUse = 0, passive = 0, flushing = false, generation = 0
let health = ""
let consentSince = ""
export const activityAvailable = () => process.env.NEXT_PUBLIC_ACTIVITY_ENABLED === "true"
export const activityEnabled = () => enabled
export const activityHealth = () => health
const announce = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event("drift-activity-change")) }
function persist() {
  try { localStorage.setItem(queueKey(), JSON.stringify({ owner, consentSince, pending })); }
  catch { health = "Usage history could not be queued on this device."; announce() }
}
function clear() { pending = []; try { localStorage.removeItem(queueKey()) } catch {} }
export function resetActivity() { for (let i=localStorage.length-1;i>=0;i--) { const k=localStorage.key(i); if(k?.startsWith(PREFIX)) localStorage.removeItem(k) }; generation++; owner = null; enabled = false; consentSince = ""; clear(); session = ""; lastUse = 0; passive = 0; announce() }
async function request(path: string, body?: unknown) {
  const captured = owner, epoch = generation
  const { data: { session: auth } } = await createClient().auth.getSession()
  if (!auth || auth.user.id !== captured || epoch !== generation) throw new Error("Account changed")
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    signal: controller.signal,
    method: body === undefined ? "GET" : "POST",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${auth.access_token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (epoch !== generation) throw new Error("Account changed")
  if (!res.ok) throw new Error(`Activity request failed (${res.status})`)
  const text = await res.text(); return text ? JSON.parse(text) : null
  } finally { clearTimeout(timeout) }
}
export async function connectActivity(userId: string) {
  if (!activityAvailable()) return
  if (owner !== userId) { if (owner) resetActivity(); else { generation++; enabled = false; pending = [] }; owner = userId; session = crypto.randomUUID() }
  const epoch = generation
  try {
    const rows = await request(`user_activity_preferences?select=enabled,changed_at&user_id=eq.${encodeURIComponent(userId)}`)
    if (epoch !== generation) return
    const next = rows?.[0]?.enabled === true
    const since = rows?.[0]?.changed_at ?? ""
    if (!next || (consentSince && since !== consentSince)) clear()
    enabled = next; consentSince = since
    // Sweep abandoned tab queues on the next visit as well as the active queue.
    try {
      for (let i=localStorage.length-1;i>=0;i--) {
        const key=localStorage.key(i); if (!key?.startsWith(PREFIX)) continue
        try {
          const cached=JSON.parse(localStorage.getItem(key) || "null")
          if (!next || cached?.owner!==userId || cached?.consentSince!==since) { localStorage.removeItem(key); continue }
          const retained=cached.pending.filter((e: ActivityEvent)=>Date.parse(e.occurred_at)>Date.now()-7*86400000)
          if (!retained.length) localStorage.removeItem(key)
          else localStorage.setItem(key,JSON.stringify({...cached,pending:retained}))
        } catch { localStorage.removeItem(key) }
      }
    } catch { health="Usage history could not be stored on this device." }
    try { localStorage.setItem("drift.activity.optout", String(!enabled)) } catch {}
    if (enabled && !pending.length) {
      try { const cached = JSON.parse(localStorage.getItem(queueKey()) || "null"); if (cached?.owner === owner && cached?.consentSince === since) pending = cached.pending.filter((e: ActivityEvent) => Date.parse(e.occurred_at) > Date.now() - 7*86400000); } catch { clear() }
    }
    health = ""; announce()
  } catch { enabled = false; health = "Usage sharing is unavailable. No new usage is collected."; announce() }
}
export async function setActivityEnabled(value: boolean) {
  // Stop and erase the local queue BEFORE waiting for withdrawal on the server.
  generation++; enabled = false; try { localStorage.setItem("drift.activity.optout","true") } catch {}; clear(); announce()
  try { await request("rpc/set_activity_enabled", { enabled: value }); if (owner) await connectActivity(owner) }
  catch { health = "Could not save your choice. Sharing is paused on this device; retry to update your account."; announce(); throw new Error(health) }
}
export function recordActivity(name: string, feature: Feature, outcome: Outcome = "observed", properties: ActivityEvent["properties"] = {}, actionId?: string) {
  if (!enabled || !owner || !activityAvailable() || !permitted.has(name)) return
  // Fixed property names; enum values are also validated by the server.
  const allowed = new Set(["entrypoint","item_type","step_index","stop_count","duration_ms","cache_hit","error_code"])
  if (Object.keys(properties).some(k => !allowed.has(k))) { health = "An invalid usage event was blocked."; announce(); return }
  const enumValues: Record<string,string[]> = {entrypoint:["manual","daybreak","chat","import","copy","inspire","discover","backpocket","direct"],item_type:["place","guide"],error_code:["network","timeout","unauthorized","validation","server","cancelled","unknown"]}
  if (Object.entries(properties).some(([k,v]) => enumValues[k] ? !enumValues[k].includes(String(v)) : k === "cache_hit" ? typeof v !== "boolean" : typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 86400000)) { health = "An invalid usage event was blocked."; announce(); return }
  const now = Date.now()
  if (now - lastUse > 1800000) session = crypto.randomUUID()
  lastUse = now
  if (pending.length >= 5000) { health = "Usage queue is full. Some new usage events cannot be stored."; announce(); return }
  pending.push({ event_id: crypto.randomUUID(), event_name: name, feature, outcome, is_foreground: document.visibilityState === "visible" && document.hasFocus(), session_id: session, platform: "web", environment: process.env.NODE_ENV === "production" ? "production" : "test", app_version: "1.0", schema_version: 1, consent_version: consentSince, occurred_at: new Date(now).toISOString(), properties, ...(actionId ? {action_id: actionId} : {}) })
  persist()
  if (pending.length >= 20) void flushActivity()
}
export function foregroundActivity() {
  if (document.visibilityState !== "visible" || !document.hasFocus()) return
  if (enabled && Date.now() - passive >= 300000) { passive = Date.now(); recordActivity("foreground_active", "app") }
}
export async function flushActivity() {
  if (!enabled || !pending.length || flushing) return
  const retained = pending.filter(e => Date.parse(e.occurred_at) >= Date.now()-7*86400000)
  if (retained.length !== pending.length) { health = "Some undelivered usage events expired after seven days."; pending=retained;persist();announce() }
  if(!pending.length) return
  flushing = true; const epoch = generation; const batch = pending.slice(0,50)
  try {
    const ids = await request("rpc/record_activity_batch", { events: batch }) as string[]
    if (epoch === generation) { const ack = new Set(ids); pending = pending.filter(e => !ack.has(e.event_id)); persist(); health = "" }
  } catch { if (epoch === generation) { health = "Usage delivery is delayed; queued events will retry."; announce() } }
  finally { flushing = false }
}
export function recordLegacyActivity(name: string, properties?: Record<string, unknown>) {
  const features: Record<string, Feature> = { create_trip:"trips", add_to_itinerary:"trips", trip_activated:"trips", expense_added:"expenses", invite_accepted:"invites", invite_link_created:"invites" }
  const feature = features[name]; if (!feature) return
  const source = properties?.source
  const entrypoint = typeof source === "string" && ["manual","daybreak","chat","import","copy","inspire","discover","backpocket"].includes(source) ? source : undefined
  recordActivity(name,feature,"succeeded",entrypoint ? {entrypoint} : {})
}

export function activityScope() {
  const epoch = generation
  return (...args: Parameters<typeof recordActivity>) => { if(epoch === generation) recordActivity(...args) }
}

installActivityScope(() => { const epoch = generation; return (name,feature,outcome,props,actionId) => { if(epoch === generation) recordActivity(name,feature as Feature,(outcome ?? "observed") as Outcome,props,actionId) } })

export function activityOptedOut() { try {return typeof window !== "undefined" && localStorage.getItem("drift.activity.optout") === "true"} catch {return true} }
