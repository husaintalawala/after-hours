'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { journey } from '@/data/journey'
import ChapterCard from '@/components/ChapterCard'
import TimelineScrubber from '@/components/TimelineScrubber'
import { useActiveChapter } from '@/hooks/useScrollProgress'

const Globe = dynamic(() => import('@/components/Globe'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <div className="text-[#86868b] font-mono text-sm tracking-wider animate-pulse">loading</div>
    </div>
  ),
})

export default function Home() {
  const { progress, activeIndex, seekToChapter } = useActiveChapter(journey.chapters.length)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const handleSeek = useCallback((index: number) => { seekToChapter(index) }, [seekToChapter])

  if (!mounted) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><div className="text-[#86868b] font-mono text-sm tracking-wider animate-pulse">loading</div></div>
  }

  return (
    <main className="relative">
      {/* Globe — always fixed full screen */}
      <Globe scrollProgress={progress} activeIndex={Math.max(activeIndex, 0)} />

      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 h-px bg-white/5 z-50">
        <div className="h-full bg-[#424245] transition-all duration-150" style={{ width: `${progress * 100}%` }} />
      </div>

      {/* Scrollable content */}
      <div className="relative z-10">

        {/* ── HERO ── */}
        <section className="h-screen flex flex-col items-center justify-end pb-24">
          <p className="font-mono text-sm tracking-[0.4em] text-[#f5f5f7]/50 uppercase">{journey.title}</p>
          <p className="mt-2 font-mono text-xs tracking-[0.3em] text-[#424245] uppercase">{journey.dateRange}</p>
          <div className="mt-12 w-px h-10 bg-gradient-to-b from-[#424245] to-transparent scroll-indicator" />
        </section>

        {/* ── CHAPTERS ── */}
        {journey.chapters.map((chapter, index) => (
          <div key={chapter.id}>
            {/* City reveal — full screen, just the name over globe */}
            <section
              data-chapter-section={index}
              className="h-screen flex flex-col items-center justify-center text-center px-6"
            >
              <p className="font-mono text-[11px] tracking-[0.4em] text-[#6e6e73] uppercase mb-4">
                {String(index + 1).padStart(2, '0')}
              </p>
              <h2 className="text-5xl md:text-7xl lg:text-8xl font-display font-light text-[#f5f5f7] tracking-tight leading-none">
                {chapter.title}
              </h2>
              <p className="mt-3 text-lg md:text-xl font-display italic text-[#86868b]">
                {chapter.subtitle}
              </p>
              <p className="mt-2 font-mono text-[10px] tracking-[0.15em] text-[#424245] uppercase">
                {chapter.dates}
              </p>
            </section>

            {/* Chapter content — slides up over the globe */}
            <section className="min-h-screen relative">
              {/* Gradient fade from globe into content */}
              <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-transparent to-black/90 pointer-events-none z-10" />
              {/* Dark background for readability */}
              <div className="absolute inset-0 bg-black/85" />
              {/* Content */}
              <div className="relative z-10 flex items-start justify-center px-4 md:px-6 py-20">
                <ChapterCard
                  chapter={chapter}
                  index={index}
                  isActive={index === activeIndex}
                />
              </div>
            </section>
          </div>
        ))}

        {/* ── OUTRO ── */}
        <section className="h-screen flex flex-col items-center justify-center px-6 text-center">
          <p className="font-mono text-[11px] tracking-wider text-[#424245] leading-loose max-w-xl mb-12">
            NYC → London → Kathmandu → EBC → Mumbai → HK → Tokyo → Kyoto → Bangkok → Phuket → KL → Bali → Madrid → Sevilla → Positano → Roma → London → NYC
          </p>
          <h2 className="text-6xl md:text-8xl font-display font-light italic text-[#f5f5f7]">home.</h2>
          <div className="flex justify-center gap-10 mt-16">
            {journey.stats.map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-[28px] font-display text-[#f5f5f7] tabular-nums">{stat.value}</div>
                <div className="font-mono text-[9px] tracking-[0.1em] text-[#6e6e73] uppercase mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="h-20" />
      </div>

      {/* Timeline */}
      <TimelineScrubber progress={progress} activeIndex={Math.max(activeIndex, 0)} onSeek={handleSeek} />
    </main>
  )
}
