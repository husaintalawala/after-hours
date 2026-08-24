// Mapbox Static Images URL for the item inspector's mini-map — a coral pin on
// a small satellite-street frame. Pure URL construction; the pk token is the
// same public one the globe uses.
export function staticMapUrl(
  lat: number,
  lng: number,
  width = 600,
  height = 280,
  zoom = 13.5
): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token) return null
  const pin = `pin-s+E0563B(${lng},${lat})`
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${pin}/${lng},${lat},${zoom}/${width}x${height}@2x?access_token=${token}&logo=false&attribution=false`
}

/// A whole trip's route on one static frame — every stop pinned, auto-fitted.
///
/// Deliberately the STATIC images API and not the GL map. Mapbox GL is ~705kB
/// and the trip page keeps it behind a lazy import for exactly that reason; a
/// live map tile on the landing screen would pull it into first load. This is
/// one <img> from a host already on OptimizedImg's allow-list.
export function staticRouteUrl(
  coords: { lat: number; lng: number }[],
  width = 700,
  height = 260
): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token || coords.length === 0) return null
  // Mapbox caps the overlay list by URL length; 12 pins is plenty to read as a
  // route and keeps the URL well inside it.
  const pins = coords
    .slice(0, 12)
    .map((c, i) => `pin-s-${i + 1}+37D6C4(${c.lng.toFixed(4)},${c.lat.toFixed(4)})`)
    .join(",")
  // `auto` fits the viewport to the overlays, so no zoom guessing.
  return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${pins}/auto/${width}x${height}@2x?access_token=${token}&logo=false&attribution=false&padding=40`
}
