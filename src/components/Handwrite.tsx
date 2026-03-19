"use client"
import { useEffect, useRef } from "react"

export default function Handwrite() {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const paths = svg.querySelectorAll("path")
    let totalDelay = 1500
    paths.forEach((path) => {
      const length = path.getTotalLength()
      path.style.strokeDasharray = String(length)
      path.style.strokeDashoffset = String(length)
      path.style.animation = "none"
      path.getBoundingClientRect()
      const duration = Math.max(0.3, length / 300)
      path.style.transition = `stroke-dashoffset ${duration}s ease ${totalDelay}ms`
      setTimeout(() => {
        path.style.strokeDashoffset = "0"
      }, 50)
      totalDelay += duration * 700
    })
  }, [])

  return (
    <div className="px-6" style={{ transform: "rotate(-2deg)" }}>
      <svg ref={svgRef} viewBox="0 0 800 120" className="w-[85vw] max-w-[750px]" fill="none" xmlns="http://www.w3.org/2000/svg">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@500&display=swap');
        `}</style>
        <text x="400" y="80" textAnchor="middle" style={{ fontFamily: "'Caveat', cursive", fontSize: "60px", fontWeight: 500 }} stroke="rgba(245,245,247,0.5)" strokeWidth="1.2" fill="none">welcome to our side quest</text>
      </svg>
    </div>
  )
}
