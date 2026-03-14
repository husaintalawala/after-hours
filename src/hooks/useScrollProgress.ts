'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export function useScrollProgress() {
  const [progress, setProgress] = useState(0)

  const handleScroll = useCallback(() => {
    const scrollTop = window.scrollY
    const docHeight = document.documentElement.scrollHeight - window.innerHeight
    const scrollProgress = docHeight > 0 ? scrollTop / docHeight : 0
    setProgress(Math.min(Math.max(scrollProgress, 0), 1))
  }, [])

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  return progress
}

export function useActiveChapter(totalChapters: number) {
  const progress = useScrollProgress()
  // +1 for hero section, +1 for outro
  const totalSections = totalChapters + 2
  const activeIndex = Math.min(
    Math.max(Math.floor(progress * totalSections) - 1, -1), // -1 = hero
    totalChapters - 1
  )

  const seekToChapter = useCallback((chapterIndex: number) => {
    // Each chapter section is one "page" of scroll
    const sections = document.querySelectorAll('[data-chapter-section]')
    if (sections[chapterIndex]) {
      sections[chapterIndex].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [])

  return { progress, activeIndex, seekToChapter }
}
