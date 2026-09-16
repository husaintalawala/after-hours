import type { Metadata } from "next"
import EmailPreferencesPage from "@/components/email/EmailPreferencesPage"
import { postEmailPreferences } from "@/lib/drift/emailPreferencesServer"
import {
  mapPrefsUpstream,
  readEmailPrefsResponse,
  readToken,
  type EmailPrefsResponse,
} from "@/lib/drift/emailPreferences"

// Deliberately OUTSIDE /app and its (protected) group: this is where the footer
// of every optional Drift email lands, and the person clicking it may not have
// an account, may be signed out, or may be on a phone that has never seen the
// web app. Signing in to unsubscribe is exactly what anti-spam law forbids. The
// URL is fixed by the edge functions (preferencesUrl in _shared/email-prefs.ts),
// which is why it is /email/preferences and not somewhere under /app.
//
// middleware.ts carves /email out of the marketing rewrite, or this page would
// 404 on drift.after-hours.app, the one host the links point at.
export const metadata: Metadata = {
  title: "Email preferences — Drift",
  // A page reached only through a personal link has nothing to offer a search
  // engine, and its URL carries that link.
  robots: { index: false, follow: false },
  icons: { icon: "/drift-logo.png", shortcut: "/drift-logo.png", apple: "/drift-logo.png" },
}

export const dynamic = "force-dynamic"

/** Short: this only saves the page a loading line. On a slow edge function the
 *  page renders without it and the browser asks again. */
const FIRST_LOOK_TIMEOUT_MS = 6_000

/**
 * The preferences for the link, fetched while the page renders, so someone
 * arriving from an email sees their switches in the first paint instead of a
 * spinner. `get` changes nothing, which matters: link scanners in corporate mail
 * open every URL in a letter, and this is safe for them to open.
 *
 * Only a verdict worth rendering is passed on — the switches, or "this link is
 * not valid". Anything else (a timeout, a function not deployed) is left for
 * the browser to retry, rather than drawn as a state.
 */
async function firstLook(token: string | null): Promise<EmailPrefsResponse | null> {
  if (!token) return null
  try {
    const upstream = await postEmailPreferences({
      body: JSON.stringify({ t: token, action: "get" }),
      contentType: "application/json",
      timeoutMs: FIRST_LOOK_TIMEOUT_MS,
    })
    const res = readEmailPrefsResponse(mapPrefsUpstream(upstream.status, upstream.text).body)
    if ((res.ok && res.subscribed) || res.code === "invalid_token") return res
    return null
  } catch {
    return null
  }
}

export default async function EmailPreferencesRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const raw = (await searchParams).t
  const token = readToken(raw)
  const initial = await firstLook(token)

  return (
    <>
      {/* Fraunces (display). The root marketing layout only loads Inter. */}
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap"
        rel="stylesheet"
      />
      <main className="min-h-screen bg-aurora-midnight font-drift-body text-aurora-ink">
        <div className="mx-auto w-full max-w-xl px-5 py-10 sm:py-16">
          <EmailPreferencesPage token={token} linkMalformed={raw !== undefined && !token} initial={initial} />
        </div>
      </main>
    </>
  )
}
