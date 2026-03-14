'use client'

import { useRef, useState, useCallback } from 'react'
import { journey } from '@/data/journey'

interface TimelineScrubberProps {
  progress: number
  activeIndex: number
  onSeek: (chapterIndex: number) => void
}

export default function TimelineScrubber({ progress, activeIndex, onSeek }: TimelineScrubberProps) {
  const chapters = journey.chapters
  const trackRef = useRef<HTMLDivElement>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleClick = useCallback((index: number) => {
    onSeek(index)
  }, [onSeek])

  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    if (!trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const idx = Math.round(x * (chapters.length - 1))
    onSeek(Math.max(0, Math.min(idx, chapters.length - 1)))
  }, [chapters.length, onSeek])

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-5xl px-4 pb-4">
        <div className="timeline-scrubber relative">
          {/* Track background */}
          <div
            ref={trackRef}
            className="relative h-8 flex items-center cursor-pointer group"
            onClick={handleTrackClick}
          >
            {/* Base line */}
            <div className="absolute left-0 right-0 h-px bg-white/10" />

            {/* Progress fill */}
            <div
              className="absolute left-0 h-px bg-gold/60 transition-all duration-150"
              style={{ width: `${progress * 100}%` }}
            />

            {/* Chapter dots */}
            {chapters.map((ch, i) => {
              const x = chapters.length > 1 ? (i / (chapters.length - 1)) * 100 : 50
              const isHovered = hoveredIndex === i
              const isCurrent = activeIndex === i
              const isPast = i < activeIndex

              return (
                <button
                  key={ch.id}
                  className="absolute -translate-x-1/2 flex flex-col items-center group/dot"
                  style={{ left: `${x}%` }}
                  onClick={(e) => { e.stopPropagation(); handleClick(i) }}
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  {/* Tooltip */}
                  <div
                    className="absolute bottom-full mb-3 whitespace-nowrap transition-all duration-200 pointer-events-none"
                    style={{
                      opacity: isHovered || isCurrent ? 1 : 0,
                      transform: isHovered || isCurrent ? 'translateY(0)' : 'translateY(4px)',
                    }}
                  >
                    <div className="px-2 py-1 rounded-sm text-[10px] font-mono tracking-wider"
                      style={{
                        background: 'rgba(10, 10, 15, 0.9)',
                        border: '1px solid rgba(201, 162, 39, 0.2)',
                        color: isCurrent ? '#c9a227' : 'rgba(245, 243, 239, 0.6)',
                      }}
                    >
                      <span className="text-gold/40">{String(i + 1).padStart(2, '0')}</span>
                      {' '}
                      {ch.title}
                    </div>
                  </div>

                  {/* Dot */}
                  <div
                    className="w-2 h-2 rounded-full transition-all duration-300"
                    style={{
                      background: isCurrent
                        ? '#c9a227'
                        : isPast
                          ? 'rgba(201, 162, 39, 0.5)'
                          : 'rgba(255, 255, 255, 0.15)',
                      boxShadow: isCurrent
                        ? '0 0 8px rgba(201, 162, 39, 0.6), 0 0 20px rgba(201, 162, 39, 0.3)'
                        : 'none',
                      transform: isHovered ? 'scale(1.8)' : isCurrent ? 'scale(1.5)' : 'scale(1)',
                    }}
                  />

                  {/* Peak marker */}
                  {ch.isPeak && (
                    <div
                      className="absolute -top-1 w-1 h-1 rounded-full"
                      style={{ background: '#c9a227' }}
                    />
                  )}
                </button>
              )
            })}
          </div>

          {/* Current chapter label */}
          <div className="flex justify-between items-center mt-1">
            <span className="text-[9px] font-mono tracking-[0.2em] text-cream/20 uppercase">
              {journey.dateRange}
            </span>
            <span className="text-[9px] font-mono tracking-wider text-gold/40">
              Day {activeIndex >= 0 ? chapters[Math.min(activeIndex, chapters.length - 1)]?.dates : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
