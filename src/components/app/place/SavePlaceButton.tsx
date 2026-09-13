"use client"
import { useState } from "react"
import { useSavedPlaces } from "@/lib/drift/savedPlaces"
import type { PlaceDetails } from "@/lib/drift/placeDetails"

export default function SavePlaceButton({ place }: { place: PlaceDetails }) {
  const { isSaved, toggle } = useSavedPlaces()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const saved = isSaved(place.id)
  async function save() {
    if (busy) return
    setBusy(true); setError(false)
    try {
      const okay = await toggle({ id: place.id, name: place.name, address: place.address, lat: place.lat, lng: place.lng, rating: place.rating, reviewCount: place.ratingCount, subtitle: place.typeLabel, description: place.summary, photo: null, priceLabel: null, bookingUrl: null, source: "google" }, null, place.typeLabel ?? "forYou")
      setError(!okay)
    } catch { setError(true) } finally { setBusy(false) }
  }
  return <div className="place-save"><button type="button" aria-pressed={saved} disabled={busy} onClick={() => void save()}><svg width="18" height="18" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20.8 5.6a5.2 5.2 0 0 0-7.4 0L12 7l-1.4-1.4a5.2 5.2 0 0 0-7.4 7.4L12 22l8.8-9a5.2 5.2 0 0 0 0-7.4Z" /></svg>{busy ? "Saving…" : saved ? "In your Back pocket" : "Save to Back pocket"}</button>{error && <p role="alert">Couldn’t update your Back pocket. Please try again.</p>}</div>
}
