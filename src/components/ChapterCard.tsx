'use client'

import { useRef, useEffect, useState } from 'react'
import type { Chapter, TagCategory, DayEntry } from '@/data/journey'
import dynamic from 'next/dynamic'
const Filmstrip = dynamic(() => import('./Filmstrip'), { ssr: false })

function DayRow({ day, expanded }: { day: DayEntry; expanded: boolean }) {
  return (
    <div className="relative pl-6 pb-5 last:pb-0">
      <div className="absolute left-[7px] top-0 bottom-0 w-px bg-[#1d1d1f]" />
      <div className="absolute left-[4px] top-[6px] w-[7px] h-[7px] rounded-full" style={{ background: day.highlight ? '#f5f5f7' : '#333' }} />
      <div className="flex items-baseline gap-3 mb-1">
        <span className="text-[12px] text-[#86868b] tabular-nums">Day {day.day}</span>
        <span className="text-[11px] text-[#424245]">{day.date}</span>
      </div>
      <p className="text-[15px] font-light text-[#86868b] leading-relaxed">
        {day.highlight && <span className="text-[#f5f5f7]">{day.highlight}</span>}
        {day.highlight && day.summary && <span className="text-[#424245]"> — </span>}
        {expanded ? day.summary : day.summary?.slice(0, 90) + (day.summary && day.summary.length > 90 ? '...' : '')}
      </p>
      {expanded && day.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">{day.tags.map((t, i) => <span key={i} className="text-[11px] text-[#6e6e73]">{t}</span>)}</div>
      )}
    </div>
  )
}

function Itinerary({ days }: { days: DayEntry[] }) {
  const [expanded, setExpanded] = useState(false)
  const preview = days.slice(0, 3), rest = days.slice(3)
  return (
    <div className="mt-10">
      <p className="text-[12px] tracking-[0.1em] text-[#6e6e73] uppercase mb-6">Itinerary · {days.length} days</p>
      <div className="relative">
        {preview.map(d => <DayRow key={d.day} day={d} expanded={expanded} />)}
        <div className="overflow-hidden transition-all duration-500" style={{ maxHeight: expanded ? `${rest.length * 100}px` : '0px', opacity: expanded ? 1 : 0 }}>
          {rest.map(d => <DayRow key={d.day} day={d} expanded={expanded} />)}
        </div>
        {!expanded && rest.length > 0 && <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-black/80 pointer-events-none" />}
      </div>
      {rest.length > 0 && (
        <button onClick={() => setExpanded(!expanded)} className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] transition-all hover:scale-[1.02]" style={{ background: '#1d1d1f', color: '#c9a227' }}>
          <span>{expanded ? 'Show less' : `Explore all ${days.length} days`}</span>
          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px]" style={{ background: '#c9a227', color: '#000' }}>{expanded ? '−' : '+'}</span>
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
  const coordStr = `${chapter.coordinates.lat.toFixed(4)}°N ${Math.abs(chapter.coordinates.lng).toFixed(4)}°${chapter.coordinates.lng >= 0 ? 'E' : 'W'}`
  return (
    <div ref={cardRef} className={`chapter-card p-6 md:p-8 max-w-lg w-full transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${alignment} ${isVisible ? 'opacity-100 translate-y-0' : isLeft ? 'opacity-0 -translate-x-8 translate-y-4' : 'opacity-0 translate-x-8 translate-y-4'}`}>
      {chapter.isPeak && (
        <div className="inline-flex items-center gap-1.5 px-3 py-1 mb-4 text-[11px] tracking-wider uppercase rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: '#f5f5f7', border: '1px solid rgba(255,255,255,0.1)' }}>
          <span>✦</span><span>{chapter.peakLabel || 'Peak Moment'}</span>
        </div>
      )}
      <div className="flex items-baseline justify-between mb-3">
        <span className="font-mono text-[10px] tracking-[0.3em] text-[#6e6e73] uppercase">Chapter {String(index + 1).padStart(2, '0')}</span>
        <span className="font-mono text-[9px] tracking-wider text-[#424245]">{coordStr}</span>
      </div>
      <h2 className="text-4xl md:text-5xl font-display font-light text-[#f5f5f7] tracking-tight mb-1">{chapter.title}</h2>
      <p className="text-lg font-display italic text-[#86868b] mb-2">{chapter.subtitle}</p>
      <div className="font-mono text-[10px] tracking-wider text-[#424245] uppercase mb-6">{chapter.dates}</div>
      {chapter.description && <p className="text-[15px] font-light text-[#86868b] leading-relaxed mb-6">{chapter.description}</p>}
      {chapter.stats && chapter.stats.length > 0 && (
        <div className="flex gap-8 mb-6">{chapter.stats.map((s, i) => (<div key={i}><div className="text-2xl font-display text-[#f5f5f7] tabular-nums">{s.value}</div><div className="text-[9px] font-mono tracking-wider text-[#6e6e73] uppercase">{s.label}</div></div>))}</div>
      )}
      {chapter.highlights.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4">{chapter.highlights.map((h, i) => <span key={i} className="text-[13px] text-[#86868b]">{h}</span>)}</div>
      )}
      <Filmstrip photos={chapter.photos} videos={chapter.videos} chapterTitle={chapter.title} />
      {chapter.days && chapter.days.length > 0 && <Itinerary days={chapter.days} />}
    </div>
  )
}
