import { resetAnalytics } from "@/lib/analytics"
import { DAYBREAK_COOKIE, DAYBREAK_COOKIE_MAX_AGE, readSeen } from "@/lib/drift/daybreak"

/**
 * Forget the signed-in account in THIS browser.
 *
 * ONE routine for sign-out and for account deletion — the web half of iOS
 * AccountLocalData.eraseAll. Before it, signing out only dropped the auth
 * cookies: the places someone browsed (drift.discover.recents.<uid>), which
 * trips they had activated, their default privacy, the Daybreak cookie carrying
 * their uuid for a year, and a PostHog identity that kept filing this browser's
 * autocapture and exceptions under a person who had left — or who no longer
 * existed at all.
 *
 * WHAT GOES: every localStorage key under the app's own prefixes (`drift.` and
 * `drift_`), the one per-account key that predates them, all of sessionStorage
 * (tab-scoped, and nothing in it should outlive the account), this account's id
 * in the Daybreak cookie, and the PostHog identity.
 *
 * WHAT STAYS: device facts rather than account facts — language, region,
 * currency and units (`driftLanguage` …, no separator, deliberately not
 * matched), and the first-seen date the anonymous funnel counts from. iOS keeps
 * the theme for the same reason.
 *
 * Every step is independent and swallowed: storage throws in private windows
 * and in browsers that block site data, and a sign-out that cannot finish is
 * worse than one that forgets slightly less.
 */

export interface ClientStateEnv {
  localStorage: Storage | null
  sessionStorage: Storage | null
  readCookies: () => string
  writeCookie: (cookie: string) => void
  /** Whether the page is served over https, so a rewritten cookie keeps Secure. */
  secure: boolean
  resetAnalytics: () => Promise<void> | void
}

/** Per-account, but named before the drift.* / drift_* convention existed. */
const LEGACY_ACCOUNT_KEYS = new Set(["defaultTripPrivacy"])
/** Under the prefix, but about the browser rather than the account. */
const DEVICE_KEYS = new Set(["drift_first_seen"])

export function isAccountKey(key: string): boolean {
  if (DEVICE_KEYS.has(key)) return false
  return key.startsWith("drift.") || key.startsWith("drift_") || LEGACY_ACCOUNT_KEYS.has(key)
}

function browserEnv(): ClientStateEnv | null {
  if (typeof window === "undefined") return null
  const storage = (pick: () => Storage): Storage | null => {
    try {
      return pick()
    } catch {
      return null
    }
  }
  return {
    localStorage: storage(() => window.localStorage),
    sessionStorage: storage(() => window.sessionStorage),
    readCookies: () => document.cookie,
    writeCookie: (cookie) => {
      document.cookie = cookie
    },
    secure: window.location.protocol === "https:",
    resetAnalytics,
  }
}

export async function clearUserClientState(
  userId: string | null,
  env: ClientStateEnv | null = browserEnv()
): Promise<void> {
  if (!env) return

  const local = env.localStorage
  if (local) {
    try {
      // Collected first: removing while indexing shifts every later key down.
      const doomed: string[] = []
      for (let i = 0; i < local.length; i++) {
        const key = local.key(i)
        if (key && isAccountKey(key)) doomed.push(key)
      }
      for (const key of doomed) local.removeItem(key)
    } catch {
      /* storage blocked — nothing was readable to leak either */
    }
  }

  try {
    env.sessionStorage?.clear()
  } catch {
    /* noop */
  }

  // THIS account only. The cookie lists every account that has met the
  // first-run flow in this browser (see markDaybreakSeen); expiring all of it
  // would reopen that flow for everyone else who signs in here.
  if (userId) {
    try {
      const seen = readSeen(env.readCookies())
      if (seen.includes(userId)) {
        const rest = seen.filter((id) => id !== userId)
        const secure = env.secure ? "; Secure" : ""
        env.writeCookie(
          rest.length
            ? `${DAYBREAK_COOKIE}=${rest.join(".")}; Path=/; Max-Age=${DAYBREAK_COOKIE_MAX_AGE}; SameSite=Lax${secure}`
            : `${DAYBREAK_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
        )
      }
    } catch {
      /* noop */
    }
  }

  try {
    await env.resetAnalytics()
  } catch {
    /* analytics must never break the app */
  }
}
