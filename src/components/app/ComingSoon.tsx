// Placeholder for logged-in surfaces not yet built (Phase 2+). Keeps the
// nav dock's tabs navigable during Phase 0 without 404s.
export default function ComingSoon({ title }: { title: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="font-drift-display text-3xl font-medium">{title}</h1>
      <p className="mt-2 text-drift-muted">Coming soon to the web app.</p>
    </main>
  )
}
