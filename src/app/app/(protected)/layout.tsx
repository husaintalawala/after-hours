import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import AppNav from "@/components/app/AppNav"
import AppTopNav from "@/components/app/AppTopNav"

// The logged-in app owns its own browser-tab identity (the marketing landing
// keeps the "Side Quest" title from the root layout).
export const metadata: Metadata = {
  title: "Drift",
  icons: { icon: "/drift-icon.svg" },
}

// Auth gate for the whole logged-in app. Runs on the server: no session ->
// bounce to /app/login (which lives OUTSIDE this route group, so no loop).
// Desktop gets the frosted top nav; mobile keeps the floating dock. Aurora
// Deep Midnight canvas (Fraunces heavier weight loaded for display type).
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  // Fast gate: middleware already verified this request's user against
  // Supabase (updateSession → getUser network call). Re-verifying here on
  // every navigation added a second auth round-trip per click — read the
  // session from the cookie instead.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user

  if (!user) redirect("/app/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name,username,avatar_url")
    .eq("id", user.id)
    .maybeSingle<{ display_name: string | null; username: string | null; avatar_url: string | null }>()
  const initial = (profile?.display_name || profile?.username || "T")
    .slice(0, 1)
    .toUpperCase()

  return (
    <>
      {/* Fraunces (display) — Inter is already loaded by the root layout. */}
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&display=swap"
        rel="stylesheet"
      />
      <div className="min-h-screen bg-aurora-midnight pb-24 font-drift-body text-aurora-ink lg:pb-12">
        <AppTopNav initial={initial} avatarUrl={profile?.avatar_url ?? null} />
        {children}
        <div className="lg:hidden">
          <AppNav />
        </div>
      </div>
    </>
  )
}
