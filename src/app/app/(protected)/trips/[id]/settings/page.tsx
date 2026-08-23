import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import TripSettingsShell from "@/components/app/trip/TripSettingsShell"

// Trip Settings — web port of the iOS EditTripView.
//
// Server half: load the trip and work out what this viewer is allowed to do,
// then hand plain props to the client shell. Same shape as the account settings
// page (settings/page.tsx → SettingsShell), which is the established pattern
// here for anything with forms.
//
// The viewer's ROLE is resolved here rather than in the browser, because it
// decides which destructive action is offered — "Delete trip" for the owner,
// "Leave trip" for a buddy — and those are not interchangeable. Deciding it on
// the client would mean a non-owner could be shown Delete; the server would
// refuse it, but only after they had confirmed a scary dialog.

export default async function TripSettingsPage({
  params,
}: {
  // Next 15: params is a Promise. Reading it synchronously typechecks and then
  // reads undefined at runtime.
  params: Promise<{ id: string }>
}) {
  const { id: tripId } = await params
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const meId = session?.user?.id
  if (!meId) return null

  // RLS already restricts this to the owner, an accepted buddy, or a public
  // trip, so a stranger gets no row and falls through to notFound().
  const { data: trip } = await supabase
    .from("trips")
    .select(
      "id,user_id,title,start_date,end_date,privacy,cover_url,travel_tracker,location_visibility"
    )
    .eq("id", tripId)
    .maybeSingle()

  if (!trip) notFound()

  const isOwner = trip.user_id === meId

  // Someone who is neither the owner nor an ACCEPTED buddy can still read a
  // public trip, and must not be handed an editing screen for it. Checking the
  // membership row is what separates "can view" from "can edit" — the trips
  // SELECT policy admits both.
  let isMember = isOwner
  if (!isOwner) {
    const { data: buddy } = await supabase
      .from("trip_buddies")
      .select("status")
      .eq("trip_id", tripId)
      .eq("user_id", meId)
      .maybeSingle()
    isMember = buddy?.status === "accepted"
  }
  if (!isMember) notFound()

  return (
    <TripSettingsShell
      tripId={trip.id}
      isOwner={isOwner}
      initial={{
        title: trip.title ?? "",
        startDate: trip.start_date,
        endDate: trip.end_date,
        privacy: trip.privacy ?? "public",
        coverUrl: trip.cover_url,
        travelTracker: trip.travel_tracker ?? false,
        // "only_me" | "followers" | "everyone" (LocationPrivacySheet.swift:8).
        // iOS defaults this to "followers" (EditTripView.swift:26), so web must
        // too — defaulting differently would silently widen or narrow who can
        // see someone's location the first time they open this screen.
        locationVisibility: trip.location_visibility ?? "followers",
      }}
    />
  )
}
