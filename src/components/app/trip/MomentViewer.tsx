"use client"

import { useEffect, useRef } from "react"
import OptimizedImg from "@/components/app/OptimizedImg"

/**
 * Full-screen viewer for one Track moment's photos.
 *
 * Scoped to a SINGLE moment, not the whole trip: paging across moments would
 * quietly change which one the map has selected, and the selection being
 * trustworthy is the best thing about the Track screen.
 *
 * Mirrors MediaSection's overlay (same ground, same round back button) rather
 * than introducing a dialog library — there is no such dependency in the app.
 */
export default function MomentViewer({
  title,
  photos,
  index,
  onIndex,
  onClose,
}: {
  title: string
  photos: string[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const n = photos.length

  useEffect(() => {
    closeRef.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    // Bound to window, NOT the wrapper: clicking a non-focusable image moves
    // focus to <body>, and a div-level handler would silently stop firing.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        onIndex(Math.min(n - 1, index + 1))
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        onIndex(Math.max(0, index - 1))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [index, n, onIndex, onClose])

  const alt = `${title} — photo ${index + 1} of ${n}`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-[60] flex flex-col"
      style={{ background: "#08131D" }}
    >
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close photo"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-aurora-border bg-aurora-glass text-[17px] text-drift-ink outline-none focus-visible:ring-2 focus-visible:ring-drift-coral"
        >
          ←
        </button>
        <span className="truncate text-[15px] font-semibold">{title}</span>
        <span className="ml-auto shrink-0 text-[13px] tabular-nums text-drift-text-tertiary">
          {index + 1} / {n}
        </span>
      </div>

      {/* fill + object-contain letterboxes correctly with ZERO knowledge of the
          source aspect ratio — `media` carries no width/height columns. */}
      <div className="relative min-h-0 flex-1" onClick={onClose}>
        <OptimizedImg
          src={photos[index]}
          alt={alt}
          fill
          sizes="100vw"
          className="absolute inset-0 h-full w-full object-contain"
        />
        {n > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onIndex(Math.max(0, index - 1))
              }}
              disabled={index === 0}
              aria-label="Previous photo"
              className="absolute inset-y-0 left-0 grid w-16 place-items-center text-[28px] text-white/70 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-drift-coral disabled:opacity-25"
            >
              ‹
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onIndex(Math.min(n - 1, index + 1))
              }}
              disabled={index === n - 1}
              aria-label="Next photo"
              className="absolute inset-y-0 right-0 grid w-16 place-items-center text-[28px] text-white/70 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-drift-coral disabled:opacity-25"
            >
              ›
            </button>
          </>
        )}
      </div>

      {n > 1 && (
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {photos.map((u, i) => (
            <button
              key={i}
              onClick={() => onIndex(i)}
              aria-label={`Photo ${i + 1}`}
              aria-current={i === index ? "true" : undefined}
              className={`relative h-11 w-11 shrink-0 overflow-hidden rounded-md outline-none focus-visible:ring-2 focus-visible:ring-drift-coral ${
                i === index
                  ? "ring-2 ring-drift-coral ring-offset-2 ring-offset-aurora-midnight"
                  : "opacity-60 hover:opacity-100"
              }`}
            >
              <OptimizedImg
                src={u}
                alt=""
                fill
                sizes="44px"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
