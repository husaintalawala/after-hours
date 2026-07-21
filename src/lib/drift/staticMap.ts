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
