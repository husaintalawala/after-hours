'use client'

import { useRef, useState, useCallback } from 'react'
import { MEDIA_BASE } from '@/data/journey'

interface MediaItem {
  src: string
  type: 'photo' | 'video'
  caption?: string
}

interface FilmstripProps {
  photos: string[]
  videos: { src: string; start?: number; end?: number; caption?: string }[]
  chapterTitle: string
}

export default function Filmstrip({ photos, videos, chapterTitle }: FilmstripProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)

  // Combine photos and videos into a single media array
  const media: MediaItem[] = [
    ...photos.map(src => ({ src: `${MEDIA_BASE}/${src}`, type: 'photo' as const })),
    ...videos.map(v => ({ src: `${MEDIA_BASE}/${v.src}`, type: 'video' as const, caption: v.caption })),
  ]

  if (media.length === 0) return null

  // Drag-to-scroll handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!scrollRef.current) return
    setIsDragging(true)
    setStartX(e.pageX - scrollRef.current.offsetLeft)
    setScrollLeft(scrollRef.current.scrollLeft)
  }, [])

  const handleMouseUp = useCallback(() => setIsDragging(false), [])
  const handleMouseLeave = useCallback(() => setIsDragging(false), [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return
    e.preventDefault()
    const x = e.pageX - scrollRef.current.offsetLeft
    const walk = (x - startX) * 1.5
    scrollRef.current.scrollLeft = scrollLeft - walk
  }, [isDragging, startX, scrollLeft])

  return (
    <div className="filmstrip-container mt-5 -mx-6 md:-mx-8">
      {/* Label */}
      <div className="flex items-center gap-3 px-6 md:px-8 mb-3">
        <span className="text-[10px] font-mono tracking-[0.2em] text-cream/25 uppercase">Gallery</span>
        <span className="flex-1 h-px bg-white/[0.06]" />
        <span className="text-[10px] font-mono text-cream/20">{media.length} items</span>
      </div>

      {/* Scrollable filmstrip */}
      <div
        ref={scrollRef}
        className="filmstrip-scroll flex gap-3 overflow-x-auto px-6 md:px-8 pb-3 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
        style={{
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {media.map((item, i) => (
          <div
            key={i}
            className="filmstrip-card flex-shrink-0 relative overflow-hidden rounded-sm group"
            style={{
              width: '160px',
              aspectRatio: '3/4',
              scrollSnapAlign: 'start',
            }}
          >
            {item.type === 'photo' ? (
              <img
                src={item.src}
                alt={`${chapterTitle} ${i + 1}`}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                draggable={false}
                loading="lazy"
              />
            ) : (
              <video
                src={item.src}
                className="w-full h-full object-cover"
                autoPlay
                muted
                loop
                playsInline
                draggable={false}
              />
            )}

            {/* Frosted glass caption overlay */}
            {item.caption && (
              <div className="absolute bottom-0 left-0 right-0 p-2"
                style={{
                  background: 'linear-gradient(transparent, rgba(10, 10, 15, 0.85))',
                }}
              >
                <p className="text-[10px] font-mono text-cream/70 leading-tight">
                  {item.caption}
                </p>
              </div>
            )}

            {/* Frame number */}
            <div className="absolute top-2 right-2 text-[9px] font-mono text-cream/20">
              {String(i + 1).padStart(2, '0')}
            </div>

            {/* Video indicator */}
            {item.type === 'video' && (
              <div className="absolute top-2 left-2 flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[8px] font-mono text-cream/40 uppercase">Live</span>
              </div>
            )}

            {/* Gold border on hover */}
            <div className="absolute inset-0 border border-transparent group-hover:border-gold/30 transition-colors duration-300 rounded-sm pointer-events-none" />
          </div>
        ))}

        {/* End spacer */}
        <div className="flex-shrink-0 w-4" />
      </div>

      {/* Scroll indicator dots */}
      {media.length > 3 && (
        <div className="flex justify-center gap-1.5 mt-2 px-6">
          <span className="text-[9px] font-mono text-cream/15">← scroll →</span>
        </div>
      )}
    </div>
  )
}
