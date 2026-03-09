'use client'

import { useState, useEffect, useCallback } from 'react'

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
    handleScroll() // Initial call
    
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])
  
  return progress
}

export function useActiveChapter(totalChapters: number) {
  const progress = useScrollProgress()
  const activeIndex = Math.min(
    Math.floor(progress * totalChapters),
    totalChapters - 1
  )
  
  return { progress, activeIndex }
}
