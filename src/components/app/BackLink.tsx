"use client"

import Link from "next/link"

// The one back affordance for the whole logged-in app. Every non-root screen
// renders this so the up-path is identical everywhere: a floating white
// squircle with a soft drop shadow and a single bold chevron — an elevated,
// iOS-style back chip (Polarsteps reference). `href` is the LOGICAL parent —
// a real route, not history.back() — so back resolves on cold deep links.
//
// One resting style for both contexts: the white fill + shadow reads over dark
// hero images, and the layered shadow + hairline ring lifts it off the cream
// canvas. Coral focus ring + coral press tint keep it on-brand.

const Chevron = () => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden
    className="h-[22px] w-[22px]"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.75}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M15 18l-6-6 6-6" />
  </svg>
)

export default function BackLink({
  href,
  label,
  className = "",
}: {
  href: string
  /** Used as the accessible name ("Back to {label}"); not rendered visibly. */
  label: string
  className?: string
}) {
  return (
    <Link
      href={href}
      aria-label={`Back to ${label}`}
      className={`group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-white text-drift-ink shadow-[0_6px_16px_-4px_rgba(31,31,36,0.20),0_2px_6px_-2px_rgba(31,31,36,0.12)] ring-1 ring-black/5 outline-none transition-all duration-150 hover:shadow-[0_10px_24px_-6px_rgba(31,31,36,0.26),0_3px_8px_-2px_rgba(31,31,36,0.14)] active:scale-[0.93] active:bg-drift-coral-50 active:text-drift-coral focus-visible:ring-2 focus-visible:ring-drift-coral/60 ${className}`}
    >
      <span className="transition-transform duration-150 group-hover:-translate-x-0.5">
        <Chevron />
      </span>
    </Link>
  )
}
