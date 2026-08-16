// Chats skeleton — reproduces ChatsShell's FIXED frame (a document-flow
// skeleton here would jump on swap). Desktop: sidebar column of session rows +
// open-thread pane. Mobile: full-screen thread with the h-14 top bar.

function Bubbles() {
  return (
    <div className="mx-auto w-full max-w-[780px] space-y-5 px-5 py-6">
      <div className="h-4 w-3/4 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
      <div className="flex justify-end">
        <div className="h-11 w-2/5 animate-pulse rounded-[18px] rounded-br-[4px] bg-aurora-glass2 motion-reduce:animate-none" />
      </div>
      <div className="h-4 w-2/3 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
    </div>
  )
}

export default function Loading() {
  return (
    <>
      {/* ---------- Desktop ---------- */}
      <div className="fixed bottom-0 left-[76px] right-0 top-0 hidden lg:flex">
        <aside className="flex w-[284px] shrink-0 flex-col border-r border-aurora-border bg-aurora-glass">
          <div className="p-3 pb-1.5">
            <div className="h-[46px] animate-pulse rounded-[14px] bg-aurora-glass2 motion-reduce:animate-none" />
          </div>
          <div className="min-h-0 flex-1 px-3 pb-3">
            <div className="mx-1.5 mb-1.5 mt-3.5 h-3 w-12 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 px-2.5 py-[7px]">
                <div className="h-[34px] w-[34px] shrink-0 animate-pulse rounded-[10px] bg-aurora-glass2 motion-reduce:animate-none" />
                <div
                  className="h-4 animate-pulse rounded bg-aurora-glass2 motion-reduce:animate-none"
                  style={{ width: `${50 + ((i * 19) % 35)}%` }}
                />
              </div>
            ))}
          </div>
        </aside>
        <main className="min-w-0 flex-1">
          <Bubbles />
        </main>
      </div>

      {/* ---------- Mobile ---------- */}
      <div className="fixed inset-0 z-[60] flex flex-col bg-aurora-midnight lg:hidden">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-aurora-border bg-aurora-midnight2/90 px-3 backdrop-blur-xl">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-aurora-glass motion-reduce:animate-none" />
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-aurora-glass motion-reduce:animate-none" />
          <div className="flex min-w-0 flex-1 justify-center">
            <div className="h-5 w-32 animate-pulse rounded bg-aurora-glass motion-reduce:animate-none" />
          </div>
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-aurora-glass motion-reduce:animate-none" />
        </div>
        <div className="min-h-0 flex-1">
          <Bubbles />
        </div>
      </div>
    </>
  )
}
