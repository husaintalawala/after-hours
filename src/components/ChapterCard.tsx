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
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md mt-1.5" style={{ background: "rgba(201,162,39,0.06)", border: "1px solid rgba(201,162,39,0.12)" }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#c9a227" strokeWidth="2.5"><path d="M12 2L2 22h20L12 2z"/></svg>
      <span className="text-[10px] font-medium" style={{ color: "#c9a227", letterSpacing: "0.03em" }}>{elevation.toLocaleString()} ft</span>
    </div>
  )
}

function TransitBadge({ transit }: { transit: { mode: string; from: string; to: string; duration?: string } }) {
  const parts = []
  parts.push(transit.mode)
  if (transit.duration) parts.push(transit.duration)
  const label = parts.join(" · ")
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md mt-1.5" style={{ background: "rgba(133,183,235,0.06)", border: "1px solid rgba(133,183,235,0.1)" }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#85B7EB" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h4l3-8 4 16 3-8h6"/></svg>
      <span className="text-[10px]" style={{ color: "#85B7EB" }}>{label}</span>
    </div>
  )
}

function DayRow({ day, expanded }: { day: DayEntry; expanded: boolean }) {
  const isHighlight = !!day.highlight
  const isPeak = day.tags.includes("peak")
  return (
    <div className="relative pl-5 pb-5 last:pb-0">
      <div className="absolute left-[3px] top-0 bottom-0 w-px" style={{ background: "rgba(255,255,255,0.04)" }} />
      <div className="absolute rounded-full" style={{
        left: isHighlight ? "-1px" : "0px",
        top: "6px",
        width: isHighlight ? "7px" : "5px",
        height: isHighlight ? "7px" : "5px",
        background: isHighlight ? "#f5f5f7" : "#424245",
        boxShadow: isHighlight ? "0 0 6px rgba(245,245,247,0.25)" : "none",
      }} />
      <div className="flex items-baseline gap-2 mb-0.5">
        <span className={"text-[12px] " + (isHighlight ? "text-[#f5f5f7] font-medium" : "text-[#6e6e73]")}>Day {day.day} · {day.date}</span>
        {isPeak && <span className="text-[9px] font-medium uppercase" style={{ color: "#c9a227", letterSpacing: "0.1em" }}>Peak</span>}
      </div>
      <p className={"text-[14px] font-light leading-relaxed m-0 " + (isHighlight ? "text-[#f5f5f7]" : "text-[#86868b]")}>
        {day.highlight && <span className="text-[#f5f5f7] font-normal">{day.highlight}</span>}
        {day.highlight && day.summary && <span className="text-[#424245]"> — </span>}
        {expanded ? day.summary : day.summary?.slice(0, 100) + (day.summary && day.summary.length > 100 ? "..." : "")}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {day.elevation && <ElevationBadge elevation={day.elevation} />}
        {day.transit && <TransitBadge transit={day.transit} />}
      </div>
      {expanded && day.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {day.tags.map((t, i) => {
            const c = TAG_COLORS[t] || TAG_COLORS["culture"]
            return <span key={i} className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: c.text, background: c.bg, border: "1px solid " + c.border }}>{t}</span>
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
    <div>
      <p className="text-[10px] tracking-[0.15em] text-[#6e6e73] uppercase mb-4">Itinerary</p>
      <div className="relative">
        {preview.map(d => <DayRow key={d.day} day={d} expanded={expanded} />)}
        <div className="overflow-hidden transition-all duration-500" style={{ maxHeight: expanded ? (rest.length * 150) + "px" : "0px", opacity: expanded ? 1 : 0 }}>
          {rest.map(d => <DayRow key={d.day} day={d} expanded={expanded} />)}
        </div>
        {!expanded && rest.length > 0 && <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-black pointer-events-none" />}
      </div>
      {rest.length > 0 && (
        <button onClick={() => setExpanded(!expanded)} className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] transition-all hover:scale-[1.02]" style={{ background: "#1d1d1f", color: "#c9a227" }}>
          <span>{expanded ? "Show less" : "Explore all " + days.length + " days"}</span>
          <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[11px]" style={{ background: "#c9a227", color: "#000" }}>{expanded ? "−" : "+"}</span>
        </button>
      )}
    </div>
  )
}

function LightDayEntry({ day }: { day: DayEntry }) {
  return (
    <div className="flex items-center gap-3 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(133,183,235,0.1)" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#85B7EB" strokeWidth="1.5"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
      </div>
      <div className="flex-1">
        <div className="text-[13px] text-[#f5f5f7]">{day.summary}</div>
        <div className="text-[11px] text-[#424245]">Day {day.day} · {day.date}{day.transit?.duration ? " · " + day.transit.duration : ""}</div>
      </div>
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

  const dayCount = chapter.days?.length || 0
  const hasStats = chapter.stats && chapter.stats.length > 0
  const tier = dayCount <= 2 ? "light" : dayCount <= 5 ? "medium" : "rich"

  return (
    <div ref={ref} className={"w-full transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] " + (isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6")}>

      {tier === "light" ? (
        <>
          <Filmstrip photos={chapter.photos} videos={chapter.videos} chapterTitle={chapter.title} />
          <div className="max-w-[480px] mx-auto px-5 pt-6 pb-10">
            {chapter.highlights.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {chapter.highlights.map((h, i) => <span key={i} className="text-[12px] text-[#86868b] px-3 py-1 rounded-full" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>{h}</span>)}
              </div>
            )}
            {chapter.days && chapter.days.map(d => <LightDayEntry key={d.day} day={d} />)}
          </div>
        </>
      ) : (
        <>
          {hasStats && (
            <div className="max-w-[480px] mx-auto px-5 pb-6">
              <div className="flex gap-8 py-5" style={{ borderTop: "1px solid rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                {chapter.stats!.map((s, i) => (
                  <div key={i}>
                    <div className="text-[26px] font-light text-[#f5f5f7] tabular-nums" style={{ letterSpacing: "-0.02em" }}>{s.value}</div>
                    <div className="text-[9px] tracking-[0.15em] text-[#6e6e73] uppercase mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {chapter.highlights.length > 0 && (
            <div className="max-w-[480px] mx-auto px-5 pb-5">
              <div className="flex flex-wrap gap-1.5">
                {chapter.highlights.map((h, i) => <span key={i} className="text-[12px] text-[#86868b] px-3 py-1 rounded-full" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>{h}</span>)}
              </div>
            </div>
          )}
          <Filmstrip photos={chapter.photos} videos={chapter.videos} chapterTitle={chapter.title} />
          <div className="max-w-[480px] mx-auto px-5 pt-6 pb-10">
            {chapter.days && chapter.days.length > 0 && <Itinerary days={chapter.days} />}
          </div>
        </>
      )}
    </div>
  )
}
