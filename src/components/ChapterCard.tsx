'use client'

import { useRef, useEffect, useState } from 'react'
import type { Chapter, TagCategory, DayEntry } from '@/data/journey'
import Filmstrip from './Filmstrip'

// ═══════════════════════════════════════════════════════════════════════════
// TAG COLORS
// ═══════════════════════════════════════════════════════════════════════════
const tagColors: Record<TagCategory, { bg: string; text: string; border: string }> = {
  food:      { bg: 'rgba(234, 179, 8, 0.12)',  text: '#eab308', border: 'rgba(234, 179, 8, 0.25)' },
  culture:   { bg: 'rgba(168, 85, 247, 0.12)', text: '#a855f7', border: 'rgba(168, 85, 247, 0.25)' },
  nature:    { bg: 'rgba(34, 197, 94, 0.12)',   text: '#22c55e', border: 'rgba(34, 197, 94, 0.25)' },
  adventure: { bg: 'rgba(239, 68, 68, 0.12)',   text: '#ef4444', border: 'rgba(239, 68, 68, 0.25)' },
  transit:   { bg: 'rgba(59, 130, 246, 0.12)',  text: '#3b82f6', border: 'rgba(59, 130, 246, 0.25)' },
  rest:      { bg: 'rgba(156, 163, 175, 0.12)', text: '#9ca3af', border: 'rgba(156, 163, 175, 0.25)' },
  peak:      { bg: 'rgba(201, 162, 39, 0.15)',  text: '#c9a227', border: 'rgba(201, 162, 39, 0.35)' },
  family:    { bg: 'rgba(244, 114, 182, 0.12)', text: '#f472b6', border: 'rgba(244, 114, 182, 0.25)' },
}

const transitIcons: Record<string, string> = {
  flight: '✈',
  train: '🚄',
  bus: '🚌',
  car: '🚗',
  ferry: '⛴',
  helicopter: '🚁',
  walk: '🥾',
}

// ═══════════════════════════════════════════════════════════════════════════
// TAG PILL
// ═══════════════════════════════════════════════════════════════════════════
function TagPill({ tag }: { tag: TagCategory }) {
  const c = tagColors[tag] || tagColors.rest
  return (
    <span
      className="inline-block px-2 py-0.5 text-[10px] font-mono tracking-wider uppercase rounded-sm"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      {tag}
    </span>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSIT CARD
// ═══════════════════════════════════════════════════════════════════════════
function TransitCard({ transit }: { transit: DayEntry['transit'] }) {
  if (!transit) return null
  const icon = transitIcons[transit.mode] || '→'
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm text-[11px] font-mono"
      style={{
        background: 'rgba(59, 130, 246, 0.06)',
        border: '1px solid rgba(59, 130, 246, 0.15)',
      }}
    >
      <span className="text-sm">{icon}</span>
      <span className="text-blue-400/80">{transit.from}</span>
      <span className="text-cream/20">→</span>
      <span className="text-blue-400/80">{transit.to}</span>
      {transit.duration && (
        <span className="text-cream/30 ml-auto">{transit.duration}</span>
      )}
      {transit.detail && (
        <span className="text-cream/20 hidden sm:inline">· {transit.detail}</span>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ELEVATION MINI CHART (for trek chapters)
// ═══════════════════════════════════════════════════════════════════════════
function ElevationChart({ days }: { days: DayEntry[] }) {
  const elevDays = days.filter(d => d.elevation)
  if (elevDays.length < 2) return null

  const maxElev = Math.max(...elevDays.map(d => d.elevation!))
  const minElev = Math.min(...elevDays.map(d => d.elevation!))
  const range = maxElev - minElev || 1

  const width = 100
  const height = 40
  const points = elevDays.map((d, i) => {
    const x = (i / (elevDays.length - 1)) * width
    const y = height - ((d.elevation! - minElev) / range) * (height - 4)
    return `${x},${y}`
  }).join(' ')

  const areaPoints = `0,${height} ${points} ${width},${height}`

  return (
    <div className="mt-3 px-1">
      <div className="flex justify-between text-[9px] font-mono text-cream/25 mb-1">
        <span>{minElev.toLocaleString()} ft</span>
        <span className="text-gold/50">{maxElev.toLocaleString()} ft</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-8" preserveAspectRatio="none">
        <defs>
          <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c9a227" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#c9a227" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill="url(#elevGrad)" />
        <polyline points={points} fill="none" stroke="#c9a227" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {elevDays.map((d, i) => {
          const x = (i / (elevDays.length - 1)) * width
          const y = height - ((d.elevation! - minElev) / range) * (height - 4)
          return <circle key={i} cx={x} cy={y} r="1.5" fill={d.highlight ? '#c9a227' : '#b87333'} />
        })}
      </svg>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// DAY ROW
// ═══════════════════════════════════════════════════════════════════════════
function DayRow({ day, index }: { day: DayEntry; index: number }) {
  return (
    <div
      className="day-row grid gap-2 py-2.5 border-b border-white/[0.04] last:border-0"
      style={{
        gridTemplateColumns: 'auto 1fr',
        animationDelay: `${index * 40}ms`,
      }}
    >
      {/* Day number + date */}
      <div className="flex flex-col items-end pr-3 border-r border-white/[0.06] min-w-[52px]">
        <span className="text-[10px] font-mono text-gold/60 tabular-nums">Day {day.day}</span>
        <span className="text-[9px] font-mono text-cream/25">{day.date}</span>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-1.5">
        <p className="text-[13px] text-cream/80 leading-snug">
          {day.highlight && (
            <span className="text-gold font-medium">{day.highlight} — </span>
          )}
          {day.summary}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {day.tags.map((tag, i) => <TagPill key={i} tag={tag} />)}
        </div>

        {/* Transit card */}
        {day.transit && <TransitCard transit={day.transit} />}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ITINERARY PANEL (expandable)
// ═══════════════════════════════════════════════════════════════════════════
function ItineraryPanel({ days }: { days: DayEntry[] }) {
  const [expanded, setExpanded] = useState(false)
  const hasElevation = days.some(d => d.elevation)

  return (
    <div className="mt-5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="group flex items-center gap-2 text-[11px] font-mono tracking-wider uppercase text-cream/40 hover:text-gold/80 transition-colors duration-300"
      >
        <span
          className="inline-block transition-transform duration-300"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          ▸
        </span>
        <span>{expanded ? 'Hide' : 'Show'} Day-by-Day</span>
        <span className="text-cream/20">({days.length} days)</span>
      </button>

      <div
        className="overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{
          maxHeight: expanded ? `${days.length * 120 + 200}px` : '0px',
          opacity: expanded ? 1 : 0,
        }}
      >
        <div className="mt-3 pl-1">
          {hasElevation && <ElevationChart days={days} />}
          <div className="mt-2">
            {days.map((day, i) => (
              <DayRow key={day.day} day={day} index={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CHAPTER CARD — alternating left/right
// ═══════════════════════════════════════════════════════════════════════════
interface ChapterCardProps {
  chapter: Chapter
  index: number
  isActive: boolean
}

export default function ChapterCard({ chapter, index, isActive }: ChapterCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = cardRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      },
      { threshold: 0.2 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Alternate left and right
  const isLeft = index % 2 === 0
  const alignment = isLeft ? 'mr-auto ml-6 md:ml-12' : 'ml-auto mr-6 md:mr-12'

  // Glitch coordinates effect
  const coordStr = `${chapter.coordinates.lat.toFixed(4)}°N ${Math.abs(chapter.coordinates.lng).toFixed(4)}°${chapter.coordinates.lng >= 0 ? 'E' : 'W'}`

  return (
    <div
      ref={cardRef}
      className={`
        chapter-card p-6 md:p-8 max-w-lg w-full
        transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]
        ${alignment}
        ${isVisible
          ? 'opacity-100 translate-y-0'
          : isLeft
            ? 'opacity-0 -translate-x-12 translate-y-4'
            : 'opacity-0 translate-x-12 translate-y-4'
        }
      `}
    >
      {/* Peak badge */}
      {chapter.isPeak && (
        <div className="inline-block px-3 py-1 mb-4 text-xs font-mono tracking-wider uppercase bg-gold/20 text-gold border border-gold/30 rounded-sm animate-pulse">
          {chapter.peakLabel || '✦ Peak Moment'}
        </div>
      )}

      {/* Chapter number + coordinates */}
      <div className="flex items-baseline justify-between mb-2">
        <div className="font-mono text-xs tracking-[0.3em] text-gold/60 uppercase">
          Chapter {String(index + 1).padStart(2, '0')}
        </div>
        <div className="font-mono text-[10px] tracking-wider text-cream/20 coord-glitch" data-text={coordStr}>
          {coordStr}
        </div>
      </div>

      {/* Title */}
      <h2 className="text-3xl md:text-4xl font-display font-light text-cream mb-1 text-glow">
        {chapter.title}
      </h2>

      {/* Subtitle */}
      <p className="text-base md:text-lg font-display italic text-gold/70 mb-3">
        {chapter.subtitle}
      </p>

      {/* Dates */}
      <div className="font-mono text-xs tracking-wider text-cream/40 uppercase mb-5">
        {chapter.dates}
      </div>

      {/* Description */}
      {chapter.description && (
        <p className="text-sm text-cream/60 leading-relaxed mb-5">
          {chapter.description}
        </p>
      )}

      {/* Stats row */}
      {chapter.stats && chapter.stats.length > 0 && (
        <div className="flex gap-6 mb-5">
          {chapter.stats.map((stat, i) => (
            <div key={i}>
              <div className="text-xl md:text-2xl font-display text-cream tabular-nums">{stat.value}</div>
              <div className="text-[10px] font-mono tracking-wider text-cream/35 uppercase">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Highlight pills */}
      {chapter.highlights.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {chapter.highlights.map((h, i) => (
            <span
              key={i}
              className="px-2.5 py-1 text-[11px] font-mono tracking-wide bg-white/[0.04] text-cream/50 rounded-sm border border-white/[0.06]"
            >
              {h}
            </span>
          ))}
        </div>
      )}

      {/* Photo/Video filmstrip */}
      {(chapter.photos.length > 0 || chapter.videos.length > 0) && (
        <Filmstrip
          photos={chapter.photos}
          videos={chapter.videos}
          chapterTitle={chapter.title}
        />
      )}

      {/* Day-by-day itinerary */}
      {chapter.days && chapter.days.length > 0 && (
        <ItineraryPanel days={chapter.days} />
      )}
    </div>
  )
}
