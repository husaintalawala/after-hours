import { cookies } from "next/headers"
import { deriveProfileIdentity } from "@/lib/drift/handleDerivation"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { buildDaybreakShelf } from "@/lib/drift/inspirePromo"
import { DAYBREAK_COOKIE, hasSeenDaybreak } from "@/lib/drift/daybreak"
import DaybreakFlow from "@/components/app/welcome/DaybreakFlow"

// Daybreak — the six questions a brand-new account meets before it meets the
// app. /app routes here when the account has no trips and has not seen this;
// see the note in (protected)/page.tsx for why the decision is made there.
//
// OUTSIDE THE (protected) GROUP, deliberately, next to /app/login: that layout
// draws the nav rail and the bottom dock, and this screen is one continuous
// sunrise from edge to edge. It carries its own auth check instead, which is
// the same shape login's siblings already use.

export const dynamic = "force-dynamic"

export default async function WelcomePage({
  searchParams,
}: {
  searchParams?: Promise<{ again?: string }>
}) {
  const { again } = (await searchParams) ?? {}

  // ALREADY SEEN → the app. This is what makes a force-refresh mid-flow land
  // in the app rather than back at question one: the flow writes the cookie on
  // mount, so the second load of this URL is bounced. `?again=1` is the way
  // back in for anyone who wants to look at it twice — it does not clear
  // anything, so the route stays honest about having been seen.
  const jar = await cookies()
  const supabase = await createClient()
  // Middleware already verified this request's user; the cookie read is enough.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) redirect("/app/login")

  // Checked HERE, not before the session is read: "seen" is a fact about an
  // ACCOUNT, so the question cannot be asked until we know which one. The
  // earlier version asked it of the browser and answered for everybody.
  if (hasSeenDaybreak(jar.get(DAYBREAK_COOKIE)?.value, user.id) && again !== "1") {
    redirect("/app")
  }

  // Independent reads, so they go together. The shelf is the whole corpus (40
  // rows, the same 98KB projection the home deck uses) because screen 3 ranks
  // it and the deck's five would put the same handful atop every answer.
  //
  // home_lat/home_lng ride along with home_city because screen 2 has always
  // written all three and only the label was ever read back — the coordinates
  // are what puts "2,900 km away" on a guide card for someone who answered
  // this question on a previous visit.
  // BEFORE the row is read, not after. The callback derives a name for anyone
  // signing in fresh, but this route is also reachable by an account created
  // before that existed and by the email-confirm path, which does not pass
  // through the callback at all. It returns in a millisecond once a username is
  // set, so the common case pays a single indexed lookup for the guarantee that
  // this screen never asks somebody to confirm "Traveler" and "@drift".
  await deriveProfileIdentity(supabase, user.id)

  const [profileRes, guides] = await Promise.all([
    supabase
      .from("profiles")
      .select("username,display_name,avatar_url,home_city,home_country,home_lat,home_lng")
      .eq("id", user.id)
      .maybeSingle<{
        username: string | null
        display_name: string | null
        avatar_url: string | null
        home_city: string | null
        home_country: string | null
        home_lat: number | null
        home_lng: number | null
      }>(),
    buildDaybreakShelf(supabase),
  ])

  const p = profileRes.data

  return (
    <>
      {/* Fraunces (display). The (protected) layout loads it for the rest of
          the app; this route is outside that layout, and its headlines are the
          largest display type in the product. */}
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&display=swap"
        rel="stylesheet"
      />
      <div className="min-h-[100dvh] bg-aurora-midnight font-drift-body">
        <DaybreakFlow
          userId={user.id}
          profile={{
            displayName: p?.display_name ?? "",
            username: p?.username ?? "",
            avatarUrl: p?.avatar_url ?? null,
            homeCity: p?.home_city ?? null,
            homeCountry: p?.home_country ?? null,
            homeCoord:
              p?.home_lat != null && p?.home_lng != null
                ? { lat: p.home_lat, lng: p.home_lng }
                : null,
          }}
          // A failed corpus read hands the flow an empty shelf rather than a
          // redirect back to /app: /app is what sent us here, and bouncing
          // before the client can write the dismissal cookie is an infinite
          // loop. Screen 4 keeps its "Finding your first trip." headline and
          // its live skip, so the way out is on the screen.
          guides={guides ?? []}
        />
      </div>
    </>
  )
}
