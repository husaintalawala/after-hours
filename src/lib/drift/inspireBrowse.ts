// The browse shelf needs stop order, not full itinerary/place payloads.
export const BROWSE_COLUMNS = "trip_id,rank,tags,best_months,blurb,hero_url,hero_attribution,hero_link,author_handle,author_avatar_url," +
  "title:snapshot->>title,day_count:snapshot->day_count,countries:snapshot->countries,cities:snapshot->cities,destinations:snapshot->destinations"

export function placeSearchText(items: unknown): string {
  return (Array.isArray(items) ? items : []).flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const row = item as Record<string, unknown>
    return [row.title, row.location_name, row.canonical_name, row.kind, row.place_category]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
  }).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}
