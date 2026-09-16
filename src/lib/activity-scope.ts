// Dependency-free bridge for data helpers also used by server-side/unit-test code.
// A browser activity provider installs the factory; otherwise capture is a no-op.
//
// analytics.ts imports THIS module and never @/lib/activity, because every
// instrumented component imports capture() from analytics.ts — a static edge
// from there to the activity module (which reaches the Supabase browser client)
// would pull that client into every route's first load. Same rule as the
// posthog-js note in analytics.ts.
/** True when the event was taken — queued, or held until consent answers. */
type Capture = (name: string, feature: string, outcome?: string, properties?: Record<string, string | number | boolean>, actionId?: string) => boolean
let factory: () => Capture = () => () => false
let recording: () => boolean = () => false
export function installActivityScope(value: () => Capture, isRecording: () => boolean) { factory = value; recording = isRecording }
export function activityScope(): Capture { return factory() }
/** Whether an event recorded now could be kept. False until the activity module has loaded. */
export const activityRecording = () => recording()

/** The build-time flag, readable without loading the activity module itself. */
export const activityAvailable = () => process.env.NEXT_PUBLIC_ACTIVITY_ENABLED === "true"

// ── Legacy funnel names → private activity ───────────────────────────────────
// A MIRROR of the PostHog capture, never a replacement — see capture(). These
// are the events whose only instrumentation is capture(); anything recorded
// natively (create_trip, trip_activated, chat_*, search_*, onboarding_*,
// guide_*, backpocket_*, trip_creation_started) is deliberately absent, because
// a name mapped here AND recorded natively would be counted twice.
const LEGACY_FEATURES: Record<string, string> = { add_to_itinerary: "trips", expense_added: "expenses", invite_accepted: "invites", invite_link_created: "invites" }
/** Must match the server enum exactly; a value missing here is recorded with no entrypoint. */
const ENTRYPOINTS = ["manual", "daybreak", "chat", "import", "copy", "inspire", "discover", "backpocket", "direct", "search", "map"]
/** add_to_itinerary is allowed to carry the surface it happened on, so "added from Discover" is answerable. */
const ENTRYPOINT_FEATURES: Record<string, string> = { discover: "discover", inspire: "inspire", chat: "chat", backpocket: "backpocket" }

export function recordLegacyActivity(name: string, properties?: Record<string, unknown>) {
  const mapped = LEGACY_FEATURES[name]
  if (!mapped) return
  const source = properties?.source
  const entrypoint = typeof source === "string" && ENTRYPOINTS.includes(source) ? source : undefined
  const feature = name === "add_to_itinerary" && entrypoint ? (ENTRYPOINT_FEATURES[entrypoint] ?? mapped) : mapped
  activityScope()(name, feature, "succeeded", entrypoint ? { entrypoint } : {})
}

// ── PostHog copy ─────────────────────────────────────────────────────────────
// analytics.ts installs this and activity.ts calls it, so neither imports the
// other: activity.ts must not pull posthog-js, and analytics.ts must not pull
// the activity module (see the note at the top of this file). Called only for
// events that entered the activity queue, so nothing is copied while sharing is
// off or before consent answers.
type Mirror = (name: string, properties: Record<string, string | number | boolean>) => void
let mirror: Mirror = () => {}
export function installActivityMirror(value: Mirror) { mirror = value }
export function mirrorActivity(name: string, properties: Record<string, string | number | boolean>) {
  try { mirror(name, properties) } catch { /* analytics must never break the app */ }
}

