// Settings skeleton — avatar header + option rows in SettingsShell's
// max-w-xl column. Exists so /app/settings doesn't inherit the fixed
// home-globe fallback from the segment-level loading.tsx.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-xl px-5 pb-32 pt-8 lg:pt-12">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 shrink-0 animate-pulse rounded-full bg-aurora-glass motion-reduce:animate-none" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-6 w-44 animate-pulse rounded-md bg-aurora-glass motion-reduce:animate-none" />
          <div className="h-3 w-28 animate-pulse rounded bg-aurora-glass motion-reduce:animate-none" />
        </div>
      </div>
      <div className="mt-7 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-14 animate-pulse rounded-2xl bg-aurora-glass motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  )
}
