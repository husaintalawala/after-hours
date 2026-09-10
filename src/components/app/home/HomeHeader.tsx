"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

// The top of the logged-in home: the mark, the reader, and one sentence in the
// display serif that names the time of day and asks the only question this app
// exists to answer.
//
// It replaces a 64px avatar over a 22px name at the head of a glass sheet —
// which read as a profile page, not a home. The greeting is the difference:
// a profile describes who you are, a home asks where you are going.

/**
 * Which greeting, and it is answered in the BROWSER — never on the server.
 *
 * "What time is it" is a question about the reader's clock, and the server
 * answers it in its own timezone: a machine in California renders "Good
 * evening" into HTML that a phone in Lisbon hydrates at breakfast. That is a
 * hydration mismatch on the largest sentence on the page.
 *
 * This is the same trap `daysUntil` in HomeShell already documents, and the
 * same fix — render nothing time-bound on the server, fill it in from an
 * effect. The first paint therefore carries the name but not the salutation,
 * which is why `part` starts null rather than at a guess.
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
  /** A stranger's profile gets the mark and their name, never "where are WE going". */
  isSelf: boolean
}) {
  const [greeting, setGreeting] = useState<string | null>(null)

  useEffect(() => {
    setGreeting(greetingFor(new Date().getHours()))
  }, [])

  // FIRST NAME ONLY. "Good morning, Husain Saifuddin Talawala" is a form field
  // read aloud; the whole point of the sentence is that it sounds like a person
  // talking. Falls back to the whole string when there is no space to split on.
  const firstName = displayName.trim().split(/\s+/)[0] || displayName

  return (
    <header className="px-5 pt-4 lg:px-10 lg:pt-8">
      <div className="flex items-center justify-between gap-4">
        <Link href="/app" aria-label="Drift home" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/drift-icon.svg" alt="Drift" className="h-7 w-7" />
        </Link>

        <Link
          href={isSelf ? "/app/settings" : "#"}
          aria-label={isSelf ? "Settings" : undefined}
          className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-aurora-teal/60"
          tabIndex={isSelf ? undefined : -1}
        >
          <Avatar url={avatarUrl} name={displayName} size={36} />
        </Link>
      </div>

      {/* THE SENTENCE. Two clauses on two lines, the second in a lighter
          italic — the salutation is the greeting, the question is the point,
          and setting them at one weight makes neither. */}
      <h1 className="mt-5 font-drift-display text-[26px] font-bold leading-[1.12] tracking-[-0.03em] text-aurora-ink sm:text-[30px] lg:text-[40px]">
        {/* The salutation occupies its line from the first paint even while
            null, so the question below does not jump up and then back down
            when the effect lands. */}
        <span className="block min-h-[1.12em]">
          {greeting ? `${greeting}, ${firstName}.` : ` `}
        </span>
        {isSelf && (
          <span className="block font-light italic text-aurora-ink2">
            Where are we going next?
          </span>
        )}
      </h1>
    </header>
  )
}

/**
 * Shared with HomeShell's sheet copy — exported so the two cannot drift apart
 * the way the desktop and mobile stat rows once did.
 *
 * The ring was `drift-coral/70`, which is a re-pointed token still NAMED for a
 * retired colour. Teal at the same weight, said in the token that means it.
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
