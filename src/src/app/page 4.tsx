'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { journey } from '@/data/journey'
import ChapterPanel from '@/components/ChapterCard'
import TimelineScrubber from '@/components/TimelineScrubber'
import { useActiveChapter } from '@/hooks/useScrollProgress'

const Globe = dynamic(() => import('@/components/Globe'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <div className="text-[11px] tracking-[0.3em] text-[#86868b] animate-pulse">loading</div>
    </div>
  ),
})

export default function Home() {
  const { progress, activeIndex, seekToChapter } = useActiveChapter(journey.chapters.length)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const handleSeek = useCallback((index: number) => { seekToChapter(index) }, [seekToChapter])

  if (!mounted) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><div className="text-[11px] tracking-[0.3em] text-[#86868b] animate-pulse">loading</div></div>
  }

  return (
    <main className="relative">
      <Globe scrollProgress={progress} activeIndex={Math.max(activeIndex, 0)} />
      <div className="fixed top-0 left-0 right-0 h-px bg-white/5 z-50"><div className="h-full bg-white/20 transition-all duration-150" style={{ width: `${progress * 100}%` }} /></div>
      <div className="relative z-10">
        <section className="h-screen flex flex-col items-center justify-end pb-24">
          <p className="text-[13px] font-light tracking-[0.3em] text-[#86868b] uppercase">{journey.title}</p>
          <div className="mt-10 w-px h-10 bg-gradient-to-b from-[#424245] to-transparent scroll-indicator" />
        </section>
        {journey.chapters.map((chapter, index) => (
          <div key={chapter.id}>
            <section data-chapter-section={index} className="h-screen flex flex-col items-center justify-center text-center px-6">
              <p className="text-[11px] tracking-[0.4em] text-[#6e6e73] uppercase mb-6">{String(index + 1).padStart(2, '0')}</p>
              <h2 className="text-5xl md:text-7xl lg:text-8xl font-light text-[#f5f5f7] tracking-tight leading-none">{chapter.title}</h2>
              <p className="mt-4 text-[21px] font-light text-[#86868b]">{chapter.subtitle}</p>
              <p className="mt-3 text-[11px] tracking-[0.15em] text-[#424245] uppercase">{chapter.dates}</p>
            </section>
            <section className="min-h-screen relative">
              <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-transparent to-black pointer-events-none z-10" />
              <div className="absolute inset-0 bg-black/90" />
              <div className="relative z-10 max-w-2xl mx-auto px-6 md:px-10 py-20">
                <ChapterPanel chapter={chapter} index={index} isActive={index === activeIndex} />
              </div>
            </section>
          </div>
        ))}
        <section className="h-screen flex flex-col items-center justify-center px-6 text-center">
          <p className="text-[12px] tracking-[0.1em] text-[#424245] leading-loose max-w-lg mb-16">NYC → London → Kathmandu → EBC → Mumbai → HK → Tokyo → Kyoto → Bangkok → Phuket → KL → Bali → Madrid → Sevilla → Positano → Roma → London → NYC</p>
          <h2 className="text-6xl md:text-8xl font-light italic text-[#f5f5f7]">home.</h2>
          <div className="flex justify-center gap-12 mt-20">{journey.stats.map((stat, i) => (<div key={i} className="text-center"><div className="text-[28px] font-light text-[#f5f5f7] tabular-nums">{stat.value}</div><div className="text-[11px] tracking-[0.1em] text-[#6e6e73] uppercase mt-1">{stat.label}</div></div>))}</div>
        </section>
        <div className="h-20" />
      </div>
      <TimelineScrubber progress={progress} activeIndex={Math.max(activeIndex, 0)} onSeek={handleSeek} />
    </main>
  )
}
