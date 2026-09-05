// Inspire skeleton — the shape of InspireShell: title, subtitle, the search
// field, the category tile rail, the twelve-month chart, then a card rail.
//
// WHY THIS FILE EXISTS. Inspire was the one section on the nav with no loading
// boundary of its own, so it fell through to the boundary at the top of the
// logged-in app — which draws HOME's skeleton: a fixed full-viewport dark
// ground and a sheet starting 44% down the screen. Tapping Inspire therefore
// showed a black band and a home-shaped ghost, then swapped the whole layout
// out for something that looked nothing like it. It is also the longest wait in
// the app (force-dynamic, and it reads every guide's whole snapshot), so it is
// the section that could least afford the wrong skeleton.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-28 pt-6">
      <div className="h-9 w-32 animate-pulse rounded-lg bg-aurora-glass2 motion-reduce:animate-none" />
      <div className="mt-3 h-4 w-4/5 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />

      {/* Search */}
      <div className="mt-5 h-11 w-full animate-pulse rounded-full bg-aurora-glass2 motion-reduce:animate-none" />

      {/* Category tiles */}
      <div className="mt-5 flex gap-3 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[104px] w-[150px] shrink-0 animate-pulse rounded-2xl bg-aurora-glass2 motion-reduce:animate-none"
          />
        ))}
      </div>

      {/* The twelve-month chart */}
      <div className="mt-7 border-t border-aurora-border pt-6">
        <div className="h-3 w-36 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
        <div className="mt-4 flex items-end gap-[5px]">
          {[38, 52, 70, 61, 44, 30, 22, 26, 66, 74, 48, 36].map((h, i) => (
            <div
              key={i}
              style={{ height: `${h}px` }}
              className="flex-1 animate-pulse rounded-md bg-aurora-glass2 motion-reduce:animate-none"
            />
          ))}
        </div>
      </div>

      {/* A rail of guides */}
      <div className="mt-7 border-t border-aurora-border pt-6">
        <div className="h-5 w-44 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
        <div className="mt-3 flex gap-3 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-[248px] w-[216px] shrink-0 animate-pulse rounded-[20px] bg-aurora-glass2 motion-reduce:animate-none"
            />
          ))}
        </div>
      </div>
    </main>
  )
}
