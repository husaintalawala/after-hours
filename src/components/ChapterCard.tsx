'use client'

import { useRef, useEffect, useState } from 'react'
import type { Chapter } from '@/data/journey'

interface ChapterCardProps {
  chapter: Chapter
  index: number
  isActive: boolean
}

export default function ChapterCard({ chapter, index, isActive }: ChapterCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  
  useEffect(() => {
    if (isActive) {
      setIsVisible(true)
    }
  }, [isActive])
  
  return (
    <div
      ref={cardRef}
      className={`
        chapter-card p-8 max-w-md mx-auto
        transition-all duration-700 ease-out
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}
      `}
    >
      {/* Peak badge */}
      {chapter.isPeak && (
        <div className="inline-block px-3 py-1 mb-4 text-xs font-mono tracking-wider uppercase bg-gold/20 text-gold border border-gold/30 rounded-sm">
          {chapter.peakLabel || '✦ Peak Moment'}
        </div>
      )}
      
      {/* Chapter number */}
      <div className="font-mono text-xs tracking-[0.3em] text-gold/60 uppercase mb-2">
        Chapter {index + 1}
      </div>
      
      {/* Title */}
      <h2 className="text-4xl font-display font-light text-cream mb-1 text-glow">
        {chapter.title}
      </h2>
      
      {/* Subtitle */}
      <p className="text-lg font-display italic text-gold/70 mb-4">
        {chapter.subtitle}
      </p>
      
      {/* Dates */}
      <div className="font-mono text-xs tracking-wider text-cream/40 uppercase mb-6">
        {chapter.dates}
      </div>
      
      {/* Description */}
      {chapter.description && (
        <p className="text-sm text-cream/70 leading-relaxed mb-6">
          {chapter.description}
        </p>
      )}
      
      {/* Stats */}
      {chapter.stats && chapter.stats.length > 0 && (
        <div className="flex gap-6 mb-6">
          {chapter.stats.map((stat, i) => (
            <div key={i} className="text-center">
              <div className="text-2xl font-display text-cream">{stat.value}</div>
              <div className="text-xs font-mono tracking-wider text-cream/40 uppercase">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Highlights */}
      {chapter.highlights.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chapter.highlights.map((highlight, i) => (
            <span
              key={i}
              className="px-3 py-1 text-xs font-mono tracking-wide bg-white/5 text-cream/60 rounded-sm"
            >
              {highlight}
            </span>
          ))}
        </div>
      )}
      
      {/* Photo grid placeholder */}
      {chapter.photos.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mt-6">
          {chapter.photos.slice(0, 4).map((photo, i) => (
            <div
              key={i}
              className="aspect-square bg-white/5 rounded-sm overflow-hidden"
            >
              <img
                src={`/images/${photo}`}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
