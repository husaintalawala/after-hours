import { cache } from "react"
import type { Metadata } from "next"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { isValidInviteToken } from "@/lib/drift/invite"

// The invite landing page — the first thing someone sees of Drift when a friend
// sends them a trip.
//
// PUBLIC ON PURPOSE. It renders for a signed-out stranger, because asking
// someone to create an account before telling them what they are being invited
// to is how invites die. `preview_trip_invite` is granted to `anon` for exactly
// this, and returns only what belongs on this screen — title, dates, cover,
// a couple of cities, who invited you, how many are going. It deliberately does
// NOT return the trip id: that id used to be a bearer credential and publishing
// it here would undo the migration that retired it.
//
// NO "OPEN IN DRIFT" BUTTON, deliberately. A web page cannot detect whether an
// iOS app is installed, so such a button is really a user-agent guess — and the
// person it would guess wrong for is precisely the one this page exists to
// serve: an iPhone user WITHOUT the app, who taps it and gets Safari's "address
// is invalid" dead end. Once Universal Links resolve, iOS intercepts this URL
// before the page ever loads for people who have the app, so the button is
// unnecessary then too. Everyone else finishes right here on the web.

export const dynamic = "force-dynamic"

// database.types.ts predates these functions and regenerating it would drop a
// large unrelated diff into this feature. The shape is asserted once, here.
type PreviewRow = {
  valid: boolean
  reason: string
  trip_title: string | null
  trip_start_date: string | null
  trip_end_date: string | null
  trip_cover_url: string | null
  trip_cities: string[] | null
  inviter_username: string | null
  inviter_display_name: string | null
  inviter_avatar_url: string | null
  member_count: number | null
}

const TEAL = "#37D6C4"
const TEAL_END = "#22B7D4"
const TITLE = "#F4F8F9"
const SUBTITLE = "rgba(198,208,217,0.9)"

const ORIGIN = "https://drift.after-hours.app"

/// The card an invite unfurls with when the trip has no cover of its own: a
/// Drift-branded one, rendered by /api/og/invite with the trip's title on it.
///
/// This used to be /assets/photo/og-image.jpg — the marketing site's photo of a
/// couple at a lagoon. Every trip whose cover the invite lookup could not find
/// unfurled as two strangers on holiday, which read as somebody's personal
/// photo attached to the wrong trip. /api/… is carved out of the marketing
/// rewrite by the middleware matcher, so this URL serves the route handler.
function brandedCard(tripTitle: string): string {
  return `${ORIGIN}/api/og/invite?t=${encodeURIComponent(tripTitle)}`
}

/// The trip's cover, looked up with the service role so a signed-out stranger's
/// unfurl still gets it. `preview_trip_invite` runs as anon and deliberately
/// returns neither the trip id nor the Unsplash fallback cover — but the
/// fallback IS the cover a copied or freshly-planned trip shows everywhere in
/// the app (cover_url stays null until a photo is chosen), so an invite
/// previewing without it showed a trip the recipient would not recognise.
/// Server-only: the key never leaves this process, and the token is validated
/// by the same RPC before this is ever consulted.
type CoverRow = { cover_url: string | null; cover_fallback_url: string | null; updated_at: string | null }
const loadCover = cache(async (token: string): Promise<CoverRow | null> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRole || !isValidInviteToken(token)) return null
  const admin = createAdminClient(url, serviceRole, { auth: { persistSession: false } })
  const inv = await admin.from("trip_invites").select("trip_id").eq("token", token).limit(1)
  const tripId = (inv.data as { trip_id: string }[] | null)?.[0]?.trip_id
  if (!tripId) return null
  const res = await admin
    .from("trips")
    .select("cover_url, cover_fallback_url, updated_at")
    .eq("id", tripId)
    .limit(1)
  return ((res.data as CoverRow[] | null) ?? [])[0] ?? null
})

/// Which image the unfurl shows: the trip's own cover, else the Unsplash cover
/// the app already shows for it, else the branded card. Never a person.
///
/// `v=` is the trip's updated_at: iMessage, Slack and WhatsApp cache a preview
/// image by its URL for days, so a cover changed after the first share would
/// otherwise keep unfurling as the old picture on every device that had seen it.
function inviteImage(cover: CoverRow | null, tripTitle: string): string {
  const own = cover?.cover_url?.trim() || cover?.cover_fallback_url?.trim() || ""
  if (!own) return brandedCard(tripTitle)
  const stamp = cover?.updated_at ? Date.parse(cover.updated_at) : NaN
  if (!Number.isFinite(stamp)) return own
  return `${own}${own.includes("?") ? "&" : "?"}v=${Math.floor(stamp / 1000)}`
}

/// One preview lookup per request, shared by generateMetadata and the page.
/// React.cache dedupes it — Next only dedupes `fetch`, and this is an RPC, so
/// without this the invite is looked up twice on every render.
const loadPreview = cache(async (token: string): Promise<PreviewRow | null> => {
  if (!isValidInviteToken(token)) return null
  const supabase = await createClient()
  const res = await supabase.rpc("preview_trip_invite" as never, { p_token: token } as never)
  return ((res as { data: PreviewRow[] | null })?.data ?? [])[0] ?? null
})

function dateRange(start: string | null, end: string | null): string {
  if (!start) return ""
  const f = (s: string) =>
    new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
  return end ? `${f(start)} – ${f(end)}` : f(start)
}

/// What the link looks like when someone pastes it into iMessage, WhatsApp,
/// Slack or anywhere else that unfurls a URL.
///
/// This page had NO metadata, so it inherited the ROOT layout's — and the root
/// of this domain is the Side Quest marketing site. Every invite ever sent
/// unfurled as "Side Quest | 89 Days Around the World", someone else's travel
/// blog, with no mention of the trip. The recipient's first impression of Drift
/// was a link that looked like it had been sent to the wrong person.
///
/// noindex is deliberate: an invite URL is a capability — anyone holding it can
/// join the trip — so it must never end up in a search result.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params
  const [p, cover] = await Promise.all([loadPreview(token), loadCover(token)])
  const robots = { index: false, follow: false }

  if (!p || !p.valid) {
    return { title: "Drift invite", description: "This invite link is no longer valid.", robots }
  }

  const inviter = p.inviter_display_name || p.inviter_username
  const trip = p.trip_title ?? "a trip"
  const title = inviter ? `${inviter} invited you to ${trip}` : `You're invited to ${trip}`

  const bits = [
    (p.trip_cities ?? []).filter(Boolean).slice(0, 3).join(" · "),
    dateRange(p.trip_start_date, p.trip_end_date),
  ].filter(Boolean)
  const going = p.member_count ?? 0
  if (going > 1) bits.push(`${going} people are going`)
  const description = bits.length
    ? `${bits.join(" · ")}. See the plan and join on Drift.`
    : "See the plan and join on Drift."

  // This trip's cover — never the anon RPC's media rung (a member's own
  // photo) and never the marketing photo. See inviteImage.
  const image = inviteImage(cover, trip)

  return {
    title,
    description,
    robots,
    openGraph: {
      type: "website",
      siteName: "Drift",
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: trip }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  }
}

export default async function JoinPage({
  params,
}: {
  // Next 15 made route params a Promise. Reading them synchronously typechecks
  // and then fails at runtime — the mistake that 404'd every web trip for six
  // days after the Next 16 upgrade.
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  if (!isValidInviteToken(token)) {
    return <Shell><DeadCard reason="not_found" /></Shell>
  }

  const supabase = await createClient()
  // loadPreview is React.cache'd, so generateMetadata's lookup above and this
  // one are a single round trip.
  const [{ data: auth }, preview, cover] = await Promise.all([
    supabase.auth.getUser(),
    loadPreview(token),
    loadCover(token),
  ])
  const signedIn = !!auth?.user
  // The same cover the unfurl showed, so the page and the card agree.
  const heroUrl = cover?.cover_url?.trim() || cover?.cover_fallback_url?.trim() || preview?.trip_cover_url || null

  if (!preview || !preview.valid) {
    return <Shell><DeadCard reason={preview?.reason ?? "not_found"} title={preview?.trip_title} /></Shell>
  }

  const inviter = preview.inviter_display_name || preview.inviter_username
  const cities = (preview.trip_cities ?? []).filter(Boolean).slice(0, 3)
  const going = preview.member_count ?? 0

  return (
    <Shell>
      {heroUrl && (
        // A background-image on a div, not an <img>, and that is the point: a
        // cover URL that 404s (a purged CDN object, a trip whose cover was
        // never resolved) renders as Chrome's broken-image box in an <img> —
        // on the one screen that has to make a stranger want in. As a
        // background it simply falls back to the gradient beneath and nobody
        // can tell anything was missing. Server-rendered, so there is no
        // onError to hook, which rules out the usual fix.
        <div
          className="mb-5 h-40 w-full rounded-2xl bg-cover bg-center"
          style={{
            backgroundColor: "rgba(55,214,196,0.10)",
            backgroundImage: `linear-gradient(180deg, rgba(8,19,29,0) 40%, rgba(8,19,29,0.55) 100%), url(${JSON.stringify(heroUrl)})`,
          }}
        />
      )}

      <p className="text-center font-drift-display text-[40px] leading-none" style={{ color: TEAL }}>
        drift
      </p>

      <p className="mt-6 text-center text-[15px]" style={{ color: SUBTITLE }}>
        {inviter ? `${inviter} invited you to` : "You've been invited to"}
      </p>
      <h1
        className="mt-1 text-center font-drift-display text-[30px] font-semibold leading-tight"
        style={{ color: TITLE }}
      >
        {preview.trip_title ?? "a trip"}
      </h1>

      {(cities.length > 0 || preview.trip_start_date) && (
        <p className="mt-3 text-center text-[14px]" style={{ color: SUBTITLE }}>
          {[cities.join(" · "), dateRange(preview.trip_start_date, preview.trip_end_date)]
            .filter(Boolean)
            .join("  ·  ")}
        </p>
      )}

      {going > 0 && (
        <p className="mt-2 text-center text-[13px]" style={{ color: SUBTITLE }}>
          {going === 1 ? "1 person is going" : `${going} people are going`}
        </p>
      )}

      {signedIn ? (
        // A plain form POST — no client JS on the critical path. The handler
        // redeems and then redirects, and it is a Route Handler because it must
        // clear the invite cookie: cookies are read-only in a Server Component
        // and writing one there throws in Next 15.
        <form action={`/join/${token}/accept`} method="post" className="mt-7">
          <button
            type="submit"
            className="h-[52px] w-full rounded-full text-[17px] font-semibold text-aurora-teal-ink"
            style={{ background: `linear-gradient(135deg, ${TEAL}, ${TEAL_END})` }}
          >
            Join this trip
          </button>
          {/* The /app landing bounces here while the invite cookie is set, so
              without this a person who decides not to join would meet this
              screen every time they opened their own home page. */}
          <a
            href={`/join/${token}/skip`}
            className="mt-3 flex h-[44px] w-full items-center justify-center text-[15px] font-medium"
            style={{ color: SUBTITLE }}
          >
            Not now
          </a>
        </form>
      ) : (
        <a
          href={`/join/${token}/start`}
          className="mt-7 flex h-[52px] w-full items-center justify-center rounded-full text-[17px] font-semibold text-aurora-teal-ink"
          style={{ background: `linear-gradient(135deg, ${TEAL}, ${TEAL_END})` }}
        >
          Sign in to join
        </a>
      )}

      <p className="mt-4 text-center text-[12px]" style={{ color: SUBTITLE }}>
        {signedIn
          ? "You'll be added as a travel buddy and the trip's members will see you."
          : "Takes a few seconds — we'll bring you straight back here."}
      </p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="flex min-h-screen items-center justify-center px-5 py-10 font-drift-body"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 0%, #0B1A25 0%, #08131D 55%, #050B10 100%)",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap"
        rel="stylesheet"
      />
      <div
        className="w-full max-w-md rounded-[28px] border px-6 pb-8 pt-6 backdrop-blur-xl"
        style={{
          background: "rgba(16,34,47,0.92)",
          borderColor: "rgba(55,214,196,0.22)",
          boxShadow: "0 12px 48px rgba(0,0,0,0.55)",
          color: TITLE,
        }}
      >
        {children}
      </div>
    </main>
  )
}

/// Every unusable-token case lands here. The four server-side reasons are one
/// situation to the person holding the link, and the fix is the same for all of
/// them, so they get one clear sentence and a way forward rather than a
/// SQLSTATE.
function DeadCard({ reason, title }: { reason: string; title?: string | null }) {
  const line =
    reason === "expired"
      ? "This invite link has expired."
      : reason === "revoked"
        ? "This invite link was turned off by the organizer."
        : reason === "exhausted"
          ? "This invite link has been used up."
          : "This invite link isn't valid."
  return (
    <div className="py-4 text-center">
      <p className="font-drift-display text-[40px] leading-none" style={{ color: TEAL }}>
        drift
      </p>
      <p className="mt-7 text-[20px] font-semibold" style={{ color: TITLE }}>
        {line}
      </p>
      {title && (
        <p className="mt-2 text-[14px]" style={{ color: SUBTITLE }}>
          It was for {title}.
        </p>
      )}
      <p className="mt-3 text-[14px]" style={{ color: SUBTITLE }}>
        Ask whoever sent it for a fresh one — links expire so trips stay private.
      </p>
      <a
        href="/"
        className="mt-7 flex h-[50px] w-full items-center justify-center rounded-full border text-[16px] font-semibold"
        style={{ borderColor: "rgba(255,255,255,0.18)", color: TITLE }}
      >
        What is Drift?
      </a>
    </div>
  )
}
