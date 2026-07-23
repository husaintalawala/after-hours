"use client"

import { useEffect, useState } from "react"

// Trip-cover weather pill (web port of the iOS TripHeroWeatherPill). Non-blocking
// Open-Meteo fetch (free, no key) for the trip's lead destination → current temp,
// condition icon, and day High/Low. Honors the Units setting (localStorage
// driftUnits: "us" → °F, "metric" → °C). Renders nothing until it has data, so
// it never flashes an empty chip over the hero.

interface WX {
  temp: number
  high: number
  low: number
  code: number
}

// WMO weather codes → emoji (Open-Meteo `weather_code`).
function icon(code: number): string {
  if (code === 0) return "☀️"
  if (code <= 3) return "⛅"
  if (code === 45 || code === 48) return "🌫️"
  if (code >= 51 && code <= 67) return "🌧️"
  if (code >= 71 && code <= 77) return "❄️"
  if (code >= 80 && code <= 82) return "🌦️"
  if (code >= 85 && code <= 86) return "🌨️"
  if (code >= 95) return "⛈️"
  return "☁️"
}

export default function TripWeather({
  lat,
  lng,
  place,
}: {
  lat: number
  lng: number
  place: string
}) {
  const [wx, setWx] = useState<WX | null>(null)
  const [unit, setUnit] = useState<"us" | "metric">("us")

  useEffect(() => {
    const u = (typeof window !== "undefined" && localStorage.getItem("driftUnits")) === "metric" ? "metric" : "us"
    setUnit(u)
    let cancelled = false
    const tempUnit = u === "metric" ? "celsius" : "fahrenheit"
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min` +
      `&temperature_unit=${tempUnit}&timezone=auto&forecast_days=1`
    ;(async () => {
      try {
        const r = await fetch(url)
        if (!r.ok) return
        const d = await r.json()
        if (cancelled) return
        const temp = d?.current?.temperature_2m
        const code = d?.current?.weather_code
        const high = d?.daily?.temperature_2m_max?.[0]
        const low = d?.daily?.temperature_2m_min?.[0]
        if (temp == null) return
        setWx({ temp: Math.round(temp), high: Math.round(high), low: Math.round(low), code: code ?? 3 })
      } catch {
        /* fail-soft: no pill */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [lat, lng])

  if (!wx) return null
  const deg = unit === "metric" ? "°" : "°"

  return (
    <div className="aurora-on-photo flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-white shadow-lg">
      <div className="text-right leading-tight">
        <p className="text-[9.5px] font-bold uppercase tracking-wider text-white/70">{place}</p>
        <p className="mt-0.5 flex items-center justify-end gap-1.5 text-[22px] font-semibold leading-none">
          <span className="text-[18px]">{icon(wx.code)}</span>
          {wx.temp}
          {deg}
        </p>
        <p className="mt-1 text-[11px] font-medium text-white/75">
          H:{wx.high}
          {deg} L:{wx.low}
          {deg}
        </p>
      </div>
    </div>
  )
}
