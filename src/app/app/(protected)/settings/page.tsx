import { createClient } from "@/lib/supabase/server"
import type { ProfileRow } from "@/lib/db-types"
import SettingsShell from "@/components/app/settings/SettingsShell"

export default async function SettingsPage() {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>()

  // home_* columns are new; the generated types may lag, so read via a loose cast.
  const p = profile as (ProfileRow & { home_city?: string | null }) | null

  return (
    <SettingsShell
      profile={{
        displayName: profile?.display_name || profile?.username || "Traveler",
        username: profile?.username ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        email: user.email ?? null,
        homeCity: p?.home_city ?? null,
      }}
    />
  )
}
