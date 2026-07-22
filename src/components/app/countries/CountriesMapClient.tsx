"use client"

import dynamic from "next/dynamic"

// Client boundary so the heavy, browser-only mapbox-gl module is lazy-loaded
// (ssr:false) — the Countries page itself is a Server Component.
const CountriesMap = dynamic(() => import("./CountriesMap"), {
  ssr: false,
  loading: () => <div className="h-[220px] w-full rounded-2xl bg-[#F1EEE8]" />,
})

export default function CountriesMapClient({ codes }: { codes: string[] }) {
  return <CountriesMap codes={codes} />
}
