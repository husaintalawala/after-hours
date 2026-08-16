// Loading boundary for /app (Home) itself. Home is this segment's own
// page.tsx, so its skeleton must live at the segment level — every sibling
// route (trips, place, activity, …) carries its OWN loading.tsx so none of
// them ever flash this fixed-position home frame.
//
// Mirrors HomeShell's geometry exactly: dark globe canvas filling the
// viewport, desktop glass trip rail at left-[100px], mobile sheet at
// mt-[44vh] — so the swap to the real shell doesn't jump.
export default function Loading() {
  return (
    <div className="relative">
      {/* Globe canvas placeholder — same ground GlobeHero paints while loading */}
      <div className="fixed inset-0" style={{ background: "rgb(4,4,8)" }} />

      {/* Desktop: floating glass trip rail */}
      <aside className="fixed bottom-8 left-[100px] top-6 z-10 hidden w-[380px] flex-col overflow-hidden rounded-[26px] border border-white/40 bg-aurora-glass/95 shadow-aurora-glow lg:flex">
        <div className="p-6">
          <div className="flex items-center gap-3.5">
            <div className="h-14 w-14 shrink-0 animate-pulse rounded-full bg-aurora-glass2 motion-reduce:animate-none" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-5 w-36 animate-pulse rounded-md bg-aurora-glass2 motion-reduce:animate-none" />
              <div className="h-3 w-24 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
            </div>
          </div>
          <div className="mt-5 flex gap-7 border-b border-drift-divider pb-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-5 w-8 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
                <div className="h-3 w-14 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
              </div>
            ))}
          </div>
          <div className="mt-4 h-12 animate-pulse rounded-full bg-aurora-glass2 motion-reduce:animate-none" />
          <div className="mt-6 h-5 w-24 animate-pulse rounded-md bg-aurora-glass2 motion-reduce:animate-none" />
          <div className="mt-2.5 h-[150px] animate-pulse rounded-2xl bg-aurora-glass2 motion-reduce:animate-none" />
          <div className="mt-6 h-5 w-28 animate-pulse rounded-md bg-aurora-glass2 motion-reduce:animate-none" />
          <ul className="mt-2 space-y-1">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 p-2">
                <div className="h-12 w-12 shrink-0 animate-pulse rounded-xl bg-aurora-glass2 motion-reduce:animate-none" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
                  <div className="h-3 w-24 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Mobile: sheet-over-globe */}
      <div className="relative z-10 mt-[44vh] rounded-t-[28px] bg-aurora-glass pb-28 shadow-[0_-8px_30px_rgba(0,0,0,0.25)] lg:hidden">
        <div className="mx-auto w-full max-w-2xl px-5">
          <div className="flex justify-center pt-3">
            <div className="h-1 w-9 rounded-full bg-drift-divider" />
          </div>
          <div className="mt-4 flex items-center gap-4">
            <div className="h-16 w-16 shrink-0 animate-pulse rounded-full bg-aurora-glass2 motion-reduce:animate-none" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-6 w-44 animate-pulse rounded-md bg-aurora-glass2 motion-reduce:animate-none" />
              <div className="h-3 w-24 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
            </div>
          </div>
          <div className="mt-4 flex gap-8 border-b border-drift-divider pb-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-5 w-8 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
                <div className="h-3 w-14 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
              </div>
            ))}
          </div>
          <div className="mt-6 h-6 w-28 animate-pulse rounded-md bg-aurora-glass2 motion-reduce:animate-none" />
          <div className="mt-3 h-[220px] animate-pulse rounded-[14px] bg-aurora-glass2 motion-reduce:animate-none" />
          <div className="mt-8 h-6 w-32 animate-pulse rounded-md bg-aurora-glass2 motion-reduce:animate-none" />
          <div className="mt-3 h-[220px] animate-pulse rounded-[14px] bg-aurora-glass2 motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  )
}
