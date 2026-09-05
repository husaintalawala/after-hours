// One guide's skeleton — the shape of PatternView: a tall cover, the counted
// chips, the opening paragraph, then a stop and its places.
//
// Same reason as the shelf's: without this the guide inherited HOME's skeleton
// from the top of the logged-in app, so opening a guide showed a home-shaped
// ghost and then swapped the entire layout.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-2xl pb-28">
      {/* Cover */}
      <div className="h-[46vh] min-h-[280px] w-full animate-pulse bg-aurora-glass2 motion-reduce:animate-none" />

      <div className="px-5">
        {/* Counted chips */}
        <div className="mt-5 flex gap-2 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-9 w-24 shrink-0 animate-pulse rounded-full bg-aurora-glass2 motion-reduce:animate-none"
            />
          ))}
        </div>

        {/* The opening, in the author's voice */}
        <div className="mt-6 space-y-2.5">
          <div className="h-6 w-full animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
          <div className="h-6 w-11/12 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
          <div className="h-6 w-3/4 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
        </div>

        {/* A stop, and the places inside it */}
        <div className="mt-9">
          <div className="h-7 w-40 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
          <div className="mt-3 h-40 w-full animate-pulse rounded-[18px] bg-aurora-glass2 motion-reduce:animate-none" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="mt-4 flex gap-3">
              <div className="h-[68px] w-[68px] shrink-0 animate-pulse rounded-2xl bg-aurora-glass2 motion-reduce:animate-none" />
              <div className="min-w-0 flex-1 space-y-2 pt-1">
                <div className="h-4 w-1/2 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
                <div className="h-3.5 w-full animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
                <div className="h-3.5 w-4/5 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
