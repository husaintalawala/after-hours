'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { MEDIA_BASE } from '@/data/journey'

const API_BASE = 'https://after-hours-api.after-hours-media.workers.dev'

interface MediaItem { src: string; type: 'photo' | 'video'; caption?: string }
interface FilmstripProps { photos: string[]; videos: { src: string; start?: number; end?: number; caption?: string }[]; chapterTitle: string }

// Global audio unlock state — persists across all Filmstrip instances
let audioUnlocked = false

export default function Filmstrip({ photos, videos, chapterTitle }: FilmstripProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map())
  const [focusIndex, setFocusIndex] = useState(0)
  const [unlocked, setUnlocked] = useState(audioUnlocked)
  const [dynamicMedia, setDynamicMedia] = useState<MediaItem[] | null>(null)
  const prevFocus = useRef(-1)

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

  const CW = 160
  const STEP = CW + 10

  // When focus changes, mute old video, unmute new (only if audio unlocked)
  useEffect(() => {
    if (prevFocus.current === focusIndex) return
    videoRefs.current.forEach((vid, key) => {
      if (key === focusIndex && unlocked) {
        vid.muted = false
        vid.play().catch(() => {})
      } else {
        vid.muted = true
      }
    })
    prevFocus.current = focusIndex
  }, [focusIndex, unlocked])

  const updateFocus = useCallback(() => {
    if (!scrollRef.current) return
    const cx = scrollRef.current.scrollLeft + scrollRef.current.clientWidth / 2
    const pad = scrollRef.current.clientWidth / 2 - CW / 2
    const idx = Math.round((cx - pad) / STEP)
    setFocusIndex(Math.max(0, Math.min(idx, media.length - 1)))
  }, [media.length])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let ticking = false
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { updateFocus(); ticking = false }) } }
    el.addEventListener('scroll', onScroll, { passive: true })
    requestAnimationFrame(() => updateFocus())
    return () => el.removeEventListener('scroll', onScroll)
  }, [updateFocus])

  // First tap unlocks audio for the session
  const handleTap = useCallback((i: number) => {
    if (!audioUnlocked) {
      audioUnlocked = true
      setUnlocked(true)
      const vid = videoRefs.current.get(i)
      if (vid) { vid.muted = false; vid.play().catch(() => {}) }
    } else {
      const vid = videoRefs.current.get(i)
      if (vid) { vid.muted = !vid.muted; vid.play().catch(() => {}) }
    }
  }, [])

  const sidePad = typeof window !== 'undefined' ? `calc(50% - ${CW / 2}px)` : '24px'

  return (
    <div className="mt-5 -mx-6 md:-mx-8">
      <div className="flex items-center gap-3 px-6 md:px-8 mb-3">
        <span className="text-[10px] font-mono tracking-[0.2em] text-cream/25 uppercase">Gallery</span>
        <span className="flex-1 h-px bg-white/[0.06]" />
        <span className="text-[10px] font-mono text-cream/20">{media.length}</span>
      </div>
      <div ref={scrollRef} className="flex overflow-x-auto pb-4 items-center" style={{ gap: '10px', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', paddingLeft: '24px', paddingRight: '24px', height: '300px' }}>
        {media.map((item, i) => {
          const f = i === focusIndex
          const d = Math.abs(i - focusIndex)
          const scale = f ? 1.12 : d === 1 ? 0.92 : 0.8
          const opacity = f ? 1 : d === 1 ? 0.55 : 0.3
          const isVideo = item.type === 'video'
          return (
            <div key={i} className="flex-shrink-0 relative overflow-hidden" onClick={() => isVideo && handleTap(i)} style={{ width: `${CW}px`, height: '250px', scrollSnapAlign: 'center', borderRadius: '8px', transform: `scale(${scale})`, opacity, border: f ? '1.5px solid rgba(201,162,39,0.4)' : '1px solid rgba(255,255,255,0.04)', boxShadow: f ? '0 12px 40px rgba(0,0,0,0.6), 0 0 20px rgba(201,162,39,0.08)' : 'none', transition: 'transform 0.3s ease-out, opacity 0.25s ease, border-color 0.3s, box-shadow 0.3s', cursor: isVideo ? 'pointer' : 'default' }}>
              {isVideo ? (
                <video ref={el => { if (el) videoRefs.current.set(i, el); else videoRefs.current.delete(i) }} src={item.src} className="w-full h-full object-cover pointer-events-none" autoPlay muted loop playsInline />
              ) : (
                <img src={item.src} alt={`${chapterTitle} ${i+1}`} className="w-full h-full object-cover" draggable={false} loading="lazy" />
              )}
              {item.caption && f && (
                <div className="absolute bottom-0 left-0 right-0 p-2.5" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.85))' }}>
                  <p className="text-[10px] font-mono text-cream/70">{item.caption}</p>
                </div>
              )}
              <div className="absolute top-2 right-2 text-[8px] font-mono" style={{ color: f ? 'rgba(201,162,39,0.5)' : 'rgba(255,255,255,0.08)' }}>
                {String(i + 1).padStart(2, '0')}
              </div>
            </div>
          )
        })}
      </div>
      <div className="text-center mt-1">
        <span className="text-[9px] font-mono text-cream/15">{Math.max(focusIndex + 1, 1)} / {media.length}</span>
      </div>
    </div>
  )
}
