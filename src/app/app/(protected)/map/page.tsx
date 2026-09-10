import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { buildHomeData } from "@/lib/drift/homeData"
import MapShell from "@/components/app/map/MapShell"

// The globe — your trips as cover-photo pins on a 3D planet.
//
// The pins come from buildHomeData, the SAME assembly the home and
// /app/people/[id] use. A second query shaped "trips with coordinates" is a
// second place for the cover chain to be forgotten, and the cover is the whole
// point of these markers.

export default async function MapPage() {
  const supabase = await createClient()
  // Middleware already verified this request's user; the cookie read is enough.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) redirect("/app/login")

  const data = await buildHomeData(supabase, user.id)

  return <MapShell pins={data.pins} countries={data.countries} />
}
