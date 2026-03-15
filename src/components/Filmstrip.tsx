'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { MEDIA_BASE } from '@/data/journey'

const API_BASE = 'https://after-hours-api.after-hours-media.workers.dev'

interface MediaItem { src: string; type: 'photo' | 'video'; caption?: string }
interface FilmstripProps { photos: string[]; videos: { src: string; start?: number; end?: number; caption?: string }[]; chapterTitle: string }

export default function Filmstrip({ photos, videos, chapterTitle }: FilmstripProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [focusIndex, setFocusIndex] = useState(0)
  const [dynamicMedia, setDynamicMedia] = useState<MediaItem[] | null>(null)

  useEffect(() => {
    const folder = chapterTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    fetch(`${API_BASE}/api/media?prefix=${encodeURIComponent(folder)}/`)
      .then(r => r.json())
      .then(data => {
        if (data.files && data.files.length > 0) {
          const items = data.files.filter((f: any) => f.size > 0).map((f: any) => ({
            src: `${MEDIA_BASE}/${f.key}`,
            type: f.type,
            caption: f.type === 'video' ? f.key.split('/').pop()?.replace(/\.\w+$/, '').replace(/[_-]/g, ' ') : undefined,
          }))
          if (items.length > 0) setDynamicMedia(items)
        }
      })
      .catch(() => {})
  }, [chapterTitle])

  const staticMedia: MediaItem[] = [
    ...photos.map(src => ({ src: `${MEDIA_BASE}/${src}`, type: 'photo' as const })),
    ...videos.map(v => ({ src: `${MEDIA_BASE}/${v.src}`, type: 'video' as const, caption: v.caption })),
  ]
  const media = dynamicMedia && dynamicMedia.length > 0 ? dynamicMedia : staticMedia
  if (media.length === 0) return null

  const CW = 180
  const GAP = 10
  const STEP = CW + GAP

  const updateFocus = useCallback(() => {
    if (!scrollRef.current) return
    const cx = scrollRef.current.scrollLeft + scrollRef.current.clientWidth / 2
    const idx = Math.round((cx - CW / 2) / STEP)
    setFocusIndex(Math.max(0, Math.min(idx, media.length - 1)))
  }, [media.length])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', updateFocus, { passive: true })
    updateFocus()
    return () => el.removeEventListener('scroll', updateFocus)
  }, [updateFocus])

  return (
    <div className="mt-5 -mx-6 md:-mx-8">
      <div className="flex items-center gap-3 px-6 md:px-8 mb-3">
        <span className="text-[10px] font-mono tracking-[0.2em] text-cream/25 uppercase">Gallery</span>
        <span className="flex-1 h-px bg-white/[0.06]" />
        <span className="text-[10px] font-mono text-cream/20">{media.length}</span>
      </div>

      <div
        ref={scrollRef}
        className="flex overflow-x-auto px-6 md:px-8 pb-4"
        style={{
          gap: `${GAP}px`,
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {media.map((item, i) => {
          const isFocused = i === focusIndex
          const dist = Math.abs(i - focusIndex)
          const scale = isFocused ? 1.08 : dist === 1 ? 0.95 : 0.88
          const opacity = isFocused ? 1 : dist === 1 ? 0.55 : 0.3

          return (
            <div
              key={i}
              className="flex-shrink-0 relative overflow-hidden"
              style={{
                width: `${CW}px`,
                height: '260px',
                scrollSnapAlign: 'center',
                transform: `scale(${scale})`,
                opacity,
                transition: 'transform 0.4s ease-out, opacity 0.3s ease',
                transformOrigin: 'center center',
                borderRadius: '8px',
                border: isFocused ? '1.5px solid rgba(201,162,39,0.35)' : '1px solid rgba(255,255,255,0.04)',
                boxShadow: isFocused ? '0 8px 32px rgba(0,0,0,0.5)' : 'none',
              }}
            >
              {item.type === 'video' ? (
                <video
                  src={item.src}
                  className="w-full h-full object-cover"
                  autoPlay
                  muted={!isFocused}
                  loop
                  playsInline
                />
              ) : (
                <img
                  src={item.src}
                  alt={`${chapterTitle} ${i + 1}`}
                  className="w-full h-full object-cover"
                  draggable={false}
                  loading="lazy"
                />
              )}

              {item.caption && isFocused && (
                <div className="absolute bottom-0 left-0 right-0 p-2.5" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.8))' }}>
                  <p className="text-[10px] font-mono text-cream/70">{item.caption}</p>
                </div>
              )}

              <div className="absolute top-2 right-2 text-[8px] font-mono" style={{ color: isFocused ? 'rgba(201,162,39,0.5)' : 'rgba(255,255,255,0.08)' }}>
                {String(i + 1).padStart(2, '0')}
              </div>
            </div>
          )
        })}
        <div className="flex-shrink-0 w-6" />
      </div>

      <div className="text-center mt-1">
        <span className="text-[9px] font-mono text-cream/15">{focusIndex + 1} / {media.length}</span>
      </div>
    </div>
  )
}
