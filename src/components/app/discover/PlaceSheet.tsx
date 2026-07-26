"use client"

import { useEffect, useRef, useState } from "react"
import type { DiscoverResult } from "@/lib/drift/discover"
import {
  fetchPlaceDetailsClient,
  placePhotoUrlClient,
  type PlaceDetailsLite,
} from "@/lib/drift/placeDetailsClient"

// Apple Maps–style place sheet. Mobile: a draggable bottom sheet with peek/half/
// full detents and an iOS spring; desktop: a centered modal. Both share one
// content body. Opens with the DiscoverResult data immediately, then lazily
// hydrates rich details (photos, hours, reviews, overview) for Google POIs.

const SPRING = "transform 0.44s cubic-bezier(0.32, 0.72, 0, 1)"

export default function PlaceSheet({
  poi,
  distanceLabel,
  onClose,
  onAdd,
}: {
  poi: DiscoverResult
  distanceLabel: string | null
  onClose: () => void
  onAdd: () => void
}) {
  const [vh] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 800))
  const [vw] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 390))
  const isDesktop = vw >= 1024

  // ----- detents (mobile) -----
  const FULL = Math.round(vh * 0.92)
  const HALF = Math.round(vh * 0.54)
  const PEEK = 236
  const offFull = 0
  const offHalf = FULL - HALF
  const offPeek = FULL - PEEK

  const [ty, setTy] = useState(FULL) // start hidden below, animate up on mount
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ y0: number; ty0: number } | null>(null)

  useEffect(() => {
    if (isDesktop) return
    const id = requestAnimationFrame(() => setTy(offHalf))
    return () => cancelAnimationFrame(id)
  }, [offHalf, isDesktop])

  // ----- lazy rich details (Google POIs) -----
  const [details, setDetails] = useState<PlaceDetailsLite | null>(null)
  const isGoogle =
    poi.source === "google" && !poi.id.startsWith("osm:") && !poi.id.startsWith("geonames:")
  useEffect(() => {
    if (!isGoogle) return
    let alive = true
    fetchPlaceDetailsClient(poi.id).then((d) => alive && setDetails(d))
    return () => {
      alive = false
    }
  }, [poi.id, isGoogle])

  function close() {
    if (isDesktop) return onClose()
    setDragging(false)
    setTy(FULL + 48)
    window.setTimeout(onClose, 300)
  }
  function onDown(e: React.PointerEvent) {
    drag.current = { y0: e.clientY, ty0: ty }
    setDragging(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  function onMove(e: React.PointerEvent) {
    if (!drag.current) return
    setTy(Math.max(0, Math.min(offPeek + 90, drag.current.ty0 + (e.clientY - drag.current.y0))))
  }
  function onUp() {
    if (!drag.current) return
    drag.current = null
    if (ty > offPeek + 40) return close()
    const nearest = [offFull, offHalf, offPeek].reduce((a, b) =>
      Math.abs(b - ty) < Math.abs(a - ty) ? b : a
    )
    setDragging(false)
    setTy(nearest)
  }

  const scrim = Math.max(0, Math.min(0.55, 0.55 * (1 - (ty - offFull) / (offPeek - offFull))))

  // ----- resolved content (details override the card's fields when present) -----
  const [saved, setSaved] = useState(false)
  const photos = details?.photoNames?.length
    ? details.photoNames.map((n) => placePhotoUrlClient(n, 900))
    : poi.photo
      ? [poi.photo]
      : []
  const category = details?.typeLabel ?? (poi.subtitle ? humanize(poi.subtitle) : null)
  const rating = details?.rating ?? poi.rating
  const ratingCount = details?.ratingCount ?? poi.reviewCount
  const address = details?.address ?? poi.address
  const overview = details?.summary ?? poi.description
  const metaLine = [category, distanceLabel].filter(Boolean).join(" · ")
  const directionsUrl =
    details?.mapsUri ??
    (poi.lat != null && poi.lng != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(poi.name)}`)
  const askUrl = `/app/chats?ask=${encodeURIComponent(`Tell me about ${poi.name}`)}`

  const header = (
    <div className="px-5 pt-1">
      <div className="flex items-start gap-3">
        <h2 className="min-w-0 flex-1 font-drift-display text-[24px] font-semibold leading-tight tracking-tight text-aurora-ink">
          {poi.name}
        </h2>
        <button
          onClick={close}
          aria-label="Close"
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[15px] text-aurora-ink"
        >
          ✕
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]">
        {rating != null && rating > 0 && (
          <span className="flex items-center gap-1">
            <span style={{ color: "#E7A24B" }}>★</span>
            <span className="font-semibold text-aurora-ink">{rating.toFixed(1)}</span>
            {ratingCount ? (
              <span className="text-drift-text-tertiary">({ratingCount.toLocaleString()})</span>
            ) : null}
          </span>
        )}
        {metaLine && (
          <span className="text-drift-muted">
            {rating != null && rating > 0 ? "· " : ""}
            {metaLine}
          </span>
        )}
        {details?.openNow != null && (
          <span
            className={`font-semibold ${details.openNow ? "text-emerald-400" : "text-drift-coral"}`}
          >
            · {details.openNow ? "Open now" : "Closed"}
          </span>
        )}
      </div>
    </div>
  )

  const actions = (
    <div className="mt-3.5 flex items-stretch gap-2 px-5">
      <ActionBtn label="Directions" href={directionsUrl} primary>
        <path d="M12 2l4 8-4-2-4 2z" />
        <path d="M12 8v14" />
      </ActionBtn>
      <ActionBtn label={saved ? "Saved" : "Save"} onClick={() => setSaved((v) => !v)} active={saved}>
        <path d="M12 21s-7-4.6-9.3-9A5 5 0 0 1 12 6a5 5 0 0 1 9.3 6c-2.3 4.4-9.3 9-9.3 9z" />
      </ActionBtn>
      <ActionBtn label="Add" onClick={onAdd}>
        <path d="M12 5v14M5 12h14" />
      </ActionBtn>
      <ActionBtn label="Ask Drift" href={askUrl}>
        <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" />
      </ActionBtn>
    </div>
  )

  const scrollBody = (
    <div className="space-y-6 px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-5">
      {photos.length > 0 && (
        <div className="-mx-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {photos.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt=""
              loading={i === 0 ? "eager" : "lazy"}
              className="h-52 w-[300px] shrink-0 snap-start rounded-2xl object-cover"
            />
          ))}
        </div>
      )}

      {overview && (
        <p className="text-[14.5px] leading-relaxed text-aurora-ink/90">{overview}</p>
      )}

      {address && (
        <a
          href={directionsUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5"
        >
          <span className="mt-0.5 text-[16px] text-drift-coral">📍</span>
          <span className="min-w-0 flex-1 text-[13.5px] leading-snug text-aurora-ink/85">{address}</span>
          <span className="text-[13px] font-semibold text-drift-coral">Directions</span>
        </a>
      )}

      {details && details.hours.length > 0 && (
        <section>
          <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-drift-text-tertiary">
            Hours
          </h3>
          <div className="space-y-1">
            {details.hours.map((h, i) => {
              const [day, ...rest] = h.split(": ")
              return (
                <div key={i} className="flex justify-between text-[13px]">
                  <span className="text-drift-muted">{day}</span>
                  <span className="text-aurora-ink/85">{rest.join(": ")}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {details && details.reviews.length > 0 && (
        <section>
          <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-drift-text-tertiary">
            Reviews
          </h3>
          <div className="space-y-2.5">
            {details.reviews.map((r, i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
                <div className="flex items-center gap-2 text-[12.5px]">
                  <span style={{ color: "#E7A24B" }}>
                    {"★".repeat(Math.round(r.rating ?? 0)) || "★"}
                  </span>
                  <span className="font-semibold text-aurora-ink">{r.author}</span>
                  <span className="text-drift-text-tertiary">· {r.when}</span>
                </div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-aurora-ink/80 line-clamp-4">
                  {r.text}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {isGoogle && !details && (
        <p className="text-center text-[13px] text-drift-text-tertiary">Loading details…</p>
      )}
    </div>
  )

  // ---------- desktop: centered modal ----------
  if (isDesktop) {
    return (
      <div className="fixed inset-0 z-[95] flex items-center justify-center lg:left-[76px]">
        <div className="absolute inset-0 bg-black/55" onClick={onClose} />
        <div className="relative flex max-h-[86vh] w-[460px] flex-col overflow-hidden rounded-[24px] border border-white/12 bg-[#0E1A24] shadow-[0_30px_80px_-24px_rgba(0,0,0,0.85)]">
          <div className="shrink-0 pt-5">
            {header}
            {actions}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{scrollBody}</div>
        </div>
      </div>
    )
  }

  // ---------- mobile: draggable bottom sheet ----------
  return (
    <div className="fixed inset-0 z-[95]">
      <div
        className="absolute inset-0 bg-black"
        style={{ opacity: scrim, transition: dragging ? "none" : "opacity 0.44s" }}
        onClick={close}
      />
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-[22px] border-t border-white/12 bg-[#0E1A24] shadow-[0_-24px_60px_-20px_rgba(0,0,0,0.85)]"
        style={{ height: FULL, transform: `translateY(${ty}px)`, transition: dragging ? "none" : SPRING }}
      >
        {/* drag handle: grabber + header + actions */}
        <div
          className="shrink-0 touch-none select-none pt-2.5"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <div className="mb-2 flex justify-center">
            <span className="h-1 w-9 rounded-full bg-white/25" />
          </div>
          {header}
          {actions}
          <div className="mt-3 h-px bg-white/8" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{scrollBody}</div>
      </div>
    </div>
  )
}

// A circular action button with a label beneath it (Apple Maps place-card style).
function ActionBtn({
  label,
  href,
  onClick,
  primary,
  active,
  children,
}: {
  label: string
  href?: string
  onClick?: () => void
  primary?: boolean
  active?: boolean
  children: React.ReactNode
}) {
  const ring = primary
    ? "bg-drift-coral text-white"
    : active
      ? "bg-drift-coral/20 text-drift-coral ring-1 ring-drift-coral/40"
      : "bg-white/10 text-aurora-ink"
  const inner = (
    <span className="flex flex-col items-center gap-1.5">
      <span className={`flex h-11 w-11 items-center justify-center rounded-full ${ring}`}>
        <svg
          viewBox="0 0 24 24"
          className="h-[19px] w-[19px]"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {children}
        </svg>
      </span>
      <span className="text-[11px] font-medium text-drift-muted">{label}</span>
    </span>
  )
  return href ? (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="flex-1">
      {inner}
    </a>
  ) : (
    <button onClick={onClick} className="flex-1">
      {inner}
    </button>
  )
}

function humanize(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 40)
}
