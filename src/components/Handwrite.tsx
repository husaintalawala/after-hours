"use client"
import { useState, useEffect } from "react"

const message = "welcome to our side quest"

export default function Handwrite() {
  const [charCount, setCharCount] = useState(0)

  useEffect(() => {
    const delay = setTimeout(() => {
      let i = 0
      const write = () => {
        i++
        setCharCount(i)
        if (i < message.length) {
          const pause = message[i] === " " ? 40 : (60 + Math.random() * 80)
          setTimeout(write, pause)
        }
      }
      write()
    }, 1500)
    return () => clearTimeout(delay)
  }, [])

  return (
    <div className="text-center px-6" style={{ transform: "rotate(-2deg)" }}>
      <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500&display=swap" rel="stylesheet" />
      <p style={{
        fontFamily: "'Caveat', cursive",
        fontSize: "clamp(32px, 6vw, 64px)",
        fontWeight: 500,
        color: "rgba(245,245,247,0.5)",
        letterSpacing: "0.01em",
        lineHeight: 1.2,
        textShadow: "0 2px 20px rgba(0,0,0,0.6)",
        minHeight: "1.5em",
      }}>
        {message.slice(0, charCount)}
      </p>
    </div>
  )
}
