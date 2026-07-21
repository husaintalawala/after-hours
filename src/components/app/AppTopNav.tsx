"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

// Desktop chrome: slim frosted top bar — wordmark, nav links, avatar.
// Mobile keeps the floating dock (AppNav); this renders lg+ only.

const LINKS = [
  { href: "/app", label: "Home", exact: true },
  { href: "/app/discover", label: "Discover" },
  { href: "/app/trips", label: "Trips" },
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
  const isActive = (l: (typeof LINKS)[number]) =>
    l.exact ? pathname === l.href : pathname.startsWith(l.href)

  return (
    <nav className="sticky top-0 z-40 hidden h-[60px] items-center gap-6 border-b border-[#EBE7E1] bg-[rgba(250,248,245,0.82)] px-8 backdrop-blur-xl lg:flex">
      <Link
        href="/app"
        className="font-drift-display text-[24px] font-semibold tracking-tight text-drift-coral"
      >
        drift
      </Link>

      <div className="ml-auto flex items-center gap-1">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href === "/app/trips" ? "/app" : l.href}
            className={`rounded-full px-3.5 py-1.5 text-[13.5px] transition-colors ${
              isActive(l)
                ? "bg-drift-coral-50 font-semibold text-drift-coral"
                : "font-medium text-drift-muted hover:text-drift-ink"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </div>

      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className="h-[34px] w-[34px] rounded-full object-cover shadow-[0_0_0_2px_#fff,0_0_0_3.5px_rgba(224,86,59,0.35)]"
        />
      ) : (
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-[14px] font-bold text-white shadow-[0_0_0_2px_#fff,0_0_0_3.5px_rgba(224,86,59,0.35)]"
          style={{ background: "linear-gradient(135deg,#E0563B,#BF780A)" }}
        >
          {initial}
        </span>
      )}
    </nav>
  )
}
