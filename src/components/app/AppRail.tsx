"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

// Desktop-only left nav rail — the desktop analog of the mobile bottom dock
// (AppNav). A persistent 76px vertical rail on the Aurora Deep Midnight canvas:
// brand mark, a create-trip CTA, the four sections, and the avatar. Bottom docks
// are a mobile idiom; on desktop this frees the full width + height for content.
type Item = { href: string; label: string; exact?: boolean; icon: React.ReactNode }

const NAV: Item[] = [
  { href: "/app", label: "Home", exact: true, icon: <path d="M3 11.5l9-8 9 8M5 10v10h5v-6h4v6h5V10" /> },
  {
    href: "/app/discover",
    label: "Discover",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M15.5 8.5l-2.2 5-5 2.2 2.2-5z" />
      </>
    ),
  },
  {
    // A folded map: a trip somebody already walked, in the order they walked it.
    // Deliberately not another compass or star — Discover already owns those,
    // and Inspire is not searching, it is picking a pattern off the shelf.
    href: "/app/inspire",
    label: "Inspire",
    icon: (
      <>
        <path d="M9 3.5L3 6v14.5l6-2.5 6 2.5 6-2.5V3.5l-6 2.5-6-2.5z" />
        <path d="M9 3.5v14.5M15 6v14.5" />
      </>
    ),
  },
  { href: "/app/chats", label: "Chats", icon: <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" /> },
  // Activity is off the nav for now to de-congest it — five tabs plus the
  // create button left nothing room to breathe, and Activity is the one whose
  // permanent home is undecided. The route, its page and its icon all stay;
  // restoring it is uncommenting this entry.
  // {
  //   href: "/app/activity",
  //   label: "Activity",
  //   icon: (
  //     <>
  //       <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
  //       <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  //     </>
  //   ),
  // },
]

export default function AppRail({
  initial,
  avatarUrl,
}: {
  initial: string
  avatarUrl: string | null
}) {
  const pathname = usePathname()
  const isActive = (i: Item) => (i.exact ? pathname === i.href : pathname.startsWith(i.href))

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-[76px] flex-col items-center border-r border-white/[0.07] bg-aurora-midnight py-4">
      <Link href="/app" aria-label="Drift home" className="mb-3 outline-none focus-visible:ring-2 focus-visible:ring-aurora-teal/50">
        {/* Real Drift comet mark. eslint-disable-next-line @next/next/no-img-element */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/drift-logo.png" alt="Drift" width={38} height={38} className="h-[38px] w-[38px] object-contain" />
      </Link>

      <Link
        href="/app/trips/new"
        aria-label="New trip"
        className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-drift-coral text-white shadow-md shadow-drift-coral/25 outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-drift-coral/50"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6 fill-white">
          <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z" />
        </svg>
      </Link>

      <nav className="flex w-full flex-col items-center gap-1.5">
        {NAV.map((i) => {
          const on = isActive(i)
          return (
            <Link
              key={i.href}
              href={i.href}
              aria-label={i.label}
              className={`flex w-[60px] flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-aurora-teal/40 ${
                on ? "bg-aurora-glass2 text-aurora-teal" : "text-aurora-ink/45 hover:text-aurora-ink"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[21px] w-[21px]"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {i.icon}
              </svg>
              {i.label}
            </Link>
          )
        })}
      </nav>

      <Link
        href="/app/settings"
        aria-label="Settings"
        className="mt-auto outline-none focus-visible:ring-2 focus-visible:ring-drift-coral/50 rounded-full"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className="h-9 w-9 rounded-full object-cover shadow-[0_0_0_2px_rgba(255,255,255,0.85)]"
          />
        ) : (
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full text-[14px] font-bold text-white shadow-[0_0_0_2px_rgba(255,255,255,0.85)]"
            style={{ background: "linear-gradient(135deg,#37D6C4,#6B5CFF)" }}
          >
            {initial}
          </span>
        )}
      </Link>
    </aside>
  )
}
