"use client"

import Link from "next/link"
import type { ReactNode } from "react"

// The three ways to start something, immediately under the greeting.
//
// WHY THEY EXIST AT ALL: an account with one trip used to render one card and
// then several hundred pixels of nothing. The gap was never a spacing bug — the
// page simply had no second thing to say. These are the second thing, and they
// are the same three on a full account as an empty one, which is what stops the
// home from having a "sad" state and a "real" state.

interface Cta {
  key: string
  title: string
  subtitle: string
  icon: ReactNode
  /** Absent = the feature does not exist yet; the card renders inert. */
  href?: string
  /** Tailwind gradient stops. Teal is the action accent; indigo is AI. */
  gradient: string
}

const strokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}

const CTAS: Cta[] = [
  {
    key: "trip",
    title: "Create a trip",
    subtitle: "Start from a blank map",
    href: "/app/trips/new",
    // The filled teal action, same gradient as every primary CTA in the app.
    gradient: "from-aurora-teal to-aurora-teal-end",
    icon: (
      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" {...strokeProps}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    ),
  },
  {
    key: "chat",
    title: "Start a chat",
    subtitle: "Ask Drift where to go",
    href: "/app/chats",
    // Teal→indigo is the app's AI gradient (iOS auroraGradient). Drift chat is
    // the one place it belongs on this page.
    gradient: "from-aurora-teal to-aurora-indigo",
    icon: (
      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" {...strokeProps}>
        <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.3-.6L3 21l1.7-4.6A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z" />
      </svg>
    ),
  },
  {
    key: "collection",
    title: "New collection",
    subtitle: "Group places you love",
    // NO HREF ON PURPOSE. Collections do not exist on web yet — there is no
    // route, no table and no component. A card that navigates to a 404 is
    // worse than one that says it is not ready, so this renders inert with a
    // "Soon" chip. Give it an `href` the day the route lands; nothing else
    // here needs to change.
    gradient: "from-aurora-indigo to-[#8B5CF6]",
    icon: (
      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" {...strokeProps}>
        <path d="M4 7h6l2 2h8v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7Z" />
      </svg>
    ),
  },
]

export default function CtaRow() {
  return (
    // A RAIL, not a grid. Three equal cards in a row is a desktop composition;
    // on a 360px phone it makes three cramped squares. Scrolling keeps each
    // card at a legible width and lets a fourth be added later without a
    // relayout. `-mx-5 px-5` lets the rail bleed to the screen edge while its
    // first card still aligns with the greeting above it.
    <div className="mt-6 -mx-5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:px-0">
      <div className="flex w-max gap-3">
        {CTAS.map((c) => (
          <CtaCard key={c.key} cta={c} />
        ))}
      </div>
    </div>
  )
}

function CtaCard({ cta }: { cta: Cta }) {
  const inner = (
    <>
      <div className="text-aurora-teal-ink/85">{cta.icon}</div>
      <div>
        <p className="font-drift-display text-[16px] font-bold leading-tight tracking-[-0.015em] text-aurora-teal-ink">
          {cta.title}
        </p>
        <p className="mt-0.5 text-[11.5px] font-medium leading-snug text-aurora-teal-ink/70">
          {cta.subtitle}
        </p>
      </div>
    </>
  )

  // Icon top-left, copy bottom — `justify-between` in a fixed-height column, so
  // a two-line subtitle never pushes the icon off the top of the card.
  const shell =
    `flex h-[126px] w-[172px] shrink-0 flex-col justify-between rounded-hero ` +
    `bg-gradient-to-br p-4 ${cta.gradient}`

  if (!cta.href) {
    return (
      <div className={`${shell} relative cursor-default select-none opacity-[0.55]`} aria-disabled>
        <span className="absolute right-3 top-3 rounded-full bg-aurora-teal-ink/20 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.12em] text-aurora-teal-ink">
          Soon
        </span>
        {inner}
      </div>
    )
  }

  return (
    <Link
      href={cta.href}
      className={`${shell} outline-none transition-transform hover:scale-[1.015] focus-visible:ring-2 focus-visible:ring-aurora-ink/70 active:scale-[0.985]`}
    >
      {inner}
    </Link>
  )
}
