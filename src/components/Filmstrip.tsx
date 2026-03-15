'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { MEDIA_BASE } from '@/data/journey'

const API_BASE = 'https://after-hours-api.after-hours-media.workers.dev'

interface MediaItem { src: string; type: 'photo' | 'video'; caption?: string }
interface FilmstripProps { photos: string[]; videos: { src: string; start?: number; end?: number; caption?: string }[]; chapterTitle: string }

export default function Filmstrip({ photos, videos, chapterTitle }: FilmstripProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [rotation, setRotation] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStartX, setDragStartX] = useState(0)
  const [dragStartRotation, setDragStartRotation] = useState(0)
  const [velocity, setVelocity] = useState(0)
  const [lastX, setLastX] = useState(0)
  const [lastTime, setLastTime] = useState(0)
  const [unmuted, setUnmuted] = useState<Set<number>>(new Set())
  const [dynamicMedia, setDynamicMedia] = useState<MediaItem[] | null>(null)
  const animFrame = useRef<number>(0)

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

  const count = media.length
  const angleStep = 360 / count
  const RADIUS = Math.max(160, count * 12)

  const getFocusedIndex = () => {
    const normalized = ((rotation % 360) + 360) % 360
    return Math.round(normalized / angleStep) % count
  }

  // Inertia animation
  useEffect(() => {
    if (isDragging) return
    if (Math.abs(velocity) < 0.1) return
    let vel = velocity
    const animate = () => {
      vel *= 0.95
      if (Math.abs(vel) < 0.1) return
      setRotation(prev => prev + vel)
      animFrame.current = requestAnimationFrame(animate)
    }
    animFrame.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animFrame.current)
  }, [isDragging, velocity])

  // Mouse drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStartX(e.clientX)
    setDragStartRotation(rotation)
    setLastX(e.clientX)
    setLastTime(Date.now())
    setVelocity(0)
  }, [rotation])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    const dx = e.clientX - dragStartX
    const now = Date.now()
    const dt = now - lastTime
    if (dt > 0) setVelocity((e.clientX - lastX) / dt * 8)
    setLastX(e.clientX)
    setLastTime(now)
    setRotation(dragStartRotation + dx * 0.3)
  }, [isDragging, dragStartX, dragStartRotation, lastX, lastTime])

  const handleMouseUp = useCallback(() => { setIsDragging(false) }, [])

  // Touch drag
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true)
    setDragStartX(e.touches[0].clientX)
    setDragStartRotation(rotation)
    setLastX(e.touches[0].clientX)
    setLastTime(Date.now())
    setVelocity(0)
  }, [rotation])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return
    const dx = e.touches[0].clientX - dragStartX
    const now = Date.now()
    const dt = now - lastTime
    if (dt > 0) setVelocity((e.touches[0].clientX - lastX) / dt * 8)
    setLastX(e.touches[0].clientX)
    setLastTime(now)
    setRotation(dragStartRotation + dx * 0.3)
  }, [isDragging, dragStartX, dragStartRotation, lastX, lastTime])

  const handleTouchEnd = useCallback(() => { setIsDragging(false) }, [])


  const handleWheel = useCallback((e: React.WheelEvent) => { e.preventDefault(); setRotation(prev => prev + e.deltaX * 0.3 + e.deltaY * 0.3) }, [])

  // Click to snap
  const snapTo = useCallback((idx: number) => {
    setVelocity(0)
    setRotation(idx * angleStep)
  }, [angleStep])

  const focusedIndex = getFocusedIndex()

  return (
    <div className="mt-5 -mx-6 md:-mx-8">
      <div className="flex items-center gap-3 px-6 md:px-8 mb-2">
        <span className="text-[10px] font-mono tracking-[0.2em] text-cream/25 uppercase">Gallery</span>
        <span className="flex-1 h-px bg-white/[0.06]" />
        <span className="text-[10px] font-mono text-cream/20">{count}</span>
      </div>
      <div
        ref={containerRef}
        className="relative overflow-hidden cursor-grab active:cursor-grabbing select-none"
        style={{ height: '280px', perspective: '1000px' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd} onWheel={handleWheel}
      >
        <div className="absolute inset-0 flex items-center justify-center" style={{ transformStyle: 'preserve-3d' }}>
          {media.map((item, i) => {
            const angle = (i * angleStep - rotation) * (Math.PI / 180)
            const x = Math.sin(angle) * RADIUS
            const z = Math.cos(angle) * RADIUS
            const scale = 0.6 + 0.4 * ((z + RADIUS) / (2 * RADIUS))
            const opacity = 0.2 + 0.8 * ((z + RADIUS) / (2 * RADIUS))
            const isFront = i === focusedIndex
            const isVideo = item.type === 'video'
            const loud = isFront

            return (
              <div
                key={i}
                className="absolute overflow-hidden"
                onClick={(e) => {
                  if (isFront && isVideo) { e.stopPropagation(); setUnmuted(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n }) }
                  else snapTo(i)
                }}
                style={{
                  width: '120px',
                  height: '170px',
                  borderRadius: '8px',
                  transform: `translateX(${x}px) translateZ(${z}px) scale(${isFront ? 1.2 : scale * 0.85})`,
                  opacity: isFront ? 1 : opacity,
                  zIndex: Math.round(z + RADIUS),
                  transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.25,1,0.5,1), opacity 0.3s ease',
                  border: isFront ? '2px solid rgba(201,162,39,0.5)' : '1px solid rgba(255,255,255,0.06)',
                  boxShadow: isFront ? '0 12px 40px rgba(0,0,0,0.7), 0 0 30px rgba(201,162,39,0.15)' : '0 4px 12px rgba(0,0,0,0.3)',
                  cursor: isFront ? (isVideo ? 'pointer' : 'default') : 'pointer',
                }}
              >
                {isVideo ? (
                  <video src={item.src} className="w-full h-full object-cover" autoPlay muted={!loud} loop playsInline />
                ) : (
                  <img src={item.src} alt={`${chapterTitle} ${i+1}`} className="w-full h-full object-cover" draggable={false} loading="lazy" />
                )}

                {item.caption && isFront && (
                  <div className="absolute bottom-0 left-0 right-0 p-2" style={{background:'linear-gradient(transparent,rgba(10,10,15,0.9))'}}>
                    <p className="text-[10px] font-mono text-cream/80">{item.caption}</p>
                  </div>
                )}

                <div className="absolute top-1.5 right-2 text-[8px] font-mono" style={{color: isFront ? 'rgba(201,162,39,0.7)' : 'rgba(255,255,255,0.1)'}}>
                  {String(i+1).padStart(2,'0')}
                </div>

                {isVideo && isFront && (
                  <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded text-[8px] font-mono text-cream/50" style={{background:'rgba(0,0,0,0.6)'}}>
                    {loud ? '\u{1F50A}' : '\u{1F507} tap'}
                  </div>
                )}

                {isVideo && !isFront && (
                  <div className="absolute top-1.5 left-1.5"><div className="w-1 h-1 rounded-full bg-red-500 animate-pulse" /></div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex justify-center gap-2 mt-1 px-6">
        <span className="text-[9px] font-mono text-cream/20">{String(focusedIndex + 1).padStart(2,'0')} / {String(count).padStart(2,'0')}</span>
        <span className="text-[9px] font-mono text-cream/12">drag to spin</span>
      </div>
    </div>
  )
}
