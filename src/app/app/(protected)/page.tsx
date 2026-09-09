import { Suspense } from "react"
import HomeSkeleton from "./loading"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { INVITE_COOKIE, isValidInviteToken } from "@/lib/drift/invite"
import { GUIDE_COOKIE, isGuideSlug, claimPendingGuide } from "@/lib/drift/inspire"
import { DAYBREAK_COOKIE } from "@/lib/drift/daybreak"
import HomeShell from "@/components/app/home/HomeShell"
import { buildHomeData } from "@/lib/drift/homeData"
import { buildInspirePromo } from "@/lib/drift/inspirePromo"

// Logged-in home — server data loader for HomeShell (full-viewport globe +
// desktop trip rail / mobile sheet). See HomeShell for the layout.

export default async function TripsHome() {
  // Invite pickup. Someone who opened an invite link before they had an account
  // gets sent through login, and login always lands here — the magic-link email
  // template hardcodes next=/app, and /app/login builds redirectTo with NO query
  // params on purpose (Supabase matches redirect URLs against an allow-list and
  // a ?next= variant can silently fall back to the Site URL). So the token
  // cannot ride the redirect; it waits in a cookie and is claimed here, which
  // works identically for magic link and OAuth.
  //
  // Reading a cookie in a Server Component is fine; only WRITING throws. The
  // clearing therefore happens in the /join route handlers, not here.
  const jar = await cookies()
  const pendingInvite = jar.get(INVITE_COOKIE)?.value
  if (isValidInviteToken(pendingInvite)) redirect(`/join/${pendingInvite}`)

  // Guide pickup, same mechanism and for the same reason. Somebody read a
  // public /i/<slug> guide, pressed "Make this trip mine", and was sent through
  // login — which always lands here. /i/<slug>/start is where the cookie is both
  // written and cleared, so bouncing back through it hands them the trip they
  // were reading and leaves nothing behind to bounce off next time.
  const pendingGuide = jar.get(GUIDE_COOKIE)?.value
  if (isGuideSlug(pendingGuide)) redirect(`/i/${pendingGuide}/start`)

  const supabase = await createClient()
  // Middleware already verified this request's user; cookie read is enough here.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return null

  // CROSS-DEVICE guide pickup. The cookie above covers the common case, but it
  // is httpOnly and per-browser: read the guide on a phone, open the magic link
  // on a laptop, and the laptop has nothing. So the note is ALSO kept server
  // side keyed by email — the one thing both devices share — and claimed here,
  // after the session exists and the address is known to be theirs.
  //
  // Deliberately after the cookie check: same-device costs no query at all.
  if (user.email) {
    const claimed = await claimPendingGuide(user.email)
    if (claimed) redirect(`/i/${claimed}/start`)
  }

  // The assembly is three serial waves of queries, and until this file was
  // split they all had to finish before the browser got ANYTHING — the skeleton
  // in loading.tsx only covers a soft navigation, not a hard load. Behind a
  // boundary, the document streams straight away and the same skeleton holds
  // the place until the data lands.
  // Daybreak's dismissal marker, read here where the cookie jar is already
  // open. It is passed down rather than read again inside the boundary because
  // the decision it feeds is made after the trips are known — see Home.
  const seenDaybreak = Boolean(jar.get(DAYBREAK_COOKIE)?.value)

  return (
    <Suspense fallback={<HomeSkeleton />}>
      <Home userId={user.id} seenDaybreak={seenDaybreak} />
    </Suspense>
  )
}

async function Home({ userId, seenDaybreak }: { userId: string; seenDaybreak: boolean }) {
  const supabase = await createClient()
  // The whole assembly — globe pins, featured pick, cover chain, stats — lives
  // in buildHomeData so that someone else's profile at /app/people/[id] renders
  // from the SAME code. It used to be inline here, which is precisely why that
  // page had drifted into a thinner screen with no globe.
  const data = await buildHomeData(supabase, userId)

  // The Inspire deck + its globe pins, and ONLY for an account with nothing of
  // its own yet.
  //
  // Serial rather than parallel with the assembly above, on purpose. Whether it
  // is needed is a fact about the trips, so a parallel fetch would run the
  // corpus query on every home load for every established user to throw the
  // answer away. The one round trip it costs is paid only by accounts whose
  // home has almost nothing else to load, and it happens inside the Suspense
  // boundary with the skeleton already on screen.
  //
  // ONLY FROM HERE. /app/people/[id] renders the same shell for a stranger's
  // profile and must never carry this.
  const empty = !data.featured && data.others.length === 0

  // FIRST RUN. iOS decides with FirstRun.shouldLand(userID:) — "not seen
  // before" AND "the account has no trips" — and this is the same pair: the
  // cookie, and the fact just computed above.
  //
  // DECIDED HERE, AFTER buildHomeData, ON PURPOSE. "Has this account any
  // trips" is the expensive half, and it is already answered by the assembly
  // this page has to run anyway. Asking it earlier — before the Suspense
  // boundary, where the redirect would cost no skeleton — means a COUNT on
  // trips ahead of the first byte of every home load for every established
  // user, who never has the cookie and so would pay it forever. The redirect
  // therefore streams: the skeleton is briefly on screen. That is the whole
  // cost, and it is paid only by accounts with nothing to show anyway.
  if (empty && !seenDaybreak) redirect("/app/welcome")

  const inspire = empty ? await buildInspirePromo(supabase) : null

  return <HomeShell data={data} inspire={inspire} />
}
