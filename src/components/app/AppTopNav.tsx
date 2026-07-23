"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

// Desktop chrome: slim frosted top bar — wordmark, nav links, avatar.
// Adaptive: over the Home globe (dark space) it renders as dark glass;
// everywhere else as light paper. Mobile keeps the floating dock.

const LINKS = [
  { href: "/app", label: "Home", exact: true },
  { href: "/app/discover", label: "Discover" },
  { href: "/app/chats", label: "Chats" },
  { href: "/app/activity", label: "Activity" },
]

export default function AppTopNav({
  initial,
  avatarUrl,
}: {
  initial: string
  avatarUrl: string | null
}) {
  const pathname = usePathname()
  const dark = pathname === "/app" // the globe page
  const isActive = (l: (typeof LINKS)[number]) =>
    l.exact ? pathname === l.href : pathname.startsWith(l.href)

  return (
    <nav
      className={`sticky top-0 z-40 hidden h-[60px] items-center gap-6 px-8 lg:flex ${
        dark
          ? // No backdrop-blur over the animating globe canvas — recomputing a
            // blur every WebGL frame is a jank multiplier. Solid dark instead.
            "border-b border-white/10 bg-[rgba(8,8,12,0.72)]"
          : "border-b border-aurora-border bg-aurora-glass/95 backdrop-blur-xl"
      }`}
    >
      <Link
        href="/app"
        className="font-drift-display text-[24px] font-semibold tracking-tight text-drift-coral outline-none focus-visible:ring-2 focus-visible:ring-drift-coral/50"
      >
        drift
      </Link>

      <div className="ml-auto flex items-center gap-1">
        {LINKS.map((l) => {
          const active = isActive(l)
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-full px-3.5 py-1.5 text-[13.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-drift-coral/50 ${
                active
                  ? dark
                    ? "bg-white/15 font-semibold text-white"
                    : "bg-drift-coral-50 font-semibold text-drift-coral"
                  : dark
                    ? "font-medium text-white/70 hover:text-white"
                    : "font-medium text-drift-muted hover:text-drift-ink"
              }`}
            >
              {l.label}
            </Link>
          )
        })}
      </div>

      <Link
        href="/app/settings"
        aria-label="Settings"
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-drift-coral/50"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className={`h-[34px] w-[34px] rounded-full object-cover ${
              dark
                ? "shadow-[0_0_0_2px_rgba(255,255,255,0.9)]"
                : "shadow-[0_0_0_2px_#fff,0_0_0_3.5px_rgba(224,86,59,0.35)]"
            }`}
          />
        ) : (
          <span
            className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-[14px] font-bold text-white shadow-[0_0_0_2px_rgba(255,255,255,0.9)]"
            style={{ background: "linear-gradient(135deg,#E0563B,#BF780A)" }}
          >
            {initial}
          </span>
        )}
      </Link>
    </nav>
  )
}
