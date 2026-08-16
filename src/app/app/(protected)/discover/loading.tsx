// Discover skeleton — reproduces DiscoverShell's FIXED split frame. Desktop:
// results panel (title, location pill, category chips, 2-col card grid) + the
// dark map pane. Mobile: full-bleed map ground with the floating top chrome.
export default function Loading() {
  return (
    <div className="fixed inset-0 lg:left-[76px] lg:right-0 lg:grid lg:grid-cols-[minmax(0,600px)_minmax(0,1fr)]">
      {/* Desktop results panel */}
      <div className="relative z-10 hidden h-full min-h-0 flex-col overflow-y-auto border-r border-drift-divider bg-aurora-glass px-6 pt-6 lg:flex">
        <div className="h-9 w-40 animate-pulse rounded-lg bg-aurora-glass2 motion-reduce:animate-none" />
        <div className="mt-4 h-[46px] animate-pulse rounded-full bg-aurora-glass2 motion-reduce:animate-none" />
        <div className="mt-3 flex gap-2 pb-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-8 w-24 shrink-0 animate-pulse rounded-full bg-aurora-glass2 motion-reduce:animate-none"
            />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 pb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-aurora-border bg-aurora-glass">
              <div className="h-[132px] w-full animate-pulse bg-aurora-glass2 motion-reduce:animate-none" />
              <div className="space-y-2 p-3">
                <div className="h-4 w-4/5 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Map pane — same dark ground DiscoverMap paints while loading */}
      <div className="absolute inset-0 bg-aurora-midnight2 lg:relative lg:inset-auto lg:h-full" />

      {/* Mobile floating chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-44 bg-gradient-to-b from-black/70 via-black/25 to-transparent lg:hidden" />
      <div className="absolute inset-x-0 top-0 z-30 px-4 pt-4 lg:hidden">
        <div className="h-[46px] animate-pulse rounded-full bg-aurora-glass motion-reduce:animate-none" />
        <div className="mt-3 flex gap-2 overflow-hidden pb-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-8 w-24 shrink-0 animate-pulse rounded-full bg-aurora-glass motion-reduce:animate-none"
            />
          ))}
        </div>
      </div>
    </div>
  )
}
