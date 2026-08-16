// Activity skeleton — grouped notification feed: date headers + rows of
// avatar circle / text line / time stamp, in the page's max-w-2xl column.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-28 pt-6">
      <div className="h-9 w-36 animate-pulse rounded-lg bg-aurora-glass motion-reduce:animate-none" />
      {[4, 5].map((rows, g) => (
        <section key={g} className="mt-7">
          <div className="h-6 w-24 animate-pulse rounded-md bg-aurora-glass motion-reduce:animate-none" />
          <ul className="mt-2 space-y-1">
            {Array.from({ length: rows }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 rounded-2xl px-3.5 py-3">
                <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-aurora-glass motion-reduce:animate-none" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div
                    className="h-4 animate-pulse rounded bg-aurora-glass motion-reduce:animate-none"
                    style={{ width: `${60 + ((i * 13) % 30)}%` }}
                  />
                </div>
                <div className="h-3 w-8 shrink-0 animate-pulse rounded bg-aurora-glass motion-reduce:animate-none" />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}
