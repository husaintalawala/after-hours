"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

// Bottom dock — the web analog of the iOS customTabBar (ContentView.swift).
// Four tabs + a coral "+" create-trip CTA. Light frosted bar pinned to the
// bottom. The native LiquidGlass/haptics are intentionally dropped; this is
// a faithful-enough web equivalent.
type TabDef = { href: string; label: string; icon: React.ReactNode }

// Minimal inline icons (SF Symbol analogs) so we don't pull an icon dep.
const icons = {
  profile: (
    <path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4 0-8 2-8 6v1h16v-1c0-4-4-6-8-6z" />
  ),
  discover: (
    <path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2L12 2z" />
  ),
  chats: (
    <path d="M4 4h11a3 3 0 013 3v5a3 3 0 01-3 3H9l-4 3v-3H4a2 2 0 01-2-2V6a2 2 0 012-2z" />
  ),
  activity: (
    <path d="M12 2a6 6 0 00-6 6v4l-2 3v1h16v-1l-2-3V8a6 6 0 00-6-6zm0 20a2.5 2.5 0 002.45-2h-4.9A2.5 2.5 0 0012 22z" />
  ),
}

const tabs: TabDef[] = [
  { href: "/app", label: "Profile", icon: icons.profile },
  { href: "/app/discover", label: "Discover", icon: icons.discover },
  { href: "/app/chats", label: "Chats", icon: icons.chats },
  { href: "/app/activity", label: "Activity", icon: icons.activity },
]

export default function AppNav() {
  const pathname = usePathname()

  const isActive = (href: string) =>
    href === "/app" ? pathname === "/app" : pathname.startsWith(href)

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex justify-center pb-[env(safe-area-inset-bottom)]">
      <div className="mx-3 mb-3 flex w-full max-w-md items-center gap-1.5 rounded-[26px] border border-drift-divider bg-white/85 px-3 py-2 shadow-lg backdrop-blur-xl">
        {tabs.map((tab) => {
          const active = isActive(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-label={tab.label}
              className={`flex h-11 flex-1 items-center justify-center rounded-full transition-colors ${
                active ? "bg-drift-coral/15" : "bg-transparent"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className={`h-5 w-5 ${
                  active ? "fill-drift-coral" : "fill-drift-muted/60"
                }`}
              >
                {tab.icon}
              </svg>
            </Link>
          )
        })}

        <span className="mx-1 h-7 w-px bg-drift-ink/10" />

        <Link
          href="/app/trips/new"
          aria-label="Create new trip"
          className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full bg-drift-coral text-white shadow-md shadow-drift-coral/25"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6 fill-white">
            <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z" />
          </svg>
        </Link>
      </div>
    </nav>
  )
}
