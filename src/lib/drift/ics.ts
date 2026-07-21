// Minimal iCalendar (.ics) parser — extracts each VEVENT as a plain-text block
// (summary · when · where · description) suitable for the reservation parser.
// Handles RFC 5545 line unfolding (continuation lines start with space/tab)
// and the common escape sequences. Dependency-free.

const WANTED = ["SUMMARY", "DTSTART", "DTEND", "LOCATION", "DESCRIPTION"] as const

export function icsToEventTexts(ics: string): string[] {
  // Unfold folded lines, then split.
  const unfolded = ics.replace(/\r?\n[ \t]/g, "")
  const lines = unfolded.split(/\r?\n/)
  const events: string[] = []
  let cur: Record<string, string> | null = null

  for (const raw of lines) {
    const line = raw.trimEnd()
    const upper = line.toUpperCase()
    if (upper === "BEGIN:VEVENT") {
      cur = {}
      continue
    }
    if (upper === "END:VEVENT") {
      if (cur) {
        const block = renderEvent(cur)
        if (block) events.push(block)
      }
      cur = null
      continue
    }
    if (!cur) continue
    const colon = line.indexOf(":")
    if (colon < 0) continue
    const key = line.slice(0, colon).split(";")[0].toUpperCase()
    if ((WANTED as readonly string[]).includes(key) && !cur[key]) {
      cur[key] = unescapeIcs(line.slice(colon + 1))
    }
  }
  return events
}

function unescapeIcs(v: string): string {
  return v
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim()
}

// ICS date value: 20260714T090000Z or 20260714 → "2026-07-14 09:00" / "2026-07-14".
function fmtIcsDate(v: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/.exec(v)
  if (!m) return v
  const [, y, mo, d, h, min] = m
  const date = `${y}-${mo}-${d}`
  return h ? `${date} ${h}:${min}` : date
}

function renderEvent(e: Record<string, string>): string | null {
  if (!e.SUMMARY && !e.LOCATION && !e.DESCRIPTION) return null
  const parts: string[] = []
  if (e.SUMMARY) parts.push(e.SUMMARY)
  if (e.DTSTART) {
    parts.push(`When: ${fmtIcsDate(e.DTSTART)}${e.DTEND ? ` to ${fmtIcsDate(e.DTEND)}` : ""}`)
  }
  if (e.LOCATION) parts.push(`Where: ${e.LOCATION}`)
  if (e.DESCRIPTION) parts.push(e.DESCRIPTION)
  return parts.join("\n")
}
