"use client"

export default function SavedError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="mx-auto w-full max-w-2xl px-5 pb-28 pt-6 lg:max-w-[1100px] lg:px-8">
      <h1 className="font-drift-display text-[24px] font-bold text-aurora-ink">Saved</h1>
      <p className="mt-10 text-aurora-ink">Couldn’t load your saved guides.</p>
      <p className="mt-2 text-sm text-drift-muted">Please try again in a moment.</p>
      <button onClick={reset} className="mt-5 rounded-full bg-aurora-teal px-4 py-2 text-sm font-semibold text-aurora-teal-ink">Try again</button>
    </div>
  )
}
