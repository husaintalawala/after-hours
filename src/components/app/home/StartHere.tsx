import Link from "next/link"
import TripCoverImg from "@/components/app/TripCoverImg"
import CoverCredit from "@/components/app/CoverCredit"
import type { InspirePromo, InspirePromoCard } from "@/lib/drift/inspirePromo"

/**
 * What the home screen offers somebody who has never made a trip.
 *
 * It was two flat grey tiles of equal weight — "Steal a finished trip" and
 * "Start from scratch" — beside an empty globe. Both are rectangles with an
 * emoji on them, so nothing on the screen said what is actually behind the
 * first one: forty real, photographed itineraries. A photo is the only thing on
 * that screen that can, and so the photo IS the button.
 *
 * The two paths are also NOT equal, and the layout now says which is which.
 * Copying a finished trip is a couple of taps and no typing; the new-trip form
 * is the longest road to a populated trip. So one is a photograph and the other
 * is a line of text underneath it.
 */
export default function StartHere({
  promo,
  dense = false,
}: {
  promo: InspirePromo | null
  /** The 380px desktop rail. Same deck, shorter hero. */
  dense?: boolean
}) {
  // A FAILED SHELF QUERY MUST NOT LOOK LIKE A DECK WITH NO PHOTOS IN IT. When
  // the corpus could not be read (it is logged where it failed), this falls back
  // to the screen home already had rather than drawing an outage.
  if (!promo) return <Tiles dense={dense} />

  return (
    <div className={dense ? "pb-4 pt-5" : "py-6"}>
      <p className="mb-3 text-[13px] font-semibold text-aurora-ink">Start here</p>

      <Hero card={promo.hero} dense={dense} />

      {promo.rest.length > 0 && (
        // A horizontal scroller is right in a 380px column and wasteful in an
        // 860px one — four guides hidden off the edge of a panel with room for
        // all of them. It becomes a grid at the width where the panel does.
        <div className="mt-3 flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:grid xl:grid-cols-4 xl:overflow-visible">
          {promo.rest.map((c) => (
            <Tile key={c.tripId} card={c} />
          ))}
        </div>
      )}

      {/* The count is the number of guides actually READ, never a number typed
          into a sentence — the corpus grows, and copy that lies about its own
          size is worse than copy with no number in it. */}
      <Link
        href="/app/inspire"
        className="mt-3 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-aurora-teal outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-aurora-teal/50"
      >
        See all {promo.total} finished trips
        <span aria-hidden="true">→</span>
      </Link>

      {/* Demoted on purpose — see the note at the top of this file. */}
      <p className="mt-3 text-[12.5px] text-aurora-ink3">
        Or{" "}
        <Link
          href="/app/trips/new"
          className="underline underline-offset-2 outline-none hover:text-aurora-ink2 focus-visible:ring-2 focus-visible:ring-aurora-teal/50"
        >
          start one from scratch
        </Link>
        .
      </p>
    </div>
  )
}

/** The big photo. Kicker, the trip's spoken title, and the offer, all on it. */
function Hero({ card, dense }: { card: InspirePromoCard; dense: boolean }) {
  return (
    <article className="relative">
      <div
        className={`relative overflow-hidden rounded-hero ${dense ? "h-[178px]" : "h-[232px]"}`}
      >
        <TripCoverImg
          cover={card.cover}
          sizes={dense ? "332px" : "(max-width: 768px) 100vw, 632px"}
          showCredit={false}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.42) 0%, transparent 38%, rgba(0,0,0,0.86))",
          }}
        />
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3.5">
          <div className="flex items-start justify-between gap-2">
            <span className="rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-white">
              {card.kicker}
            </span>
            {/* Every hero in this corpus is Wikimedia or Unsplash, so it carries
                its credit wherever it is displayed. It rides in the cover result
                rather than beside it, which is what makes it awkward to draw the
                photo and forget the obligation. */}
            {card.cover.credit && (
              <CoverCredit
                text={card.cover.credit.text}
                href={card.cover.credit.href}
                placement="inline"
              />
            )}
          </div>
          <div className="flex items-end justify-between gap-3">
            {/* Clamped: these are the authors' own titles and the longest is
                "Japan with a Little One — Tokyo, Kyoto & Osaka", which at rail
                width sets four lines and pushes itself off the card. */}
            <p
              className={`line-clamp-2 font-drift-display font-bold leading-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)] ${
                dense ? "text-[19px]" : "text-[23px]"
              }`}
            >
              {card.title}
            </p>
            <span className="shrink-0 rounded-full bg-aurora-teal px-3.5 py-2 text-[12.5px] font-bold text-aurora-teal-ink">
              Make it mine
            </span>
          </div>
        </div>
      </div>

      {/* Stretched, not a wrapper: the credit chip is interactive content of its
          own and cannot legally sit inside an anchor. Same shape the Inspire
          shelf card uses. */}
      <Link
        href={card.href}
        aria-label={card.aria}
        className="absolute inset-0 rounded-hero outline-none focus-visible:ring-2 focus-visible:ring-aurora-teal/50"
      />
    </article>
  )
}

/** One of the smaller faces alongside the hero. */
function Tile({ card }: { card: InspirePromoCard }) {
  return (
    <article className="relative w-[190px] shrink-0">
      {/* Credit shown (TripCoverImg's own corner chip) — 190px is wide enough to
          carry it, which is why the tile is not smaller. */}
      <div className="relative h-[118px] overflow-hidden rounded-2xl">
        <TripCoverImg cover={card.cover} sizes="190px" />
      </div>
      <p className="mt-1.5 truncate text-[12.5px] font-semibold text-aurora-ink">
        {card.title}
      </p>
      <p className="truncate text-[11.5px] text-aurora-ink3">{card.kicker}</p>
      <Link
        href={card.href}
        aria-label={card.aria}
        className="absolute inset-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-aurora-teal/50"
      />
    </article>
  )
}

/**
 * The fallback, and only the fallback: the two tiles home carried before the
 * deck existed. Reached when the Inspire query failed, so the screen is the one
 * it has always been rather than a broken version of the new one.
 */
function Tiles({ dense }: { dense: boolean }) {
  return (
    <div className={dense ? "pb-4 pt-5" : "py-6"}>
      <p className="mb-3 text-[13px] font-semibold text-aurora-ink">Start here</p>
      <div className="flex flex-col gap-2.5">
        <Link
          href="/app/inspire"
          className="flex items-center gap-3 rounded-2xl border border-aurora-border bg-aurora-glass p-3.5 transition hover:bg-aurora-glass2"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-aurora-teal/15 text-lg">
            🧭
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-aurora-ink">
              Steal a finished trip
            </span>
            <span className="block text-[12.5px] text-aurora-ink3">
              Real itineraries, with the days already in order.
            </span>
          </span>
        </Link>
        <Link
          href="/app/trips/new"
          className="flex items-center gap-3 rounded-2xl border border-aurora-border bg-aurora-glass p-3.5 transition hover:bg-aurora-glass2"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-lg">
            ✏️
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-aurora-ink">
              Start from scratch
            </span>
            <span className="block text-[12.5px] text-aurora-ink3">
              Name it, pick the dates, fill it in as you go.
            </span>
          </span>
        </Link>
      </div>
    </div>
  )
}
