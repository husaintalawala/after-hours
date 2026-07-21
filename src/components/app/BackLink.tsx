"use client"

import Link from "next/link"

// The one back affordance for the whole logged-in app. Every non-root screen
// (trip studio, place detail, settings, people, countries, new-trip flow) uses
// this so the up-path is identical everywhere. `href` is the LOGICAL parent —
// a real route, not history.back() — so back resolves correctly even when the
// screen is loaded cold via a direct/deep link.
//
// Two skins, same shape: `glass` sits over a dark hero image (matches the
// TripTabs "Your stops" drill-in pill exactly); `plain` sits on the cream
// canvas. A chevron that nudges left on hover; coral focus ring.

const Chevron = () => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M15 18l-6-6 6-6" />
  </svg>
)

export default function BackLink({
  href,
  label,
  variant = "plain",
  className = "",
}: {
  href: string
  label: string
  variant?: "plain" | "glass"
  className?: string
}) {
  const base =
    "group inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-drift-coral/40"
  const skin =
    variant === "glass"
      ? "border border-white/25 bg-white/15 text-white backdrop-blur-xl hover:bg-white/25"
      : "border border-drift-divider bg-white/80 text-drift-muted shadow-sm backdrop-blur-sm hover:border-drift-ink/15 hover:text-drift-ink"

  return (
    <Link
      href={href}
      aria-label={`Back to ${label}`}
      className={`${base} ${skin} ${className}`}
    >
      <span className="transition-transform group-hover:-translate-x-0.5">
        <Chevron />
      </span>
      {label}
    </Link>
  )
}
