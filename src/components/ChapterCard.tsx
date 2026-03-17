"use client"

import { useRef, useEffect, useState } from "react"
import type { Chapter, DayEntry } from "@/data/journey"
import dynamic from "next/dynamic"
const Filmstrip = dynamic(() => import("./Filmstrip"), { ssr: false })

const TAG_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  food: { text: "#EF9F27", bg: "rgba(239,159,39,0.08)", border: "rgba(239,159,39,0.15)" },
  culture: { text: "#86868b", bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.06)" },
  nature: { text: "#5DCAA5", bg: "rgba(93,202,165,0.08)", border: "rgba(93,202,165,0.12)" },
  adventure: { text: "#5DCAA5", bg: "rgba(93,202,165,0.08)", border: "rgba(93,202,165,0.12)" },
  transit: { text: "#85B7EB", bg: "rgba(133,183,235,0.08)", border: "rgba(133,183,235,0.12)" },
  rest: { text: "#86868b", bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.06)" },
  peak: { text: "#c9a227", bg: "rgba(201,162,39,0.08)", border: "rgba(201,162,39,0.15)" },
  family: { text: "#ED93B1", bg: "rgba(237,147,177,0.08)", border: "rgba(237,147,177,0.12)" },
}

function ElevationBadge({ elevation }: { elevation: number }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md mt-1.5" style={{ background: "rgba(201,162,39,0.08)", border: "1px solid rgba(201,162,39,0.15)" }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#c9a227" strokeWidth="2.5"><path d="M12 2L2 22h20L12 2z"/></svg>
      <span className="text-[11px] font-medium" style={{ color: "#c9a227", letterSpacing: "0.03em" }}>{elevation.toLocaleString()} ft</span>
    </div>
  )
}

function TransitCard({ transit }: { transit: { mode: string; from: string; to: string; duration?: string } }) {
  const hasRoute = transit.from && transit.from !== "\u2014" && transit.to && transit.to !== "\u2014"
  if (!hasRoute && !transit.duration) return null
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg mt-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6e6e73" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h4l3-8 4 16 3-8h6"/></svg>
      <div>
        <div className="text-[11px] text-[#86868b]" style={{ letterSpacing: "0.03em" }}>{transit.mode}</div>
        {transit.duration && <div className="text-[10px] text-[#424245]">{transit.duration}</div>}
      </div>
    </div>
  )
}

function DayRow({ day, expanded }: { day: DayEntry; expanded: boolean }) {
  const isHighlight = !!day.highlight
  const isPeak = day.tags.includes("peak")

  return (
    <div className="relative pl-7 pb-6 last:pb-0">
      <div className="absolute left-[3px] top-0 bottom-0 w-px" style={{ background: "rgba(255,255,255,0.06)" }} />
      <div className="absolute top-[5px] rounded-full" style={{
        left: isHighlight ? "-1px" : "0px",
        width: isHighlight ? "9px" : "7px",
        height: isHighlight ? "9px" : "7px",
        background: isHighlight ? "#f5f5f7" : "#424245",
        boxShadow: isHighlight ? "0 0 8px rgba(245,245,247,0.3)" : "none",
      }} />
      <div className="flex items-baseline gap-2.5 mb-1">
        <span className={"text-[13px] " + (isHighlight ? "text-[#f5f5f7] font-medium" : "text-[#f5f5f7]")}>Day {day.day}</span>
        <span className="text-[11px] text-[#424245]">{day.date}</span>
        {isPeak && <span className="text-[10px] font-medium uppercase" style={{ color: "#c9a227", letterSpacing: "0.1em" }}>Peak</span>}
      </div>
      <p className={"text-[15px] font-light leading-relaxed m-0 " + (isHighlight ? "text-[#f5f5f7]" : "text-[#86868b]")}>
        {day.highlight && <span className="text-[#f5f5f7] font-normal">{day.highlight}</span>}
        {day.highlight && day.summary && <span className="text-[#424245]"> \u2014 </span>}
        {expanded ? day.summary : day.summary?.slice(0, 90) + (day.summary && day.summary.length > 90 ? "..." : "")}
      </p>
      {day.elevation && <ElevationBadge elevation={day.elevation} />}
      {day.transit && <TransitCard transit={day.transit} />}
      {expanded && day.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {day.tags.map((t, i) => {
            const c = TAG_COLORS[t] || TAG_COLORS["culture"]
            return <span key={i} className="text-[10px] px-2 py-0.5 rounded" style={{ color: c.text, background: c.bg, border: "1px solid " + c.border }}>{t}</span>
          })}
        </div>
      )}
    </div>
  )
}

function Itinerary({ days }: { days: DayEntry[] }) {
  const [expanded, setExpanded] = useState(false)
  const preview = days.slice(0, 3)
  const rest = days.slice(3)
  return (
    <div className="mt-10">
      <p className="text-[11px] tracking-[0.15em] text-[#6e6e73] uppercase mb-6">Itinerary</p>
      <div className="relative">
        {preview.map(d => <DayRow key={d.day} day={d} expanded={expanded} />)}
        <div className="overflow-hidden transition-all duration-500" style={{ maxHeight: expanded ? (rest.length * 150) + "px" : "0px", opacity: expanded ? 1 : 0 }}>
          {rest.map(d => <DayRow key={d.day} day={d} expanded={expanded} />)}
        </div>
        {!expanded && rest.length > 0 && <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-black/80 pointer-events-none" />}
      </div>
      {rest.length > 0 && (
        <button onClick={() => setExpanded(!expanded)} className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] transition-all hover:scale-[1.02]" style={{ background: "#1d1d1f", color: "#c9a227" }}>
          <span>{expanded ? "Show less" : "Explore all " + days.length + " days"}</span>
          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px]" style={{ background: "#c9a227", color: "#000" }}>{expanded ? "\u2212" : "+"}</span>
        </button>
      )}
    </div>
  )
}

interface ChapterCardProps { chapter: Chapter; index: number; isActive: boolean }

export default function ChapterCard({ chapter, index, isActive }: ChapterCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setIsVisible(true) }, { threshold: 0.15 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  const isLeft = true
  const alignment = "mx-auto"
  const coordStr = chapter.coordinates.lat.toFixed(4) + "\u00b0N " + Math.abs(chapter.coordinates.lng).toFixed(4) + "\u00b0" + (chapter.coordinates.lng >= 0 ? "E" : "W")
  return (
    <div ref={cardRef} className={"chapter-card p-6 md:p-8 max-w-lg w-full transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] " + alignment + " " + (isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-x-8 translate-y-4")}>
      {chapter.isPeak && (
        <div className="inline-flex items-center gap-1.5 px-3 py-1 mb-4 text-[11px] tracking-wider uppercase rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "#f5f5f7", border: "1px solid rgba(255,255,255,0.1)" }}>
          <span>\u2726</span><span>{chapter.peakLabel || "Peak Moment"}</span>
        </div>
      )}
      <div className="flex items-baseline justify-between mb-3">
        <span className="font-mono text-[10px] tracking-[0.3em] text-[#6e6e73] uppercase">Chapter {String(index + 1).padStart(2, "0")}</span>
        <span className="font-mono text-[9px] tracking-wider text-[#424245]">{coordStr}</span>
      </div>
      <h2 className="text-4xl md:text-5xl font-display font-light text-[#f5f5f7] tracking-tight mb-1">{chapter.title}</h2>
      <p className="text-lg font-display italic text-[#86868b] mb-2">{chapter.subtitle}</p>
      <div className="font-mono text-[10px] tracking-wider text-[#424245] uppercase mb-6">{chapter.dates}</div>
      {chapter.description && <p className="text-[20px] font-display italic text-[#86868b] leading-[1.6] mb-8">{chapter.description}</p>}
      {chapter.stats && chapter.stats.length > 0 && (
        <div className="flex gap-8 mb-6">{chapter.stats.map((s, i) => (<div key={i}><div className="text-2xl font-display text-[#f5f5f7] tabular-nums">{s.value}</div><div className="text-[9px] font-mono tracking-wider text-[#6e6e73] uppercase">{s.label}</div></div>))}</div>
      )}
      {chapter.highlights.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">{chapter.highlights.map((h, i) => <span key={i} className="text-[13px] text-[#86868b] px-3.5 py-1.5 rounded-full" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>{h}</span>)}</div>
      )}
      <Filmstrip photos={chapter.photos} videos={chapter.videos} chapterTitle={chapter.title} />
      {chapter.days && chapter.days.length > 0 && <Itinerary days={chapter.days} />}
    </div>
  )
}
