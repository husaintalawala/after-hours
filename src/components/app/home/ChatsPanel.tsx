import Link from "next/link"
import type { HomeChat } from "@/components/app/home/HomeShell"

/**
 * The threads already running, beside the bar that starts new ones.
 *
 * Chats had a tab in the rail and no presence whatever on the page that tab
 * opens onto — a whole section of the product you could only reach by
 * remembering it was there. The division with AskBar is deliberate and is why
 * this panel has no composer of its own: the bar starts something, this
 * resumes something. Two inputs for one job is how you get two half-used ones.
 *
 * IT DOES NOT SELF-REMOVE, and the first cut of this was wrong to. The
 * reasoning then was that an empty titled box is a dead band — true of a
 * full-width band stacked under others, and false here. This is one of three
 * columns in a fixed row, so rendering nothing leaves a 380px hole beside the
 * globe and the answer to "where is chat?" becomes "it looks broken". An
 * account with no threads is also exactly the account that has never found the
 * feature, so the empty state is the only version of this panel it will ever
 * see: it gets a sentence and a way in, not a blank.
 */
export default function ChatsPanel({ chats }: { chats: HomeChat[] }) {
  if (chats.length === 0) return <EmptyChats />

  return (
    <section className="flex flex-col overflow-hidden rounded-hero border border-aurora-border bg-aurora-glass lg:h-full">
      <header className="flex items-baseline gap-2.5 px-5 pb-3 pt-5">
        <h2 className="font-drift-display text-[18px] font-bold tracking-[-0.02em] text-aurora-ink">
          Chats
        </h2>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-aurora-ink3">
          {chats.length === 1 ? "1 open" : `${chats.length} open`}
        </span>
        <Link
          href="/app/chats"
          className="ml-auto text-[12.5px] font-semibold text-aurora-teal outline-none focus-visible:ring-2 focus-visible:ring-aurora-teal/50"
        >
          All →
        </Link>
      </header>

      {/* flex-1 on the list and on each row: the panel is one of three tiles in
          a fixed-height row on a laptop, so the rows share whatever height is
          left rather than the tile growing a gap under the last one. */}
      <div className="flex flex-1 flex-col">
        {chats.map((c) => (
          <Link
            key={c.id}
            href={`/app/chats?session=${encodeURIComponent(c.id)}`}
            className="flex flex-1 items-center gap-3 border-t border-aurora-border px-5 py-3 outline-none transition-colors hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-aurora-teal/40"
          >
            <span
              aria-hidden
              className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl border border-white/10"
              style={{
                background:
                  "linear-gradient(135deg, rgba(55,214,196,0.18), rgba(107,92,255,0.18))",
              }}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color: "#37D6C4" }}
              >
                <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
              </svg>
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold leading-tight text-aurora-ink">
                {c.title}
              </span>
              {c.anchorLabel && (
                <span className="mt-0.5 block truncate text-[11.5px] leading-tight text-aurora-ink3">
                  {c.anchorLabel}
                </span>
              )}
            </span>

            {c.lastMessageAt && (
              <time
                dateTime={c.lastMessageAt}
                className="shrink-0 self-start pt-0.5 font-mono text-[9.5px] text-aurora-ink3"
              >
                {shortAgo(c.lastMessageAt)}
              </time>
            )}
          </Link>
        ))}
      </div>
    </section>
  )
}

/**
 * The panel before there is anything in it.
 *
 * Holds the column so the cockpit stays three across, and spends the space on
 * the one thing worth saying to somebody who has never opened Chats: what it
 * is for, in the app's own examples rather than a feature description.
 */
function EmptyChats() {
  return (
    <section className="flex flex-col overflow-hidden rounded-hero border border-aurora-border bg-aurora-glass lg:h-full">
      <header className="flex items-baseline gap-2.5 px-5 pb-3 pt-5">
        <h2 className="font-drift-display text-[18px] font-bold tracking-[-0.02em] text-aurora-ink">
          Chats
        </h2>
        <Link
          href="/app/chats"
          className="ml-auto text-[12.5px] font-semibold text-aurora-teal outline-none focus-visible:ring-2 focus-visible:ring-aurora-teal/50"
        >
          Open →
        </Link>
      </header>

      <div className="flex flex-1 flex-col justify-center gap-3 border-t border-aurora-border px-5 py-5">
        <p className="text-[13px] leading-relaxed text-aurora-ink2">
          Ask Drift anything about a trip and the thread stays here — it already
          knows your dates and your stops.
        </p>
        <div className="flex flex-col gap-2">
          {[
            "What's open on a Monday?",
            "Add a rest day before Samarkand",
            "Somewhere warm in March",
          ].map((q) => (
            <Link
              key={q}
              href={`/app/chats?ask=${encodeURIComponent(q)}`}
              className="truncate rounded-xl border border-aurora-border bg-aurora-glass2 px-3 py-2 font-drift-display text-[13px] font-light italic text-aurora-ink2 outline-none transition-colors hover:border-aurora-teal/40 hover:text-aurora-ink focus-visible:ring-2 focus-visible:ring-aurora-teal/40"
            >
              {q}
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * "2m", "Tue", "14 Aug" — a timestamp the width of a thumbnail.
 *
 * Rendered on the SERVER, and that is safe here in a way `daysUntil` is not:
 * this is a coarse elapsed-time label, so a few hours of timezone skew between
 * the server's clock and the reader's cannot change "Tue" into "Wed" the way it
 * flips a countdown between 20 and 21 days. Anything under a week is relative
 * and needs no calendar at all.
 */
function shortAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const mins = Math.round((Date.now() - then) / 60_000)
  if (mins < 1) return "now"
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 7) {
    return new Date(iso).toLocaleDateString("en-US", { weekday: "short" })
  }
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short" })
}
