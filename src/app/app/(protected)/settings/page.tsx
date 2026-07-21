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

  return (
    <SettingsShell
      profile={{
        displayName: profile?.display_name || profile?.username || "Traveler",
        username: profile?.username ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        email: user.email ?? null,
      }}
    />
  )
}
