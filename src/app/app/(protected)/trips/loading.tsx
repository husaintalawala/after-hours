// Archive skeleton — the back chip, the title row, and two bands of cards.
//
// THE DETAIL SILHOUETTE MOVED DOWN A LEVEL. This file used to hold the trip
// hero + two-column shape, which was right while `[id]` was the only page in
// this segment. Adding `trips/page.tsx` (the "All trips" archive) made that
// skeleton the archive's fallback too, so tapping "All trips" painted a large
// photo hero and a fake right-hand sidebar and then swapped to a grid of small
// cards — nothing on screen during the wait resembled what arrived. The hero
// version now lives at `[id]/loading.tsx`, where it is accurate.
//
// It has to exist at all: the segment above documents that every sibling route
// carries its own loading.tsx so none of them flashes the home's frame.
//
// `trips/new` renders synchronously and never suspends, so it shows no
// skeleton either way.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-6 lg:max-w-[1400px] lg:px-10">
      <div className="flex items-center gap-4">
        <div className="h-11 w-11 shrink-0 animate-pulse rounded-2xl bg-aurora-glass motion-reduce:animate-none" />
        <div className="h-8 w-44 animate-pulse rounded-lg bg-aurora-glass motion-reduce:animate-none" />
      </div>
      {[0, 1].map((band) => (
        <section key={band} className="mt-9">
          <div className="h-3 w-20 animate-pulse rounded bg-aurora-glass motion-reduce:animate-none" />
          <div className="mt-3.5 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3.5">
            {Array.from({ length: band === 0 ? 2 : 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[168px] animate-pulse rounded-card bg-aurora-glass motion-reduce:animate-none"
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
