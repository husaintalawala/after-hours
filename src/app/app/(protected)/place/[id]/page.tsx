import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { fetchPlaceDetails } from "@/lib/drift/placeDetails"
import type { TripRow } from "@/lib/db-types"
import PlaceDetailView from "@/components/app/place/PlaceDetailView"

// Place detail — cinematic hero, About / Hours / Reviews, and a sticky action
// card with mini-map + "Ask Drift about this" (prefills the featured trip's
// docked chat via ?ask=).

export default async function PlacePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: placeId } = await params
  // The Google Place Details call and the user's trips lookup are independent.
  // getSession() is a local JWT decode (no network), so awaiting it first to
  // learn the user id costs nothing; then both network calls race in Promise.all
  // instead of the Google call blocking the trips query (or vice-versa).
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const [place, tripsRes] = await Promise.all([
    fetchPlaceDetails(decodeURIComponent(placeId)),
    session?.user
      ? supabase
          .from("trips")
          .select("id,title,start_date,is_active")
          .eq("user_id", session.user.id)
          .returns<Pick<TripRow, "id" | "title" | "start_date" | "is_active">[]>()
      : Promise.resolve({ data: [] as Pick<TripRow, "id" | "title" | "start_date" | "is_active">[] }),
  ])
  if (!place) notFound()

  // Featured trip → the Ask-Drift hand-off target.
  let askHref: string | null = null
  const trips = (tripsRes.data ?? []).slice().sort((a, b) =>
    (b.start_date ?? "").localeCompare(a.start_date ?? "")
  )
  if (trips.length) {
    const today = new Date().toISOString().slice(0, 10)
    const featured =
      trips.find((t) => t.is_active) ??
      trips
        .filter((t) => (t.start_date ?? "") > today)
        .sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? ""))[0] ??
      trips[0]
    if (featured) {
      askHref = `/app/trips/${featured.id}?ask=${encodeURIComponent(
        `Tell me about ${place.name} — is it worth adding to this trip?`
      )}`
    }
  }

  return <PlaceDetailView place={place} askHref={askHref} />
}
