import Link from "next/link"
import { placesPhotoUrl, type PlaceDetails } from "@/lib/drift/placeDetails"
import { staticMapUrl } from "@/lib/drift/staticMap"
import BackLink from "@/components/app/BackLink"
import OptimizedImg from "@/components/app/OptimizedImg"
import PlaceGallery from "./PlaceGallery"
import SavePlaceButton from "./SavePlaceButton"
import "./place.css"

export default function PlaceDetailView({ place, askHref }: { place: PlaceDetails; askHref: string | null }) {
  const photos = place.photoNames.slice(0, 5)
  const map = place.lat != null && place.lng != null ? staticMapUrl(place.lat, place.lng) : null
  const mapHref = place.mapsUri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.lat},${place.lng}`)}`
  return <main className="place-detail">
    <div className="place-navigation"><BackLink href="/app/discover" label="Discover" /><Link href="/app/saved">Back pocket →</Link></div>
    <header className="place-heading"><div>{place.typeLabel && <p className="place-eyebrow">{place.typeLabel}</p>}<h1>{place.name}</h1><div className="place-meta">{place.rating != null && place.rating > 0 && <span>★ {place.rating.toFixed(1)}{place.ratingCount ? ` · ${place.ratingCount.toLocaleString()} Google reviews` : ""}</span>}{place.openNow != null && <span className={place.openNow ? "place-open" : ""}>{place.openNow ? "Open now" : "Closed now"}</span>}</div></div><SavePlaceButton place={place} /></header>
    <PlaceGallery name={place.name} photos={photos.map((name, i) => ({ src: placesPhotoUrl(name, i === 0 ? 1600 : 480), credits: place.photoCredits?.[name] ?? [] }))} />
    <div className="place-body">
      <div className="place-story">
        {place.summary && <section className="place-about"><h2>Worth knowing</h2><p>{place.summary}</p></section>}
        <section className="place-reviews"><div className="place-section-heading"><h2>What travelers say</h2>{place.mapsUri && <a href={place.mapsUri} target="_blank" rel="noreferrer">Google Maps ↗</a>}</div>
          {place.reviews.length ? place.reviews.map((review, index) => <article key={index} className="place-review"><div className="place-review-author"><strong>{review.authorUri ? <a href={review.authorUri} target="_blank" rel="noreferrer">{review.author}</a> : review.author}</strong>{review.rating != null && <span>★ {review.rating}</span>}</div><p className="place-review-date">{review.when}</p>{review.text.length > 280 ? <details><summary><span>{review.text.slice(0, 220)}…</span><span className="place-read-review">Read full review</span></summary><p>{review.text}</p></details> : <p>{review.text}</p>}</article>) : <p className="place-muted">No reviews available for this place.</p>}
        </section>
      </div>
      <aside className="place-essentials"><h2>Plan your visit</h2>{place.address && <p className="place-address">{place.address}</p>}<div className="place-actions">{place.mapsUri && <a href={place.mapsUri} target="_blank" rel="noreferrer">Directions ↗</a>}{place.website && <a href={place.website} target="_blank" rel="noreferrer">Website ↗</a>}{place.phone && <a href={`tel:${place.phone.replace(/[^+\d]/g, "")}`}>{place.phone}</a>}</div>
        {place.hours.length ? <details className="place-hours"><summary>Opening hours</summary><ul>{place.hours.map(hour => <li key={hour}>{hour}</li>)}</ul></details> : <p className="place-muted">Opening hours aren’t available.</p>}
        {map && <a href={mapHref} target="_blank" rel="noopener noreferrer" aria-label={`Open ${place.name} in Google Maps (opens in a new tab)`} className="block rounded-[10px]"><OptimizedImg src={map} width={600} height={280} sizes="(max-width: 900px) 100vw, 380px" className="place-map" /></a>}{map && <p className="place-map-credit"><a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noreferrer">© Mapbox</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a></p>}
        {askHref && <Link href={askHref} className="place-ask">Ask Drift about this →</Link>}
      </aside>
    </div>
  </main>
}
