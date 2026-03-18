"use client"

import { useState, useEffect, useCallback } from "react"

export function useScrollProgress() {
  const [progress, setProgress] = useState(0)

  const handleScroll = useCallback(() => {
    const scrollTop = window.scrollY
    const docHeight = document.documentElement.scrollHeight - window.innerHeight
    setProgress(docHeight > 0 ? Math.min(Math.max(scrollTop / docHeight, 0), 1) : 0)
  }, [])

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener("scroll", handleScroll)
  }, [handleScroll])

  return progress
}

export function useActiveChapter(totalChapters: number) {
  const progress = useScrollProgress()
  const totalSections = 1 + (totalChapters * 2) + 1
  const rawSection = Math.floor(progress * totalSections)
  const chapterSection = rawSection - 1
  const activeIndex = Math.min(
    Math.max(Math.floor(chapterSection / 2), -1),
    totalChapters - 1
  )

  const seekToChapter = useCallback((chapterIndex: number) => {
    const sections = document.querySelectorAll("[data-chapter-section]")
    if (sections[chapterIndex]) {
      sections[chapterIndex].scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, [])

  return { progress, activeIndex, seekToChapter }
}
