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
  const [mutedMap, setMutedMap] = useState<Record<number, boolean>>({})
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)

  const media: MediaItem[] = [
    ...photos.map(src => ({ src: `${MEDIA_BASE}/${src}`, type: 'photo' as const })),
    ...videos.map(v => ({ src: `${MEDIA_BASE}/${v.src}`, type: 'video' as const, caption: v.caption })),
  ]

  if (media.length === 0) return null

  const CARD_W = 160
  const CARD_GAP = 14
  const CARD_STEP = CARD_W + CARD_GAP
  const PAD = 24

  const updateFocus = useCallback(() => {
    if (!scrollRef.current) return
    const centerX = scrollRef.current.scrollLeft + scrollRef.current.clientWidth / 2
    const idx = Math.round((centerX - PAD - CARD_W / 2) / CARD_STEP)
    setFocusIndex(Math.max(0, Math.min(idx, media.length - 1)))
  }, [media.length])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', updateFocus, { passive: true })
    updateFocus()
    return () => el.removeEventListener('scroll', updateFocus)
  }, [updateFocus])

  const scrollToIndex = useCallback((idx: number) => {
    if (!scrollRef.current) return
    const target = PAD + idx * CARD_STEP - (scrollRef.current.clientWidth / 2 - CARD_W / 2)
    scrollRef.current.scrollTo({ left: target, behavior: 'smooth' })
  }, [])

  const toggleMute = useCallback((idx: number) => {
    setMutedMap(prev => ({ ...prev, [idx]: !prev[idx] }))
  }, [])

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
    scrollRef.current.scrollLeft = scrollLeft - (e.pageX - scrollRef.current.offsetLeft - startX) * 1.5
  }, [isDragging, startX, scrollLeft])

  return (
    <div className="filmstrip-container mt-5 -mx-6 md:-mx-8">
      <div className="flex items-center gap-3 px-6 md:px-8 mb-3">
        <span className="text-[10px] font-mono tracking-[0.2em] text-cream/25 uppercase">Gallery</span>
        <span className="flex-1 h-px bg-white/[0.06]" />
        <span className="text-[10px] font-mono text-cream/20">{media.length}</span>
      </div>

      <div
        ref={scrollRef}
        className="filmstrip-scroll flex overflow-x-auto px-6 md:px-8 pb-4 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
        style={{
          gap: `${CARD_GAP}px`,
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          perspective: '800px',
        }}
      >
        {media.map((item, i) => {
          const isFocused = i === focusIndex
          const distance = Math.abs(i - focusIndex)
          const scale = distance === 0 ? 1.2 : distance === 1 ? 0.88 : 0.75
          const opacity = distance === 0 ? 1.0 : distance === 1 ? 0.6 : 0.35
          const rotateY = distance === 0 ? 0 : (i < focusIndex ? 8 : -8)
          const isMuted = mutedMap[i] === undefined ? true : mutedMap[i]

          return (
            <div
              key={i}
              className="flex-shrink-0 relative overflow-hidden cursor-pointer"
              onClick={() => isFocused && item.type === 'video' ? toggleMute(i) : scrollToIndex(i)}
              style={{
                width: `${CARD_W}px`,
                height: isFocused ? '280px' : '220px',
                scrollSnapAlign: 'center',
                transform: `scale(${scale}) rotateY(${rotateY}deg) translateZ(${isFocused ? '20px' : '0px'})`,
                opacity,
                transition: 'all 0.45s cubic-bezier(0.25, 1, 0.5, 1)',
                transformOrigin: 'center center',
                zIndex: isFocused ? 10 : 5 - distance,
                borderRadius: '6px',
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
                  muted={isMuted}
                  loop
                  playsInline
                  draggable={false}
                />
              )}

              {item.caption && isFocused && (
                <div className="absolute bottom-0 left-0 right-0 p-3"
                  style={{ background: 'linear-gradient(transparent, rgba(10, 10, 15, 0.9))' }}>
                  <p className="text-[11px] font-mono text-cream/80 leading-tight">{item.caption}</p>
                </div>
              )}

              <div className="absolute top-2 right-2 text-[9px] font-mono"
                style={{ color: isFocused ? 'rgba(201, 162, 39, 0.7)' : 'rgba(245, 243, 239, 0.12)' }}>
                {String(i + 1).padStart(2, '0')}
              </div>

              {item.type === 'video' && isFocused && (
                <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-sm"
                  style={{ background: 'rgba(0,0,0,0.5)' }}>
                  <span className="text-[10px]">{isMuted ? '🔇' : '🔊'}</span>
                  <span className="text-[8px] font-mono text-cream/50">{isMuted ? 'tap for sound' : 'playing'}</span>
                </div>
              )}

              {item.type === 'video' && !isFocused && (
                <div className="absolute top-2 left-2 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                </div>
              )}

              <div className="absolute inset-0 pointer-events-none transition-all duration-300"
                style={{
                  borderRadius: '6px',
                  border: isFocused ? '1.5px solid rgba(201, 162, 39, 0.5)' : '1px solid rgba(255, 255, 255, 0.04)',
                  boxShadow: isFocused ? '0 12px 40px rgba(0,0,0,0.6), 0 0 24px rgba(201, 162, 39, 0.12)' : 'none',
                }}
              />
            </div>
          )
        })}
        <div className="flex-shrink-0 w-8" />
      </div>

      {media.length > 1 && (
        <div className="flex justify-center gap-1 mt-2 px-6">
          {media.map((_, i) => (
            <button key={i} onClick={() => scrollToIndex(i)} className="transition-all duration-300"
              style={{
                width: i === focusIndex ? '18px' : '4px',
                height: '4px',
                borderRadius: '2px',
                background: i === focusIndex ? '#c9a227' : 'rgba(255,255,255,0.12)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}