'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
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
  const [focusIndex, setFocusIndex] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)

  const media: MediaItem[] = [
    ...photos.map(src => ({ src: `${MEDIA_BASE}/${src}`, type: 'photo' as const })),
    ...videos.map(v => ({ src: `${MEDIA_BASE}/${v.src}`, type: 'video' as const, caption: v.caption })),
  ]

  if (media.length === 0) return null

  // Track which item is in the center of the viewport
  const updateFocus = useCallback(() => {
    if (!scrollRef.current) return
    const container = scrollRef.current
    const centerX = container.scrollLeft + container.clientWidth / 2
    // Each card is ~200px wide + 12px gap
    const cardWidth = 200 + 12
    const padding = 24 // left padding
    const idx = Math.round((centerX - padding - 100) / cardWidth)
    setFocusIndex(Math.max(0, Math.min(idx, media.length - 1)))
  }, [media.length])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', updateFocus, { passive: true })
    return () => el.removeEventListener('scroll', updateFocus)
  }, [updateFocus])

  // Click to center a card
  const scrollToIndex = useCallback((idx: number) => {
    if (!scrollRef.current) return
    const cardWidth = 200 + 12
    const padding = 24
    const targetScroll = padding + idx * cardWidth - (scrollRef.current.clientWidth / 2 - 100)
    scrollRef.current.scrollTo({ left: targetScroll, behavior: 'smooth' })
  }, [])

  // Drag-to-scroll
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
    scrollRef.current.scrollLeft = scrollLeft - (x - startX) * 1.5
  }, [isDragging, startX, scrollLeft])

  return (
    <div className="filmstrip-container mt-5 -mx-6 md:-mx-8">
      {/* Label */}
      <div className="flex items-center gap-3 px-6 md:px-8 mb-3">
        <span className="text-[10px] font-mono tracking-[0.2em] text-cream/25 uppercase">Gallery</span>
        <span className="flex-1 h-px bg-white/[0.06]" />
        <span className="text-[10px] font-mono text-cream/20">{media.length}</span>
      </div>

      {/* Scrollable filmstrip with zoom-focus */}
      <div
        ref={scrollRef}
        className="filmstrip-scroll flex gap-3 overflow-x-auto px-6 md:px-8 pb-4 cursor-grab active:cursor-grabbing"
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
        {media.map((item, i) => {
          const isFocused = i === focusIndex
          const distance = Math.abs(i - focusIndex)
          // Scale: focused = 1.0, adjacent = 0.85, far = 0.75
          const scale = distance === 0 ? 1.0 : distance === 1 ? 0.85 : 0.75
          const opacity = distance === 0 ? 1.0 : distance === 1 ? 0.7 : 0.5

          return (
            <div
              key={i}
              className="filmstrip-card flex-shrink-0 relative overflow-hidden rounded-sm cursor-pointer"
              onClick={() => scrollToIndex(i)}
              style={{
                width: '200px',
                height: isFocused ? '280px' : '240px',
                scrollSnapAlign: 'center',
                transform: `scale(${scale})`,
                opacity,
                transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease, height 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
                transformOrigin: 'center bottom',
                zIndex: isFocused ? 10 : 1,
              }}
            >
              {item.type === 'photo' ? (
                <img
                  src={item.src}
                  alt={`${chapterTitle} ${i + 1}`}
                  className="w-full h-full object-cover"
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

              {/* Caption overlay — only on focused item */}
              {item.caption && isFocused && (
                <div
                  className="absolute bottom-0 left-0 right-0 p-3"
                  style={{
                    background: 'linear-gradient(transparent, rgba(10, 10, 15, 0.9))',
                  }}
                >
                  <p className="text-[11px] font-mono text-cream/80 leading-tight">
                    {item.caption}
                  </p>
                </div>
              )}

              {/* Frame number */}
              <div
                className="absolute top-2 right-2 text-[9px] font-mono transition-opacity duration-300"
                style={{ color: isFocused ? 'rgba(201, 162, 39, 0.6)' : 'rgba(245, 243, 239, 0.15)' }}
              >
                {String(i + 1).padStart(2, '0')}
              </div>

              {/* Video indicator */}
              {item.type === 'video' && (
                <div className="absolute top-2 left-2 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[8px] font-mono text-cream/40 uppercase">Live</span>
                </div>
              )}

              {/* Gold border on focus */}
              <div
                className="absolute inset-0 rounded-sm pointer-events-none transition-all duration-300"
                style={{
                  border: isFocused
                    ? '1.5px solid rgba(201, 162, 39, 0.5)'
                    : '1px solid rgba(255, 255, 255, 0.04)',
                  boxShadow: isFocused
                    ? '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(201, 162, 39, 0.1)'
                    : 'none',
                }}
              />
            </div>
          )
        })}

        {/* End spacer */}
        <div className="flex-shrink-0 w-8" />
      </div>

      {/* Dot indicators */}
      {media.length > 1 && (
        <div className="flex justify-center gap-1 mt-1 px-6">
          {media.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollToIndex(i)}
              className="transition-all duration-300"
              style={{
                width: i === focusIndex ? '16px' : '4px',
                height: '4px',
                borderRadius: '2px',
                background: i === focusIndex ? '#c9a227' : 'rgba(255,255,255,0.15)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
