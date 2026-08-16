// People skeleton — back button, title, the two tab pills, then avatar rows
// with a follow-pill slot, in the page's max-w-xl column. Also covers
// people/[id] (profile) navigations; the list silhouette is the close match.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-xl px-5 pb-32 pt-8 lg:pt-12">
      <div className="mb-5 h-11 w-11 animate-pulse rounded-[15px] bg-aurora-glass motion-reduce:animate-none" />
      <div className="h-8 w-28 animate-pulse rounded-lg bg-aurora-glass motion-reduce:animate-none" />

      {/* Tabs */}
      <div className="mt-5 flex gap-2">
        <div className="h-9 w-36 animate-pulse rounded-full bg-aurora-glass motion-reduce:animate-none" />
        <div className="h-9 w-36 animate-pulse rounded-full bg-aurora-glass motion-reduce:animate-none" />
      </div>

      <ul className="mt-5 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <li
            key={i}
            className="flex items-center gap-3.5 rounded-2xl border border-aurora-border bg-aurora-glass p-3.5"
          >
            <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-aurora-glass2 motion-reduce:animate-none" />
            <div className="min-w-0 flex-1 space-y-2">
              <div
                className="h-4 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none"
                style={{ width: `${45 + ((i * 17) % 30)}%` }}
              />
              <div className="h-3 w-24 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
            </div>
            <div className="h-8 w-20 shrink-0 animate-pulse rounded-full bg-aurora-glass2 motion-reduce:animate-none" />
          </li>
        ))}
      </ul>
    </div>
  )
}
