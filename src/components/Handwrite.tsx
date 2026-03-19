"use client"
import { useState, useEffect } from "react"

const message = "welcome to our side quest"

export default function Handwrite() {
  const [charCount, setCharCount] = useState(0)
  const [showCursor, setShowCursor] = useState(true)

  useEffect(() => {
    const delay = setTimeout(() => {
      if (charCount < message.length) {
        const timer = setInterval(() => {
          setCharCount(prev => {
            if (prev >= message.length) {
              clearInterval(timer)
              return prev
            }
            return prev + 1
          })
        }, 80 + Math.random() * 60)
        return () => clearInterval(timer)
      }
    }, 1200)
    return () => clearTimeout(delay)
  }, [])

  useEffect(() => {
    if (charCount >= message.length) {
      const t = setTimeout(() => setShowCursor(false), 1500)
      return () => clearTimeout(t)
    }
  }, [charCount])

  return (
    <div className="text-center px-6">
      <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500&display=swap" rel="stylesheet" />
      <p style={{
        fontFamily: "'Caveat', cursive",
        fontSize: "clamp(28px, 5vw, 56px)",
        fontWeight: 500,
        color: "rgba(245,245,247,0.55)",
        letterSpacing: "0.02em",
        lineHeight: 1.2,
        textShadow: "0 2px 20px rgba(0,0,0,0.5)",
      }}>
        {message.slice(0, charCount)}
        {showCursor && <span style={{ borderRight: "2px solid rgba(245,245,247,0.4)", marginLeft: "2px", animation: "blink 0.6s step-end infinite" }}>&nbsp;</span>}
      </p>
    </div>
  )
}
