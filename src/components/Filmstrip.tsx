"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import { MEDIA_BASE } from "@/data/journey"

const API_BASE = "https://after-hours-api.after-hours-media.workers.dev"

interface MediaItem { src: string; type: "photo" | "video"; caption?: string }
interface FilmstripProps { photos: string[]; videos: { src: string; start?: number; end?: number; caption?: string }[]; chapterTitle: string }

export default function Filmstrip({ photos, videos, chapterTitle }: FilmstripProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map())
  const [focusIndex, setFocusIndex] = useState(0)
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const unmutedSet = useRef<Set<number>>(new Set())

  useEffect(() => {
    const staticMedia: MediaItem[] = [
      ...photos.map(src => ({ src: MEDIA_BASE + "/" + src, type: "photo" as const })),
      ...videos.map(v => ({ src: MEDIA_BASE + "/" + v.src, type: "video" as const, caption: v.caption })),
    ]
    setMediaItems(staticMedia)

    const folder = chapterTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
    fetch(API_BASE + "/api/media?prefix=" + encodeURIComponent(folder) + "/")
      .then(r => r.json())
      .then(data => {
        if (data.files && data.files.length > 0) {
          const items = data.files.filter((f: any) => f.size > 0).map((f: any) => ({
            src: MEDIA_BASE + "/" + f.key,
            type: (f.type === "video" ? "video" : "photo") as "photo" | "video",
            caption: f.type === "video" ? f.key.split("/").pop()?.replace(/\\.[^.]+$/, "").replace(/[_-]/g, " ") : undefined,
          }))
          if (items.length > 0) setMediaItems(items)
        }
      })
      .catch(() => {})
  }, [chapterTitle, photos, videos])

  const updateFocus = useCallback(() => {
    if (!scrollRef.current) return
    const container = scrollRef.current
    const containerCenter = container.scrollLeft + container.clientWidth / 2
    let closest = 0
    let closestDist = Infinity
    const children = container.children
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement
      const childCenter = child.offsetLeft + child.offsetWidth / 2
      const dist = Math.abs(containerCenter - childCenter)
      if (dist < closestDist) {
        closestDist = dist
        closest = i
      }
    }
    setFocusIndex(closest)
  }, [mediaItems.length])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let ticking = false
    const onScroll = () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(() => { updateFocus(); ticking = false })
      }
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    requestAnimationFrame(() => updateFocus())
    return () => el.removeEventListener("scroll", onScroll)
  }, [updateFocus])

  useEffect(() => {
    videoRefs.current.forEach((vid, key) => {
      try {
        if (key === focusIndex) {
          vid.play().catch(() => {})
          if (unmutedSet.current.has(key)) { vid.muted = false }
        } else {
          vid.muted = true
        }
      } catch(e) {}
    })
  }, [focusIndex])

  const handleTap = useCallback((i: number) => {
    const vid = videoRefs.current.get(i)
    if (vid) {
      if (vid.muted) {
        vid.muted = false
        unmutedSet.current.add(i)
      } else {
        vid.muted = true
        unmutedSet.current.delete(i)
      }
      vid.play().catch(() => {})
    }
  }, [])

  if (mediaItems.length === 0) return null

  const CW = 220

  return (
    <div className="mt-5" style={{ marginLeft: "calc(-50vw + 50%)", marginRight: "calc(-50vw + 50%)", width: "100vw" }}>
      <div className="flex items-center gap-3 px-6 md:px-8 mb-3">
        <span className="text-[10px] font-mono tracking-[0.2em] text-[#424245] uppercase">Gallery</span>
        <span className="flex-1 h-px bg-white/[0.06]" />
        <span className="text-[10px] font-mono text-[#424245]">{mediaItems.length}</span>
      </div>
      <div
        ref={scrollRef}
        style={{
          display: "flex",
          gap: "12px",
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          paddingLeft: "calc(50vw - " + (CW / 2) + "px)",
          paddingRight: "calc(50vw - " + (CW / 2) + "px)",
          paddingBottom: "1.5rem",
        }}
      >
        {mediaItems.map((item, i) => {
          const f = i === focusIndex
          const isVideo = item.type === "video"
          return (
            <div
              key={i}
              className="flex-shrink-0 relative overflow-hidden"
              onClick={() => isVideo && handleTap(i)}
              style={{
                width: CW + "px",
                height: "300px",
                scrollSnapAlign: "center",
                borderRadius: "10px",
                border: f ? "1.5px solid rgba(255,255,255,0.15)" : "1px solid rgba(255,255,255,0.04)",
                opacity: f ? 1 : 0.4,
                transition: "opacity 0.3s ease, border-color 0.3s ease",
                cursor: isVideo ? "pointer" : "default",
              }}
            >
              {isVideo ? (
                <video
                  ref={el => { if (el) videoRefs.current.set(i, el); else videoRefs.current.delete(i) }}
                  src={item.src}
                  className="w-full h-full object-cover pointer-events-none"
                  autoPlay muted loop playsInline
                />
              ) : (
                <img src={item.src} alt={chapterTitle + " " + (i+1)} className="w-full h-full object-cover" draggable={false} loading="lazy" />
              )}
              {item.caption && f && (
                <div className="absolute bottom-0 left-0 right-0 p-3" style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.85))" }}>
                  <p className="text-[10px] font-mono text-[#86868b]">{item.caption}</p>
                </div>
              )}
              <div className="absolute top-2 right-2.5 text-[8px] font-mono" style={{ color: f ? "rgba(245,245,247,0.4)" : "rgba(255,255,255,0.06)" }}>
                {String(i + 1).padStart(2, "0")}
              </div>
            </div>
          )
        })}
      </div>
      <div className="text-center mt-1">
        <span className="text-[9px] font-mono text-[#424245]">{Math.max(focusIndex + 1, 1)} / {mediaItems.length}</span>
      </div>
    </div>
  )
}
