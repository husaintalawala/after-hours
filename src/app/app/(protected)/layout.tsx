import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import AppNav from "@/components/app/AppNav"

// Auth gate for the whole logged-in app. Runs on the server: no session ->
// bounce to /app/login (which lives OUTSIDE this route group, so no loop).
// The marketing root layout (src/app/layout.tsx, dark) still wraps this, so
// we paint our own full-height light surface over it — Drift is a light app.
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

  return (
    <>
      {/* Fraunces (display) — Inter is already loaded by the root layout. */}
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap"
        rel="stylesheet"
      />
      <div className="min-h-screen bg-white text-drift-ink font-drift-body pb-24">
        {children}
        <AppNav />
      </div>
    </>
  )
}
