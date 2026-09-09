"use client"

import { useEffect, useRef, useState } from "react"

/**
 * The ground under the first-run flow: one continuous sunrise, midnight at the
 * first question and full daybreak when the trip lands.
 *
 * This is the flow's progress bar, and the reason there is barely a real one. A
 * six-dot pager tells you how many screens are left; the sky tells you the same
 * thing without asking to be read.
 *
 * INTERPOLATED RATHER THAN SWITCHED, because every screen here has a back
 * button. Six discrete backgrounds would snap backwards as harshly as they
 * advance; a continuous ramp runs the sun back down. CSS cannot transition a
 * background-image, so the ramp is tweened in JS and the gradient is rebuilt
 * per frame — one full-screen radial fill, and only while a screen is changing.
 *
 * Ported from Drift/Views/DaybreakSky.swift; the stage table is the same six
 * triples, byte for byte.
 */

/** Top, middle and ground for each of the six stages. Hand-picked rather than
 *  generated: a linear ramp from navy to orange passes through a muddy
 *  grey-green around stage 3, and the whole effect depends on that stretch
 *  reading as indigo instead. */
const STAGES: ReadonlyArray<readonly [string, string, string]> = [
  ["#16203A", "#0A0E18", "#05070C"],
  ["#1C2748", "#0C1220", "#06080E"],
  ["#2A2E5C", "#121A2E", "#080B12"],
  ["#4A3A66", "#1B2038", "#090C14"],
  ["#8A5560", "#2A2745", "#0B0E17"],
  ["#FFA96B", "#8B5A72", "#0C1019"],
]

const DURATION_MS = 750

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = channels(a)
  const [br, bg, bb] = channels(b)
  const k = Math.min(1, Math.max(0, t))
  return `rgb(${Math.round(ar + (br - ar) * k)},${Math.round(ag + (bg - ag) * k)},${Math.round(
    ab + (bb - ab) * k
  )})`
}

/** The sky at any point between midnight (0) and daybreak (1). */
function skyAt(progress: number): { top: string; mid: string; low: string } {
  const x = Math.min(1, Math.max(0, progress)) * (STAGES.length - 1)
  const i = Math.min(STAGES.length - 2, Math.floor(x))
  const t = x - i
  const [a, b] = [STAGES[i], STAGES[i + 1]]
  return { top: mix(a[0], b[0], t), mid: mix(a[1], b[1], t), low: mix(a[2], b[2], t) }
}

export default function DaybreakSky({ progress }: { progress: number }) {
  const eased = useTween(progress)
  const { top, mid, low } = skyAt(eased)

  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          // 620px and the drifting centre are the SwiftUI RadialGradient's own
          // numbers; the three stops sit at 0/50/100 because SwiftUI spaces an
          // unweighted colour array evenly.
          backgroundImage: `radial-gradient(circle 620px at ${(50 + 10 * eased).toFixed(
            1
          )}% ${(2 - 8 * eased).toFixed(1)}%, ${top} 0%, ${mid} 50%, ${low} 100%)`,
          backgroundColor: low,
        }}
      />
      {/* Stars burn off as the sun comes up. Kept faint at full dark too — this
          sits behind text on every screen, and a bright starfield under a 30px
          serif headline is noise, not atmosphere. */}
      <Stars opacity={Math.max(0, 0.5 - eased * 0.62)} />
      {/* THE SUNRISE'S OWN TRAP. By the last screen the top of the sky is
          #FFA96B and the flow's secondary text is aurora-ink3 (#7D8C98) — grey
          on peach, which is very nearly invisible while every earlier screen
          looks fine. The headline survives (white, heavy); the subtitle does
          not. Darkening the sky instead would undo the sunrise, so a scrim
          rides in behind the text as the sun comes up. Zero at midnight, when
          there is nothing to protect against. The other half of the fix is in
          DaybreakSteps: the subtitle is ink2, never ink3. */}
      <div
        className="absolute inset-x-0 top-0 h-[340px]"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,${(0.42 * eased).toFixed(
            3
          )}), rgba(0,0,0,0))`,
        }}
      />
    </div>
  )
}

/** Ease-in-out from wherever the sky is to wherever it is going. */
function useTween(target: number): number {
  const [value, setValue] = useState(target)
  const from = useRef(target)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    const start = performance.now()
    const a = from.current
    if (a === target) return
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS)
      // Same curve as the iOS .easeInOut the flow animates the sky with.
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      const next = a + (target - a) * e
      from.current = next
      setValue(next)
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current)
    }
  }, [target])

  return value
}

/**
 * A fixed starfield — 70 stars, the same count and the same radius and opacity
 * ranges as the iOS Canvas.
 *
 * DETERMINISTIC ON PURPOSE, and computed once at module scope: a field that
 * reshuffles on every render twinkles when the view merely re-renders, which
 * reads as a rendering fault rather than as sky — and on web it would also be a
 * hydration mismatch, since the server and the browser would draw different
 * stars.
 *
 * A 32-BIT GENERATOR, not iOS's 64-bit LCG. tsconfig targets ES2017, where a
 * BigInt literal will not compile, and the two platforms drawing the SAME
 * seventy dots is worth nothing — what matters is that each of them always
 * draws the same seventy.
 */
const STARS = (() => {
  let seed = 0x5eed1234
  const next = () => {
    // mulberry32.
    seed = (seed + 0x6d2b79f5) | 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return Array.from({ length: 70 }, () => ({
    cx: next() * 1000,
    cy: next() * 1000,
    r: 0.5 + next() * 1.1,
    o: 0.25 + next() * 0.65,
  }))
})()

function Stars({ opacity }: { opacity: number }) {
  if (opacity <= 0) return null
  return (
    // `slice` rather than `none`: stretching the viewBox to the window would
    // draw the stars as ellipses, which is the one thing a star cannot be.
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 1000 1000"
      preserveAspectRatio="xMidYMid slice"
      style={{ opacity }}
    >
      {STARS.map((s, i) => (
        <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="#fff" fillOpacity={s.o} />
      ))}
    </svg>
  )
}
