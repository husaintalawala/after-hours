"use client"

import { useEffect, useState } from "react"
import OptimizedImg from "@/components/app/OptimizedImg"
import CoverCredit from "@/components/app/CoverCredit"
import {
  factChips,
  kindLine,
  mapsQuery,
  nightsWord,
  photoAt,
  trustedName,
  type FactChip,
  type InspireItem,
} from "@/lib/drift/inspire"

/**
 * One place from a guide — the card, and the panel behind it.
 *
 * ONE COMPONENT FOR BOTH WEB SURFACES, deliberately. The signed-in guide and
 * the public `/i/<slug>` page had separately written place rows, and separately
 * written rows drift: the parity rule for this product is that a feature ships
 * on iOS AND web, and it is not much use if the two web halves then disagree
 * with each other. `variant` changes the proportions, never the facts.
 *
 * WHAT THE ROW USED TO BE. A thumbnail, a name and a sentence. "Dinner in the
 * cave — Touristy, expensive, and you should still do it once." That is a
 * wonderful line and you cannot act on it: you do not know what the place is,
 * where it is, what it costs, whether to book, or how long to give it. The
 * corpus is written in a voice, and a voice with no facts under it is a
 * postcard.
 *
 * So the card carries both, and keeps them visibly separate — the curator's
 * line stays a quote in their words, everything else is ours, from
 * `inspire_place_facts`.
 *
 * EVERY FACT IS OPTIONAL. The enrichment pass is required to DECLINE when a row
 * has no real referent ("Beach day" has nothing to canonicalise), so a card with
 * a title and a note and nothing else is a normal state, not a degraded one.
 * Nothing here draws an empty box, a zero or a dash where a fact is missing.
 */
export default function PlaceCard({
  item,
  variant = "compact",
  authorHandle,
  photo,
}: {
  item: InspireItem
  /** "compact" mirrors the iOS row; "wide" is the public page's editorial card. */
  variant?: "compact" | "wide"
  authorHandle?: string | null
  /**
   * An already-resolved photo URL, overriding `item.photo`.
   *
   * The public page walks the guide de-duplicating photos as it goes and hands
   * the result down — a guard kept from when the snapshot builder GUARANTEED a
   * repeat (a stop's picture was its first place's picture, on all 38 guides).
   * The builder no longer does that, but a partially enriched corpus can still
   * produce one, so the guard stays. `undefined` means "use the item's own".
   */
  photo?: string | null
}) {
  const [open, setOpen] = useState(false)

  const title = item.title ?? item.location_name ?? "—"
  const real = trustedName(item)
  const kind = kindLine(item)
  const chips = factChips(item)
  const source = photo === undefined ? item.photo : photo
  const thumb = photoAt(source, variant === "wide" ? 640 : 260)

  // A trailing note — "Dubrovnik → DBV → FCO. Nine days down the coast." — is
  // the author talking, not a place. No facts, no photo, nothing to open.
  if (item.step_type === "note") {
    if (!item.title && !item.notes) return null
    return (
      <li className="rounded-card border border-aurora-border bg-aurora-glass px-3.5 py-3">
        {item.title && (
          <p className="text-[13px] font-semibold text-aurora-ink2">{item.title}</p>
        )}
        {item.notes && (
          <p className="mt-1 text-[13.5px] leading-relaxed text-aurora-ink3">{item.notes}</p>
        )}
      </li>
    )
  }

  const wide = variant === "wide"

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full overflow-hidden rounded-card border border-aurora-border bg-aurora-glass text-left transition-colors hover:border-white/20"
      >
        <div className={wide ? "sm:flex" : "flex gap-3 p-3"}>
          {/* A DEFINITE box. An aspect-fill photo in an auto-width container
              reports the filled width as its own and drags the text column off
              the row — the same trap the iOS side pays for with FillingPhoto. */}
          {wide ? (
            thumb && (
              <div className="relative aspect-[16/10] w-full overflow-hidden sm:aspect-auto sm:w-52 sm:shrink-0 sm:self-stretch">
                <OptimizedImg src={thumb} alt={title} fill className="h-full w-full object-cover" />
              </div>
            )
          ) : (
            <span className="relative block h-[92px] w-[92px] shrink-0 overflow-hidden rounded-2xl bg-aurora-glass2">
              {thumb ? (
                <OptimizedImg src={thumb} alt="" fill sizes="92px" className="h-full w-full object-cover" />
              ) : (
                <span className="absolute inset-0 grid place-items-center text-aurora-ink3">
                  <TypeGlyph type={item.step_type} />
                </span>
              )}
            </span>
          )}

          <div className={`min-w-0 flex-1 ${wide ? "px-4 py-4 sm:px-5" : ""}`}>
            {/* WHAT IT IS, above what it is CALLED. The corpus titles are
                editorial — "Dinner in the cave" gives you the mood and withholds
                the category — so the category leads and the poem follows. */}
            {kind && (
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-aurora-teal">
                {kind}
              </p>
            )}

            <h3
              className={`${kind ? "mt-1" : ""} break-words font-semibold leading-snug text-aurora-ink ${
                wide ? "font-drift-display text-xl font-medium" : "text-[15px]"
              }`}
            >
              {title}
            </h3>

            {/* The real, searchable name — the single line that turns a guide
                you admire into a guide you can use. Withheld below the
                confidence floor: naming the wrong restaurant is worse than
                naming none, because the reader cannot tell which they got. */}
            {real && <p className="mt-0.5 break-words text-[12.5px] text-aurora-ink2">{real}</p>}

            {item.notes && (
              <p className="mt-1.5 break-words text-[13.5px] leading-relaxed text-aurora-ink2">
                {item.notes}
              </p>
            )}

            <FactRail chips={chips} />

            {item.step_type === "stay" && item.nights > 0 && (
              <p className="mt-2 text-[11px] text-aurora-ink3">{nightsWord(item.nights)}</p>
            )}
          </div>
        </div>
      </button>

      {open && (
        <PlacePanel item={item} authorHandle={authorHandle} onClose={() => setOpen(false)} />
      )}
    </li>
  )
}

/** Cost, time, when, whether to book. Wraps rather than compresses — four chips
 *  squeezed into one flex row lose their words one character at a time, which
 *  is the truncation class this feature has already shipped twice. */
function FactRail({ chips }: { chips: FactChip[] }) {
  if (!chips.length) return null
  return (
    <ul className="mt-2.5 flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <li
          key={c.text}
          className="flex items-center gap-1 rounded-full bg-aurora-glass2 px-2 py-1 text-[11.5px] text-aurora-ink3"
        >
          <FactIcon icon={c.icon} />
          {c.text}
        </li>
      ))}
    </ul>
  )
}

function FactIcon({ icon }: { icon: FactChip["icon"] }) {
  const path =
    icon === "price"
      ? "M2 7h20v12H2zM2 11h20"
      : icon === "clock"
        ? "M12 7v5l3 2"
        : icon === "sun"
          ? "M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4"
          : "m8 12 3 3 5-6"
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3 w-3 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {(icon === "clock" || icon === "sun" || icon === "seal") && <circle cx="12" cy="12" r={icon === "sun" ? 3.6 : 9} />}
      <path d={path} />
    </svg>
  )
}

/**
 * The place, opened.
 *
 * NO HOURS, NO PHONE NUMBERS, NO PRICES IN CURRENCY — that is the durability
 * rule the facts are written under, and it is visible in what this panel can
 * display: there is no row for any of them. A guide that ages badly is worse
 * than a guide that says less.
 */
function PlacePanel({
  item,
  authorHandle,
  onClose,
}: {
  item: InspireItem
  authorHandle?: string | null
  onClose: () => void
}) {
  // Escape closes, and the page behind does not scroll while it is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const title = item.title ?? item.location_name ?? "—"
  const real = trustedName(item)
  const kind = kindLine(item)
  const chips = factChips(item)
  const photo = photoAt(item.photo, 1200)
  const where = [item.neighbourhood, item.city, item.country].filter(Boolean).join(", ")
  const hasCoord =
    item.latitude != null &&
    item.longitude != null &&
    !(item.latitude === 0 && item.longitude === 0)

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-hero border border-aurora-border bg-aurora-midnight sm:rounded-hero"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          {photo && (
            <div className="relative aspect-[16/10] w-full overflow-hidden">
              <OptimizedImg src={photo} alt={title} fill className="h-full w-full object-cover" />
              {/* CoverCredit positions itself; a wrapper would collapse it. */}
              {item.photo_attribution && (
                <CoverCredit text={item.photo_attribution} href={item.photo_link} />
              )}
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-black/50 text-white backdrop-blur"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5">
          {kind && (
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-aurora-teal">
              {kind}
            </p>
          )}
          <h2 className="mt-1.5 font-drift-display text-[26px] font-bold leading-tight text-aurora-ink">
            {title}
          </h2>
          {real && <p className="mt-1 text-[14.5px] text-aurora-ink2">{real}</p>}

          {chips.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {chips.map((c) => (
                <li
                  key={c.text}
                  className="flex items-center gap-1.5 rounded-full border border-aurora-border bg-aurora-glass px-2.5 py-1.5 text-[12.5px] font-semibold text-aurora-ink2"
                >
                  <span className="text-aurora-teal">
                    <FactIcon icon={c.icon} />
                  </span>
                  {c.text}
                </li>
              ))}
            </ul>
          )}

          {/* Kept as a QUOTE, with the marks and the byline. Everything below is
              ours; this is theirs, and a reader has to be able to tell which
              they are reading at a glance. */}
          {item.notes && (
            <blockquote className="mt-5 border-l-2 border-aurora-teal/55 pl-3.5">
              <p className="text-[17px] font-semibold leading-snug text-aurora-ink">
                &ldquo;{item.notes}&rdquo;
              </p>
              {authorHandle && (
                <footer className="mt-1.5 text-[12px] text-aurora-ink3">— {authorHandle}</footer>
              )}
            </blockquote>
          )}

          {item.blurb && (
            <p className="mt-4 text-[14px] leading-relaxed text-aurora-ink2">{item.blurb}</p>
          )}

          {item.tips.length > 0 && (
            <section className="mt-6">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-aurora-ink3">
                Worth knowing
              </h3>
              <ul className="mt-2.5 space-y-2.5">
                {item.tips.map((tip) => (
                  <li key={tip} className="flex gap-2.5 text-[13.5px] leading-relaxed text-aurora-ink2">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-aurora-teal" />
                    {tip}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(where || hasCoord) && (
            <section className="mt-6">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-aurora-ink3">
                Where
              </h3>
              {where && <p className="mt-2 text-[13.5px] text-aurora-ink2">{where}</p>}
              {hasCoord && (
                <a
                  // The QUERY carries the trusted name where we have one, so the
                  // pin lands on the restaurant and not on the poem about it;
                  // the coordinate rides along because it is right even when the
                  // name is not.
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    mapsQuery(item) || `${item.latitude},${item.longitude}`,
                  )}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl border border-aurora-border bg-aurora-glass px-4 text-[13.5px] font-semibold text-aurora-ink2 transition-colors hover:border-white/20"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3zM9 3v15M15 6v15" />
                  </svg>
                  Open in Maps
                </a>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

/** The stand-in when a place has no photo — a shape for what it is, never an
 *  empty grey square. */
function TypeGlyph({ type }: { type: string }) {
  const path =
    type === "stay"
      ? "M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 18h18M3 18v2M21 18v2M7 10V7h10v3"
      : type === "food" || type === "restaurant"
        ? "M7 3v8a2 2 0 0 0 4 0V3M9 11v10M17 3c-1.5 1.5-2 3.5-2 5.5S15.5 12 17 12v9"
        : type === "activity"
          ? "M4 8h16v8H4zM8 8v8M16 8v8"
          : "M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}
