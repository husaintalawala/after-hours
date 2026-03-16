"use client"

import { useRef, useEffect } from "react"
import type { Chapter } from "@/data/journey"

interface CityRevealProps {
  chapter: Chapter
  index: number
}

export default function CityReveal({ chapter, index }: CityRevealProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const metaRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const section = sectionRef.current
    const title = titleRef.current
    const meta = metaRef.current
    if (!section || !title || !meta) return

    const update = () => {
      const rect = section.getBoundingClientRect()
      const vh = window.innerHeight
      const progress = Math.min(Math.max(1 - (rect.top / vh), 0), 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const scale = 5 - eased * 4
      const opacity = 0.15 + eased * 0.85
      title.style.transform = "scale(" + scale + ")"
      title.style.opacity = "" + opacity
      const mp = Math.max(0, (progress - 0.7) / 0.3)
      const me = mp * mp * (3 - 2 * mp)
      meta.style.opacity = "" + me
      meta.style.transform = "translateY(" + ((1 - me) * 20) + "px)"
    }

    const onScroll = () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(update)
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    update()
    return () => {
      window.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const chapterNum = String(index + 1).padStart(2, "0")

  return (
    <div ref={sectionRef} className="h-screen flex flex-col items-center justify-center overflow-hidden">
      <div
        ref={titleRef}
        style={{
          transformOrigin: "center center",
          willChange: "transform, opacity",
          transform: "scale(5)",
          opacity: 0.15,
        }}
      >
        <h2
          className="font-display font-light tracking-tight text-center whitespace-nowrap select-none text-[#f5f5f7]"
          style={{ fontSize: "clamp(3rem, 10vw, 8rem)", lineHeight: 0.85, letterSpacing: "-0.02em" }}
        >
          {chapter.title}
        </h2>
      </div>
      <div
        ref={metaRef}
        className="flex flex-col items-center select-none"
        style={{
          opacity: 0,
          transform: "translateY(20px)",
          willChange: "transform, opacity",
          marginTop: "1.5rem",
        }}
      >
        <p className="font-mono text-[11px] tracking-[0.4em] text-[#6e6e73] uppercase mb-3">
          {chapterNum}
        </p>
        <p className="font-display italic text-center" style={{ fontSize: "clamp(1rem, 2vw, 1.25rem)", color: "#86868b" }}>
          {chapter.subtitle}
        </p>
        <p className="font-mono text-[10px] tracking-[0.15em] text-[#424245] uppercase mt-2">
          {chapter.dates}
        </p>
        {chapter.isPeak && (
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 mt-3 text-[11px] tracking-wider uppercase rounded-full"
            style={{
              background: "rgba(255,255,255,0.06)",
              color: "#f5f5f7",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <span>✦</span>
            <span>{chapter.peakLabel || "Peak Moment"}</span>
          </div>
        )}
      </div>
    </div>
  )
}
