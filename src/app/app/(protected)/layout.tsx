import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import AppNav from "@/components/app/AppNav"
import AppTopNav from "@/components/app/AppTopNav"

// Auth gate for the whole logged-in app. Runs on the server: no session ->
// bounce to /app/login (which lives OUTSIDE this route group, so no loop).
// Desktop gets the frosted top nav; mobile keeps the floating dock. Warm
// cream canvas (Fraunces heavier weight loaded for display type).
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

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
      <div className="min-h-screen bg-[#FAF8F5] pb-24 font-drift-body text-drift-ink lg:pb-12">
        <AppTopNav initial={initial} avatarUrl={profile?.avatar_url ?? null} />
        {children}
        <div className="lg:hidden">
          <AppNav />
        </div>
      </div>
    </>
  )
}
