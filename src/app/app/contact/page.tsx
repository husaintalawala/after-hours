import type { Metadata } from "next"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import ContactForm from "@/components/app/ContactForm"

// Deliberately OUTSIDE the (protected) route group. Everything in that group
// redirects to /app/login when there is no session, and the one person most
// likely to need this page is the one who cannot get in. Sitting here, the
// route serves both auth states from a single URL — the same reason
// /app/login lives outside it too.
export const metadata: Metadata = {
  title: "Contact — Drift",
  description: "Tell us what broke, what you wish Drift did, or what made the trip.",
}

export default async function ContactPage() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const accountEmail = session?.user?.email ?? null

  return (
    <>
      {/* Fraunces (display). The root marketing layout only loads Inter. */}
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap"
        rel="stylesheet"
      />
      <main className="min-h-screen bg-aurora-midnight font-drift-body text-aurora-ink">
        <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:py-20">
          <Link
            href={accountEmail ? "/app" : "/"}
            className="mb-10 inline-flex items-center gap-2 text-[13px] text-aurora-ink3 transition-colors hover:text-aurora-ink2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
            {accountEmail ? "Back to Drift" : "Back to drift"}
          </Link>

          <ContactForm accountEmail={accountEmail} />
        </div>
      </main>
    </>
  )
}
