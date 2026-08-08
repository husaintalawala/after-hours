import OptimizedImg from "./OptimizedImg"
import type { TripCoverResult } from "@/lib/drift/tripCover"

/**
 * The ONLY component that renders a trip cover.
 *
 * It takes the whole tripCover() result rather than a url, which is what makes
 * the Unsplash credit structurally unforgettable: a caller cannot pass the
 * photo without also passing the obligation attached to it. Reviewers should
 * reject any new site that destructures `.url` and renders it directly.
 *
 * `fill` is the normal mode — the parent supplies a sized, `relative`,
 * overflow-hidden box.
 */
export default function TripCoverImg({
  cover,
  alt = "",
  sizes,
  priority = false,
  className = "object-cover",
  showCredit = true,
}: {
  cover: TripCoverResult
  alt?: string
  sizes?: string
  priority?: boolean
  className?: string
  /** Suppress only where the credit is rendered elsewhere for the same photo. */
  showCredit?: boolean
}) {
  if (!cover.url) {
    // Rung 4 — a designed state, not a hole. Deterministic per trip and
    // identical to what iOS paints for the same id.
    return (
      <div
        className="absolute inset-0 grid place-items-center"
        style={{
          backgroundImage: `linear-gradient(135deg, ${cover.placeholder.from}, ${cover.placeholder.to})`,
        }}
        aria-hidden="true"
      >
        <span className="font-drift-display text-[34px] font-semibold text-white/55">
          {cover.placeholder.glyph}
        </span>
      </div>
    )
  }

  return (
    <>
      <OptimizedImg
        src={cover.url}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className={className}
      />
      {showCredit && cover.credit && (
        <span className="pointer-events-none absolute bottom-1 right-1.5 z-10 max-w-[85%] truncate rounded bg-black/45 px-1.5 py-0.5 text-[9px] leading-tight text-white/85">
          {cover.credit.text}
        </span>
      )}
    </>
  )
}
