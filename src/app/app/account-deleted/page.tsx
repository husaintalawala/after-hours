import type { Metadata } from "next"
import AccountDeletedReceipt from "@/components/app/settings/AccountDeletedReceipt"

// Deliberately OUTSIDE the (protected) route group. By the time anyone lands
// here there is no account left to be signed in to, and that group would bounce
// them to /app/login — which was exactly the unexplained ending this page
// replaces. Same placement, and the same reason, as /app/contact and /app/login.
export const metadata: Metadata = {
  title: "Account deleted — Drift",
}

export default function AccountDeletedPage() {
  return (
    <>
      {/* Fraunces (display). The root marketing layout only loads Inter. */}
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap"
        rel="stylesheet"
      />
      <main className="min-h-screen bg-aurora-midnight font-drift-body text-aurora-ink">
        <div className="mx-auto w-full max-w-xl px-5 py-12 sm:py-20">
          <AccountDeletedReceipt />
        </div>
      </main>
    </>
  )
}
