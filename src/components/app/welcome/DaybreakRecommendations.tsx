"use client"

import { useEffect, useRef, useState } from "react"
import TripCoverImg from "@/components/app/TripCoverImg"
import type { DaybreakGuide } from "@/lib/drift/inspirePromo"
import { guideCaption } from "@/lib/drift/daybreakPresentation"
import { Cta, Question, Skip } from "./DaybreakSteps"

export default function DaybreakRecommendations({ guides, relaxed, previewId, onPreview, onNext, onBrowseAll }: {
  guides: DaybreakGuide[]; relaxed: "style" | "length" | "season" | "shape" | null
  previewId: string | null; onPreview: (id: string | null) => void; onNext: () => void; onBrowseAll: () => void
}) {
  const preview = guides.find(guide => guide.tripId === previewId)
  const root = useRef<HTMLDivElement>(null)
  const rail = useRef<HTMLDivElement>(null)
  const previousPreview = useRef<string | null>(null)
  const scrollPosition = useRef(0)
  const [active, setActive] = useState(0)
  const drag = useRef<{ x: number; scroll: number; moved: boolean } | null>(null)
  useEffect(() => {
    if (preview) root.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true })
    else if (previousPreview.current) {
      if (rail.current) rail.current.scrollLeft = scrollPosition.current
      const cards = root.current?.querySelectorAll<HTMLButtonElement>(".db-trip-open")
      Array.from(cards ?? []).find(card => card.dataset.tripId === previousPreview.current)?.focus({ preventScroll: true })
    }
    else root.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true })
    previousPreview.current = preview?.tripId ?? null
  }, [preview])
  useEffect(() => {
    if (!preview) return
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onPreview(null) }
    window.addEventListener("keydown", escape)
    return () => window.removeEventListener("keydown", escape)
  }, [preview, onPreview])
  function go(index: number) {
    const card = rail.current?.children[index] as HTMLElement | undefined
    if (rail.current && card) rail.current.scrollTo({ left: card.offsetLeft - rail.current.offsetLeft, behavior: "smooth" })
  }
  return <div ref={root} className="db-recommendations">
    {preview ? <article className="db-trip-preview">
      <div className="db-preview-photo"><TripCoverImg cover={preview.cover} alt={preview.title} sizes="(min-width: 900px) 50vw, 100vw" priority /></div>
      <div className="db-preview-copy"><p className="db-duration">{preview.days} days</p><h1 tabIndex={-1}>{preview.title}</h1><p className="db-preview-intro">{guideCaption(preview)}</p>
        <ol className="db-preview-stops">{preview.previewStops?.map((stop, index) => <li key={`${index}-${stop.name}`}><p className="db-duration">{stop.nights > 0 ? `${stop.nights} ${stop.nights === 1 ? "night" : "nights"}` : "Stop"}</p><h2>{stop.name}</h2>{stop.blurb && <p>{stop.blurb}</p>}</li>)}</ol>
        <a className="db-full-itinerary" href={preview.href} target="_blank" rel="noopener noreferrer">Read the full itinerary <span className="sr-only">(opens in a new tab)</span></a>
        <div className="db-footer"><Cta label="Make it mine" onClick={onNext} /><Skip label="Back to your escapes" onClick={() => onPreview(null)} /></div>
      </div>
    </article> : <>
      <Question autoFocus={false} title={guides.length ? "Your next escape" : "More escapes are on the way."} />
      {relaxed === "shape" && <p className="db-shelf-note">The closest trips to what you picked.</p>}
      {!guides.length && <p className="db-shelf-note">Browse all trips to find another starting point.</p>}
      <div ref={rail} className="db-trip-rail" role="region" aria-label="Recommended trips" onDragStart={event => event.preventDefault()}
        onScroll={event => { const el = event.currentTarget; scrollPosition.current = el.scrollLeft; const first = el.children[0] as HTMLElement | undefined; if (first) setActive(Math.max(0, Math.min(guides.length - 1, Math.round(el.scrollLeft / (first.offsetWidth + 16))))) }}
        onPointerDown={event => { if (event.pointerType === "mouse") drag.current = { x: event.clientX, scroll: event.currentTarget.scrollLeft, moved: false } }}
        onPointerMove={event => { const state = drag.current; if (!state || !event.buttons) return; if (Math.abs(event.clientX - state.x) > 8) { state.moved = true; event.currentTarget.scrollLeft = state.scroll - event.clientX + state.x } }}
        onClickCapture={event => { if (drag.current?.moved) { event.preventDefault(); event.stopPropagation() } drag.current = null }}>
        {guides.map((guide, index) => <article className="db-trip-card" key={guide.tripId}>
          <div className="db-trip-photo"><TripCoverImg cover={guide.cover} alt="" sizes="(min-width: 900px) 33vw, 85vw" priority={index === 0} /></div>
          <div className="db-trip-caption"><h2>{guide.title}</h2><p>{guideCaption(guide)}</p><span className="db-duration">{guide.days} days</span></div>
          <button className="db-trip-open" type="button" data-trip-id={guide.tripId} aria-label={`Preview ${guide.title}, ${guide.days} days`} onClick={() => onPreview(guide.tripId)} />
        </article>)}
      </div>
      {guides.length > 1 && <nav className="db-trip-dots" aria-label="Choose a trip">{guides.map((guide, index) => <button key={guide.tripId} type="button" aria-label={`Show ${guide.title}`} aria-current={active === index ? "true" : undefined} onClick={() => go(index)}><span /></button>)}</nav>}
      <div className="db-browse-all"><Skip label="Browse all trips" onClick={onBrowseAll} /></div>
    </>}
  </div>
}
