import { Suspense } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import AppNav from "@/components/app/AppNav"
import AppRail from "@/components/app/AppRail"
import PostHogAuthBridge from "@/components/app/PostHogAuthBridge"
import RailAvatar, { RailAvatarFallback } from "@/components/app/RailAvatar"

// Browser-tab identity (title + favicon) is inherited from the /app section
// layout (src/app/app/layout.tsx) so login and the logged-in app match; the
// marketing/Side Quest root layout keeps its own.

// Auth gate for the whole logged-in app. Runs on the server: no session ->
// bounce to /app/login (which lives OUTSIDE this route group, so no loop).
// Desktop gets the frosted top nav; mobile keeps the floating dock. Aurora
// Deep Midnight canvas (Fraunces heavier weight loaded for display type).
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  // Fast gate: middleware already verified this request's user against
  // Supabase (updateSession → getUser network call). Re-verifying here on
  // every navigation added a second auth round-trip per click — read the
  // session from the cookie instead.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user

  if (!user) redirect("/app/login")

  // NOTHING ELSE IS AWAITED HERE. A loading.tsx wraps a layout's children, not
  // the layout's own awaits, so anything this function waits on delays the
  // first byte of every hard load — and the profiles lookup that used to live
  // here bought one letter and one image URL. It streams in now; see RailAvatar.

  // Magic link serves both sign-up and sign-in, so a just-created auth user is
  // the only signal that this app entry is a signup (funnel step).
  const isNew = Date.now() - new Date(user.created_at).getTime() < 5 * 60 * 1000

  return (
    <>
      {/* Fraunces (display) — Inter is already loaded by the root layout. */}
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&display=swap"
        rel="stylesheet"
      />
      <PostHogAuthBridge userId={user.id} email={user.email} isNew={isNew} />
      <div className="min-h-screen bg-aurora-midnight font-drift-body text-aurora-ink">
        {/* Desktop: persistent left nav rail. Mobile: floating bottom dock. */}
        <div className="hidden lg:block">
          <AppRail
            avatar={
              <Suspense fallback={<RailAvatarFallback />}>
                <RailAvatar userId={user.id} />
              </Suspense>
            }
          />
        </div>
        {/* Content clears the attached mobile nav (56px + safe area) and the
            desktop rail (pl). */}
        <div className="pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-[76px]">{children}</div>
        <div className="lg:hidden">
          <AppNav />
        </div>
      </div>
    </>
  )
}
