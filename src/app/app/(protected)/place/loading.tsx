// Place-detail skeleton — hero + two-col, the silhouette place/[id] renders.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 lg:max-w-[1400px] lg:px-8">
      <div className="h-[240px] animate-pulse rounded-[26px] bg-aurora-glass motion-reduce:animate-none md:h-[330px]" />
      <div className="mt-6 space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_430px] lg:gap-7 lg:space-y-0">
        <div className="space-y-3.5">
          <div className="h-7 w-40 animate-pulse rounded-lg bg-aurora-glass motion-reduce:animate-none" />
          <div className="h-[84px] animate-pulse rounded-[18px] bg-aurora-glass motion-reduce:animate-none" />
          <div className="h-[84px] animate-pulse rounded-[18px] bg-aurora-glass motion-reduce:animate-none" />
          <div className="h-[84px] animate-pulse rounded-[18px] bg-aurora-glass motion-reduce:animate-none" />
        </div>
        <div className="hidden h-[520px] animate-pulse rounded-[22px] bg-aurora-glass motion-reduce:animate-none lg:block" />
      </div>
    </div>
  )
}
