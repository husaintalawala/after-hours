'use client'

import { useRef, useState, useCallback } from 'react'
import { journey } from '@/data/journey'

interface TimelineScrubberProps { progress: number; activeIndex: number; onSeek: (chapterIndex: number) => void }

export default function TimelineScrubber({ progress, activeIndex, onSeek }: TimelineScrubberProps) {
  const chapters = journey.chapters
  const trackRef = useRef<HTMLDivElement>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const handleClick = useCallback((index: number) => { onSeek(index) }, [onSeek])
  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    if (!trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    onSeek(Math.max(0, Math.min(Math.round(((e.clientX - rect.left) / rect.width) * (chapters.length - 1)), chapters.length - 1)))
  }, [chapters.length, onSeek])
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-5xl px-4 pb-4">
        <div className="timeline-scrubber relative">
          <div ref={trackRef} className="relative h-8 flex items-center cursor-pointer" onClick={handleTrackClick}>
            <div className="absolute left-0 right-0 h-px bg-[#1d1d1f]" />
            <div className="absolute left-0 h-px bg-[#424245] transition-all duration-150" style={{ width: `${progress * 100}%` }} />
            {chapters.map((ch, i) => {
              const x = chapters.length > 1 ? (i / (chapters.length - 1)) * 100 : 50
              const isHovered = hoveredIndex === i, isCurrent = activeIndex === i, isPast = i < activeIndex
              return (
                <button key={ch.id} className="absolute -translate-x-1/2 flex flex-col items-center" style={{ left: `${x}%` }} onClick={(e) => { e.stopPropagation(); handleClick(i) }} onMouseEnter={() => setHoveredIndex(i)} onMouseLeave={() => setHoveredIndex(null)}>
                  <div className="absolute bottom-full mb-3 whitespace-nowrap transition-all duration-200 pointer-events-none" style={{ opacity: isHovered || isCurrent ? 1 : 0, transform: isHovered || isCurrent ? 'translateY(0)' : 'translateY(4px)' }}>
                    <div className="px-2 py-1 rounded text-[10px] tracking-wide" style={{ background: 'rgba(0,0,0,0.9)', border: '1px solid rgba(255,255,255,0.06)', color: isCurrent ? '#f5f5f7' : '#86868b' }}>
                      <span className="text-[#424245]">{String(i + 1).padStart(2, '0')}</span> {ch.title}
                    </div>
                  </div>
                  <div className="w-1.5 h-1.5 rounded-full transition-all duration-300" style={{ background: isCurrent ? '#f5f5f7' : isPast ? '#6e6e73' : '#2d2d2d', transform: isHovered ? 'scale(2)' : isCurrent ? 'scale(1.6)' : 'scale(1)' }} />
                </button>
              )
            })}
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-[9px] tracking-[0.15em] text-[#424245] uppercase">{journey.dateRange}</span>
            <span className="text-[9px] tracking-wider text-[#424245]">{activeIndex >= 0 ? chapters[Math.min(activeIndex, chapters.length - 1)]?.dates : ''}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
