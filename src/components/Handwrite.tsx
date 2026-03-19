"use client"
import { useState, useEffect } from "react"

export default function Handwrite() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const start = setTimeout(() => {
      let p = 0
      const draw = () => {
        p += 0.008 + Math.random() * 0.005
        if (p > 1) p = 1
        setProgress(p)
        if (p < 1) requestAnimationFrame(draw)
      }
      requestAnimationFrame(draw)
    }, 1500)
    return () => clearTimeout(start)
  }, [])

  return (
    <div className="px-6" style={{ transform: "rotate(-2deg)" }}>
      <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500&display=swap" rel="stylesheet" />
      <div style={{ overflow: "hidden", display: "inline-block" }}>
        <p style={{
          fontFamily: "'Caveat', cursive",
          fontSize: "clamp(32px, 6vw, 64px)",
          fontWeight: 500,
          color: "rgba(245,245,247,0.5)",
          letterSpacing: "0.01em",
          lineHeight: 1.2,
          textShadow: "0 2px 20px rgba(0,0,0,0.6)",
          whiteSpace: "nowrap",
          clipPath: "inset(0 " + (100 - progress * 100) + "% 0 0)",
        }}>
          welcome to our side quest
        </p>
      </div>
    </div>
  )
}
