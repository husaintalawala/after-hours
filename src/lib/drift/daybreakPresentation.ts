/** Keep the location's own regional context, without repeating its city name. */
export function cityContext(city: string, address?: string | null): string {
  const parts = (address ?? "").split(",").map(part => part.trim()).filter(Boolean)
  if (parts[0]?.toLocaleLowerCase() === city.trim().toLocaleLowerCase()) parts.shift()
  return parts.join(", ")
}

/** A caption is editorial data or the actual stop sequence, never a match claim. */
export function guideCaption(guide: { blurb?: string | null; shapeLine: string }): string {
  return guide.blurb?.trim() || guide.shapeLine
}
