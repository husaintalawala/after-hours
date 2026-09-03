import type { InspirePattern, InspireSnapshot } from "@/lib/drift/inspire"

/**
 * Every photograph on a guide, credited by name and licence.
 *
 * WHY THIS EXISTS. Until the enrichment landed, a place's thumbnail came from
 * the trip author's OWN media rows — their pictures, needing no third-party
 * credit, which is why a generic "Photos: Wikimedia Commons · Unsplash" line at
 * the foot of the page was enough. Every place photo is now a Wikimedia Commons
 * file, and Commons is not CC0: CC BY-SA requires the AUTHOR and the LICENCE
 * together. A line naming only the service now UNDER-credits, on the most
 * exposed surface in the product — an anonymous, search-indexable page.
 *
 * WHY A LIST RATHER THAN A BADGE ON EACH THUMBNAIL. On the signed-in guide the
 * thumbnail is 92px and the credit chip is wider than that, so pinning one to
 * each would cover the picture it credits. CC BY-SA asks for attribution "in any
 * reasonable manner based on the medium", and a credits list at the foot of the
 * work is what a printed guidebook does. The large photographs — trip hero, stop
 * hero, the panel's own hero — keep their inline CoverCredit as well, so the
 * prominent ones are credited twice and the small ones once.
 *
 * Mirrors `photographs` in InspirePatternView.swift; the two must not diverge.
 */
export default function PhotoCredits({
  snapshot,
  heroUrl,
  heroAttribution,
  heroLink,
  className,
}: {
  snapshot: InspireSnapshot
  heroUrl?: string | null
  heroAttribution?: string | null
  heroLink?: string | null
  className?: string
}) {
  const credits = buildCredits(snapshot, heroUrl, heroAttribution, heroLink)
  if (!credits.length) return null

  return (
    <section className={className}>
      <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-aurora-ink3">
        Photographs
      </h2>
      <ul className="mt-3 space-y-1.5">
        {credits.map((c) => (
          <li key={c.photo} className="text-[11.5px] leading-relaxed text-aurora-ink3">
            <span>{c.subject}</span>{" "}
            {c.link ? (
              <a
                href={c.link}
                target="_blank"
                rel="noreferrer noopener"
                className="text-aurora-ink2 underline decoration-white/20 underline-offset-2 hover:text-aurora-ink"
              >
                {c.text}
              </a>
            ) : (
              <span className="text-aurora-ink2">{c.text}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** One entry per DISTINCT photograph, in the order it first appears. */
export function buildCredits(
  snapshot: InspireSnapshot,
  heroUrl?: string | null,
  heroAttribution?: string | null,
  heroLink?: string | null,
): { photo: string; subject: string; text: string; link: string | null }[] {
  const seen = new Set<string>()
  const out: { photo: string; subject: string; text: string; link: string | null }[] = []

  const add = (
    subject: string | null | undefined,
    photo: string | null | undefined,
    text: string | null | undefined,
    link: string | null | undefined,
  ) => {
    const t = text?.trim()
    if (!photo || !t || seen.has(photo)) return
    seen.add(photo)
    out.push({ photo, subject: subject?.trim() || snapshot.title, text: t, link: link ?? null })
  }

  add(snapshot.title, heroUrl, heroAttribution, heroLink)
  const dests = [...snapshot.destinations].sort((a, b) => a.day_offset - b.day_offset)
  for (const d of dests) {
    add(d.name ?? d.city, d.photo, d.photo_attribution, d.photo_link)
    for (const it of snapshot.items.filter((i) => i.destination_ref === d.ref)) {
      add(it.title ?? it.location_name, it.photo, it.photo_attribution, it.photo_link)
    }
  }
  return out
}

/** Convenience for the signed-in guide, which holds the whole pattern row. */
export function PatternPhotoCredits({
  pattern,
  className,
}: {
  pattern: InspirePattern
  className?: string
}) {
  return (
    <PhotoCredits
      snapshot={pattern.snapshot}
      heroUrl={pattern.heroUrl}
      heroAttribution={pattern.heroAttribution}
      heroLink={pattern.heroLink}
      className={className}
    />
  )
}
