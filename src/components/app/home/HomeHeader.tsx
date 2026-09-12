"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

// The top of the logged-in home: the mark, the reader, and one sentence in the
// display serif that names the time of day and asks the only question this app
// exists to answer.

/**
 * Which greeting, and it is answered in the BROWSER — never on the server.
 *
 * "What time is it" is a question about the reader's clock, and the server
 * answers it in its own timezone: a machine in California renders "Good
 * evening" into HTML that a phone in Lisbon hydrates at breakfast. That is a
 * hydration mismatch on the largest sentence on the page — the same trap
 * `daysUntil` in HomeShell already documents.
 */
function greetingFor(hour: number): string {
  if (hour < 5) return "Still up"
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

export default function HomeHeader({
  displayName,
  avatarUrl,
  isSelf,
}: {
  displayName: string
  avatarUrl: string | null
  isSelf: boolean
}) {
  const [greeting, setGreeting] = useState<string | null>(null)

  useEffect(() => {
    setGreeting(greetingFor(new Date().getHours()))
  }, [])

  const firstName = displayName.trim().split(/\s+/)[0] || displayName

  return (
    <header className="pt-4 lg:pt-6">
      {/* THE MARK AND THE AVATAR ARE PHONE CHROME.
          On a phone there is no rail, so this row is the only route to the
          brand and to account actions. Above lg the rail carries BOTH — its
          own Drift mark at the top and RailAvatar at its foot — so rendering
          them again here was two logos (from two different files,
          drift-icon.svg and drift-logo.png) and two account menus on one
          screen. Hidden, not deleted: narrow viewports still need it. */}
      <div className="flex items-center justify-between gap-4 lg:hidden">
        <Link href="/app" aria-label="Drift home" className="shrink-0">
          {/* THE LOGO, not a paper-plane. drift-icon.svg is a generic teal
              navigation arrow on a rounded square — a placeholder that read as
              a map pin rather than as Drift. This is the real mark, cropped out
              of drift-logo.png (which is a 1024px canvas that is 88% empty, so
              dropping it into a 28px box straight would have rendered the comet
              at about ten pixels, off-centre). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/drift-mark.png" alt="Drift" className="h-7 w-7 object-contain" />
        </Link>

        {isSelf ? (
          <AvatarMenu url={avatarUrl} name={displayName} />
        ) : (
          <Avatar url={avatarUrl} name={displayName} size={36} />
        )}
      </div>

      {/* On a laptop the question moved into AskBar, where it can be answered,
          so the greeting alone is left here and drops to a single quiet line
          rather than a 40px two-line headline over an input that repeats it. */}
      <h1 className="mt-5 font-drift-display text-[26px] font-bold leading-[1.12] tracking-[-0.03em] text-aurora-ink sm:text-[30px] lg:mt-0 lg:text-[25px] lg:font-light lg:italic lg:text-aurora-ink2">
        {/* The salutation holds its line from the first paint even while null,
            so the question below does not jump when the effect lands. */}
        <span className="block min-h-[1.12em]">
          {greeting ? (
            <>
              {greeting},{" "}
              <span className="lg:font-black lg:not-italic lg:text-aurora-ink">{firstName}.</span>
            </>
          ) : (
            " "
          )}
        </span>
        {isSelf && (
          <span className="block font-light italic text-aurora-ink2 lg:hidden">
            Where are we going next?
          </span>
        )}
      </h1>
    </header>
  )
}

/**
 * The avatar, and everything that used to be scattered around the page.
 *
 * Sign out was a bare text link floating in the middle of the home — the only
 * account action on the phone, sitting between a rail of trips and a rail of
 * guides with nothing around it to say what it belonged to. Settings was
 * reachable only from the desktop rail, so on a phone there was no route to it
 * at all. Both are account actions and the avatar is what a person taps looking
 * for account actions, so both live behind it.
 */
function AvatarMenu({ url, name }: { url: string | null; name: string }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Close on an outside press and on Escape. A menu that can only be dismissed
  // by choosing something from it is a trap on a touch screen.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("touchstart", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("touchstart", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="block rounded-full outline-none focus-visible:ring-2 focus-visible:ring-aurora-teal/60"
      >
        <Avatar url={url} name={name} size={36} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[46px] z-40 w-44 overflow-hidden rounded-2xl border border-aurora-border bg-aurora-glass2 py-1 shadow-[0_10px_34px_rgba(0,0,0,0.5)] backdrop-blur-xl"
        >
          <Link
            href="/app/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-[13.5px] font-medium text-aurora-ink transition-colors hover:bg-white/[0.06]"
          >
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false)
              await createClient().auth.signOut()
              router.push("/app/login")
              router.refresh()
            }}
            className="block w-full px-4 py-2.5 text-left text-[13.5px] font-medium text-aurora-ink2 transition-colors hover:bg-white/[0.06] hover:text-aurora-ink"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * The reader's own photograph when there is one, their initial when there is
 * not — `url` comes from profiles.avatar_url through buildHomeData.
 *
 * The ring was `drift-coral/70`: a re-pointed token still NAMED for a retired
 * colour. Teal at the same weight, said in the token that means it.
 */
export function Avatar({
  url,
  name,
  size,
}: {
  url: string | null
  name: string
  size: number
}) {
  const style = { width: size, height: size }
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      style={style}
      className="rounded-full object-cover ring-2 ring-aurora-teal/60"
    />
  ) : (
    <div
      style={style}
      className="flex items-center justify-center rounded-full bg-aurora-glass2 font-drift-display font-bold text-aurora-teal ring-2 ring-aurora-teal/60"
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  )
}
