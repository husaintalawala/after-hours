'use client'

import { useEffect, useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import { journey } from '@/data/journey'
import ChapterCard from '@/components/ChapterCard'
import { useScrollProgress, useActiveChapter } from '@/hooks/useScrollProgress'

// Dynamic import for Globe (client-side only, no SSR for Three.js)
const Globe = dynamic(() => import('@/components/Globe'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-midnight flex items-center justify-center">
      <div className="text-gold font-mono text-sm tracking-wider animate-pulse">
        Loading globe...
      </div>
    </div>
  ),
})

export default function Home() {
  const { progress, activeIndex } = useActiveChapter(journey.chapters.length)
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
  }, [])
  
  if (!mounted) {
    return (
      <div className="min-h-screen bg-midnight flex items-center justify-center">
        <div className="text-gold font-mono text-sm tracking-wider animate-pulse">
          Initializing...
        </div>
      </div>
    )
  }
  
  return (
    <main className="relative">
      {/* Fixed 3D Globe Background */}
      <Globe scrollProgress={progress} />
      
      {/* Scroll Progress Bar */}
      <div className="fixed top-0 left-0 right-0 h-[2px] bg-white/10 z-50">
        <div 
          className="h-full bg-gold transition-all duration-100"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      
      {/* Content Overlay */}
      <div className="content-overlay relative z-10">
        
        {/* ═══════════════════════════════════════════════════════════════
            HERO SECTION
        ═══════════════════════════════════════════════════════════════ */}
        <section className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
          <div className="stagger-children visible">
            {/* Dates */}
            <p className="font-mono text-xs tracking-[0.4em] text-cream/40 uppercase mb-8">
              {journey.dateRange}
            </p>
            
            {/* Title */}
            <h1 className="text-7xl md:text-9xl font-display font-light text-cream text-glow mb-2">
              {journey.title}
            </h1>
            
            {/* Subtitle */}
            <p className="text-4xl md:text-6xl font-display italic text-gold">
              {journey.subtitle}
            </p>
            
            {/* Stats */}
            <div className="flex justify-center gap-8 md:gap-12 mt-12">
              {journey.stats.map((stat, i) => (
                <div key={i} className="text-center">
                  <div className="text-3xl md:text-4xl font-display text-cream">
                    {stat.value}
                  </div>
                  <div className="font-mono text-xs tracking-wider text-cream/40 uppercase mt-1">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Scroll hint */}
            <div className="mt-16 flex flex-col items-center gap-3 animate-bounce">
              <div className="w-px h-12 bg-gradient-to-b from-gold to-transparent" />
              <span className="font-mono text-xs tracking-[0.3em] text-cream/30 uppercase">
                Scroll to explore
              </span>
            </div>
          </div>
        </section>
        
        {/* ═══════════════════════════════════════════════════════════════
            CHAPTER SECTIONS
        ═══════════════════════════════════════════════════════════════ */}
        {journey.chapters.map((chapter, index) => (
          <section
            key={chapter.id}
            className="min-h-screen flex items-center justify-center px-6 py-24"
          >
            <ChapterCard
              chapter={chapter}
              index={index}
              isActive={index === activeIndex}
            />
          </section>
        ))}
        
        {/* ═══════════════════════════════════════════════════════════════
            OUTRO SECTION
        ═══════════════════════════════════════════════════════════════ */}
        <section className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
          {/* Route summary */}
          <div className="max-w-2xl mx-auto mb-12">
            <p className="font-mono text-xs tracking-wider text-cream/30 leading-loose">
              NYC → London → Kathmandu → <span className="text-gold">EBC</span> → Mumbai → 
              HK → Tokyo → Kyoto → <span className="text-gold">Hakuba</span> → Bangkok → 
              Phuket → KL → Bali → Madrid → Sevilla → Ronda → Granada → Naples → 
              <span className="text-gold">Positano</span> → Roma → London → NYC
            </p>
          </div>
          
          {/* End title */}
          <h2 className="text-6xl md:text-8xl font-display italic text-gold text-glow">
            home.
          </h2>
          
          {/* Final stats */}
          <div className="flex justify-center gap-8 mt-12">
            {journey.stats.map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-2xl font-display text-cream">{stat.value}</div>
                <div className="font-mono text-xs tracking-wider text-cream/40 uppercase">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
          
          {/* Date */}
          <p className="font-mono text-xs tracking-[0.3em] text-cream/30 uppercase mt-12">
            {journey.dateRange}
          </p>
        </section>
        
        {/* Footer spacer */}
        <div className="h-24" />
      </div>
    </main>
  )
}
