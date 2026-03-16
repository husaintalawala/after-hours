"use client"

import { useRef, useEffect, useState } from "react"
import type { Chapter, DayEntry } from "@/data/journey"
import dynamic from "next/dynamic"
const Filmstrip = dynamic(() => import("./Filmstrip"), { ssr: false })

function DayRow({ day, expanded }: { day: DayEntry; expanded: boolean }) {
  return (
    <div className="relative pl-6 pb-5 last:pb-0">
      <div className="absolute left-[3px] top-0 bottom-0 w-px" style={{ background: "rgba(255,255,255,0.06)" }} />
      <div className="absolute left-0 top-[6px] w-[7px] h-[7px] rounded-full" style={{ background: day.highlight ? "#f5f5f7" : "#424245" }} />
      <div className="flex items-baseline gap-3 mb-1">
        <span className="text-[13px] text-[#f5f5f7]">Day {day.day}</span>
        <span className="text-[11px] text-[#424245]">{day.date}</span>
      </div>
      <p className="text-[15px] font-light text-[#86868b] leading-relaxed m-0">
        {day.highlight && <span className="text-[#f5f5f7]">{day.highlight}</span>}
        {day.highlight && day.summary && <span className="text-[#424245]"> — </span>}
        {expanded ? day.summary : day.summary?.slice(0, 90) + (day.summary && day.summary.length > 90 ? "..." : "")}
      </p>
      {expanded && day.transit && (
        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-md" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <span className="text-[10px] tracking-wider text-[#6e6e73] uppercase">{day.transit.mode}</span>
          {day.transit.duration && <span className="text-[10px] text-[#424245]">·</span>}
          {day.transit.duration && <span className="text-[10px] text-[#6e6e73]">{day.transit.duration}</span>}
        </div>
      )}
      {expanded && day.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {day.tags.map((t, i) => (
            <span key={i} className="text-[10px] text-[#6e6e73] px-2 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.04)" }}>{t}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function Itinerary({ days }: { days: DayEntry[] }) {
  const [expanded, setExpanded] = useState(false)
  const preview = days.slice(0, 3), rest = days.slice(3)
  return (
    <div>
      <p className="text-[11px] tracking-[0.15em] text-[#6e6e73] uppercase mb-6">Itinerary</p>
      <div className="relative">
        {preview.map(d => <DayRow key={d.day} day={d} expanded={expanded} />)}
        <div className="overflow-hidden transition-all duration-500" style={{ maxHeight: expanded ? (rest.length * 120) + "px" : "0px", opacity: expanded ? 1 : 0 }}>
          {rest.map(d => <DayRow key={d.day} day={d} expanded={expanded} />)}
        </div>
        {!expanded && rest.length > 0 && <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-black pointer-events-none" />}
      </div>
      {rest.length > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] transition-all hover:scale-[1.02]"
          style={{ background: "#1d1d1f", color: "#c9a227" }}
        >
          <span>{expanded ? "Show less" : "Explore all " + days.length + " days"}</span>
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-[11px]"
            style={{ background: "#c9a227", color: "#000" }}
          >
            {expanded ? "−" : "+"}
          </span>
        </button>
      )}
    </div>
  )
}

interface ChapterCardProps { chapter: Chapter; index: number; isActive: boolean }

export default function ChapterCard({ chapter, index, isActive }: ChapterCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setIsVisible(true) }, { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div ref={ref} className={"w-full transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] " + (isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8")}>
      <Filmstrip photos={chapter.photos} videos={chapter.videos} chapterTitle={chapter.title} />
      <div className="max-w-[540px] mx-auto px-5 pt-10 pb-12">
        {chapter.description && (
          <p className="text-[17px] font-light text-[#d1d1d6] leading-[1.7] mb-10">{chapter.description}</p>
        )}
        {chapter.stats && chapter.stats.length > 0 && (
          <div className="flex gap-12 py-6 mb-10" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {chapter.stats.map((s, i) => (
              <div key={i}>
                <div className="text-[28px] font-light text-[#f5f5f7] tabular-nums" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif", letterSpacing: "-0.02em" }}>{s.value}</div>
                <div className="text-[10px] tracking-[0.15em] text-[#6e6e73] uppercase mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        )}
        {chapter.highlights.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-10">
            {chapter.highlights.map((h, i) => (
              <span key={i} className="text-[13px] text-[#86868b] px-3.5 py-1.5 rounded-full" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>{h}</span>
            ))}
          </div>
        )}
        {chapter.days && chapter.days.length > 0 && <Itinerary days={chapter.days} />}
      </div>
    </div>
  )
}
