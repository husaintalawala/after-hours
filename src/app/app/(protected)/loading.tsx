// Loading boundary for /app (Home) itself. Home is this segment's own page.tsx,
// so its skeleton must live at the segment level — every sibling route (trips,
// place, activity, …) carries its OWN loading.tsx so none of them ever flashes
// this frame.
//
// IT MIRRORS THE SHELL'S GEOMETRY, and that is the whole job. The previous
// version mirrored the previous shell faithfully: a `fixed inset-0` canvas
// painted rgb(4,4,8) under a 44vh spacer, because the globe used to fill the
// viewport. Against the current home that is simply a black screen — the void
// reported on both platforms. Nothing was broken; the skeleton was describing a
// layout that no longer exists.
//
// So the rule this file lives by: when the home's bands change, this changes
// with them. Greeting, three CTA cards, the passport panel, then two rails —
// in the same order, at the same sizes, with the same gutters, so the swap to
// the real shell does not jump.
const shimmer = "animate-pulse bg-aurora-glass2 motion-reduce:animate-none"

export default function Loading() {
  return (
    <div className="min-h-[100dvh] bg-aurora-midnight pb-24 lg:pb-20">
      <div className="mx-auto w-full max-w-2xl lg:mx-0 lg:max-w-[1180px]">
        {/* The top band — stacked on a phone, two columns across a laptop, the
            same grid the shell uses. */}
        <div className="px-5 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8 lg:px-10">
          <div className="min-w-0">
            {/* Header — mark left, avatar right, then the two greeting lines. */}
            <header className="pt-4 lg:pt-8">
              <div className="flex items-center justify-between">
                <div className={`h-7 w-7 rounded-md ${shimmer}`} />
                <div className={`h-9 w-9 rounded-full ${shimmer}`} />
              </div>
              <div className={`mt-5 h-[29px] w-[68%] rounded-md sm:h-[34px] lg:h-[45px] ${shimmer}`} />
              <div className={`mt-2 h-[29px] w-[55%] rounded-md sm:h-[34px] lg:h-[45px] ${shimmer}`} />
            </header>

            {/* CTA rail — three 172×126 cards, the real size. */}
            <div className="mt-6 flex gap-3 overflow-hidden">
              {[0, 1, 2].map((i) => (
                <div key={i} className={`h-[126px] w-[172px] shrink-0 rounded-hero ${shimmer}`} />
              ))}
            </div>
          </div>

          {/* Passport panel. */}
          <div className={`mt-6 h-[142px] rounded-hero sm:h-[160px] lg:mt-8 ${shimmer}`} />
        </div>

        {/* Your trips — heading, the featured cover at its real ratio, a rail. */}
        <section className="mt-8">
          <div className="px-5 lg:px-10">
            <div className={`h-[22px] w-32 rounded-md ${shimmer}`} />
            <div
              className={`mt-3 aspect-[3/2] rounded-hero sm:aspect-[16/9] lg:aspect-[21/9] ${shimmer}`}
            />
          </div>
          <div className="mt-3 flex gap-3 overflow-hidden px-5 lg:px-10">
            {[0, 1].map((i) => (
              <div key={i} className={`h-[168px] w-[196px] shrink-0 rounded-card ${shimmer}`} />
            ))}
          </div>
        </section>

        {/* One more rail — the shelf. Two are enough to say "more below"
            without pretending to know how many bands this account gets. */}
        <section className="mt-8">
          <div className="px-5 lg:px-10">
            <div className={`h-[22px] w-44 rounded-md ${shimmer}`} />
          </div>
          <div className="mt-3 flex gap-3 overflow-hidden px-5 lg:px-10">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`h-[218px] w-[164px] shrink-0 rounded-hero ${shimmer}`} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
