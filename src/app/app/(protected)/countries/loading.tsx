// Passport skeleton — mirrors the Countries page: back button, two
// aspect-square hero tiles, world-map block, flag grid, time tiles, stat grid,
// all in the page's max-w-xl column.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-xl px-5 pb-32 pt-8 lg:pt-12">
      <div className="mb-5 h-11 w-11 animate-pulse rounded-[15px] bg-aurora-glass motion-reduce:animate-none" />

      {/* Hero tiles */}
      <div className="grid grid-cols-2 gap-3">
        <div className="aspect-square animate-pulse rounded-[22px] bg-aurora-glass motion-reduce:animate-none" />
        <div className="aspect-square animate-pulse rounded-[22px] bg-aurora-glass motion-reduce:animate-none" />
      </div>

      {/* Countries visited — map */}
      <section className="mt-8">
        <div className="h-7 w-48 animate-pulse rounded-md bg-aurora-glass motion-reduce:animate-none" />
        <div className="mt-3 h-[220px] w-full animate-pulse rounded-2xl bg-aurora-glass motion-reduce:animate-none" />
        <div className="mt-2.5 h-3 w-40 animate-pulse rounded bg-aurora-glass motion-reduce:animate-none" />
      </section>

      {/* Flags collected */}
      <section className="mt-8">
        <div className="h-7 w-44 animate-pulse rounded-md bg-aurora-glass motion-reduce:animate-none" />
        <div className="mt-3 grid grid-cols-6 gap-y-4 rounded-2xl border border-aurora-border bg-aurora-glass p-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="mx-auto h-7 w-7 animate-pulse rounded-md bg-aurora-glass2 motion-reduce:animate-none"
            />
          ))}
        </div>
      </section>

      {/* Total travel time */}
      <section className="mt-8">
        <div className="h-7 w-40 animate-pulse rounded-md bg-aurora-glass motion-reduce:animate-none" />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="h-28 animate-pulse rounded-2xl bg-aurora-glass motion-reduce:animate-none" />
          <div className="h-28 animate-pulse rounded-2xl bg-aurora-glass motion-reduce:animate-none" />
        </div>
      </section>

      {/* Stat grid */}
      <section className="mt-8 grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl bg-aurora-glass motion-reduce:animate-none"
          />
        ))}
      </section>
    </div>
  )
}
