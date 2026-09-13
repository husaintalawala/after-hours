export default function Loading() {
  return (
    <div role="status" aria-label="Loading Back pocket" className="mx-auto w-full max-w-2xl px-5 pb-28 pt-6 lg:max-w-[1100px] lg:px-8">
      <div aria-hidden="true" className="h-9 w-40 animate-pulse rounded-lg bg-aurora-glass2 motion-reduce:animate-none" />
      <div aria-hidden="true" className="mt-7 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-[230px] animate-pulse rounded-hero bg-aurora-glass2 motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  )
}
