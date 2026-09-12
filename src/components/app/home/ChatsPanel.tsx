import Link from "next/link"

/**
 * A way IN to chat, not a copy of it.
 *
 * This panel used to list recent threads, and listing them was the wrong job
 * for it. The column sits beside the globe on the home screen, and what it
 * showed was a shorter, worse version of the Chats tab one click away: rows
 * whose titles came from trips, several reading as the bare word "Chat", and a
 * count nobody needed. It answered "what have I already asked?" — which is a
 * question people ask by going to Chats.
 *
 * What the home is for is starting something. So the panel now offers QUESTIONS,
 * and every one of them is a live link that lands in the Chats tab with the
 * question already typed — `?ask=` is the parameter the composer and trips/[id]
 * have carried for a while, so this is the existing convention rather than a
 * third one.
 *
 * The questions are written for the reader — the place they are going, when,
 * how they said they like to travel — in homePrompts.ts. Nothing here is
 * hardcoded, which is the whole difference between this and the empty state it
 * grew out of: that one offered "Add a rest day before Samarkand" to somebody
 * flying to Bhutan.
 */
export default function ChatsPanel({ prompts }: { prompts: string[] }) {
  return (
    <section className="flex flex-col overflow-hidden rounded-hero border border-aurora-border bg-aurora-glass lg:h-full">
      <header className="flex items-baseline gap-2.5 px-5 pb-3 pt-5">
        <h2 className="font-drift-display text-[18px] font-bold tracking-[-0.02em] text-aurora-ink">
          Ask Drift
        </h2>
        <Link
          href="/app/chats"
          className="ml-auto text-[12.5px] font-semibold text-aurora-teal outline-none focus-visible:ring-2 focus-visible:ring-aurora-teal/50"
        >
          Your chats →
        </Link>
      </header>

      {/* `justify-center` because this is a short list in a tall column on a
          laptop: three questions pinned to the top of a 400px tile leaves the
          rest reading as something that failed to load, where centred they read
          as the contents of the card. */}
      <div className="flex flex-1 flex-col justify-center border-t border-aurora-border px-5 py-5">
        {/* No preamble. A sentence explaining that Drift knows your trips was
            saying in words what the three questions below demonstrate by
            naming your actual trip — and on a short column it cost a line that
            the questions themselves could use. */}
        <div className="flex flex-col gap-2">
          {prompts.map((q) => (
            <Link
              key={q}
              href={`/app/chats?ask=${encodeURIComponent(q)}`}
              className="group flex items-center gap-2.5 rounded-xl border border-aurora-border bg-aurora-glass2 px-3 py-2.5 outline-none transition-colors hover:border-aurora-teal/40 focus-visible:ring-2 focus-visible:ring-aurora-teal/40"
            >
              <span
                aria-hidden
                className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-aurora-teal/15 text-aurora-teal"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <span className="min-w-0 flex-1 font-drift-display text-[13px] font-light italic leading-snug text-aurora-ink2 transition-colors group-hover:text-aurora-ink">
                {q}
              </span>
              <span
                aria-hidden
                className="shrink-0 text-[13px] text-aurora-ink3 transition-colors group-hover:text-aurora-teal"
              >
                →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
