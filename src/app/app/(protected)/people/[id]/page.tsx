import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import HomeShell from "@/components/app/home/HomeShell"
import { buildHomeData, profileExists } from "@/lib/drift/homeData"

// Someone else's profile — reached by tapping a person in the followers/
// following list.
//
// This is now the SAME screen as your own passport: globe, featured trip, trip
// cards, identical cover chain. It used to be a separate, much thinner
// rendering — avatar, three stats and a flat list of links, no globe — because
// it had grown its own data assembly and its own markup. Two screens answering
// the same question, sharing no code, so they shared no behaviour either.
//
// Both now call buildHomeData() and render HomeShell, so any future field
// lands on both at once instead of one drifting behind the other.
//
// Visibility is still RLS's job: the identical query returns your own trips in
// full on your own page, and only the public or buddy-shared ones here.

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: profileId } = await params
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const me = session?.user
  if (!me) return null

  // Your own id → Home, which is the same shell with the owner affordances.
  if (me.id === profileId) redirect("/app")

  if (!(await profileExists(supabase, profileId))) notFound()

  const [data, { data: iFollowRow }] = await Promise.all([
    buildHomeData(supabase, profileId),
    supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", me.id)
      .eq("following_id", profileId)
      .maybeSingle(),
  ])

  return (
    <HomeShell
      data={data}
      viewer={{
        kind: "other",
        meId: me.id,
        targetId: profileId,
        initiallyFollowing: !!iFollowRow,
        backHref: "/app/people",
      }}
    />
  )
}
