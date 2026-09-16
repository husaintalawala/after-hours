import { createClient } from "@/lib/supabase/client"
import { clearUserClientState } from "@/lib/drift/clientState"

/**
 * Sign out, forget the account in this browser, and leave by a HARD navigation.
 *
 * Every sign-out control and the end of account deletion come through here, so
 * "signed out" means the same thing everywhere. The three buttons used to each
 * call auth.signOut() and router.push("/app/login"), which left per-account
 * storage and the PostHog identity behind (see clearUserClientState) and kept
 * the App Router's cache of protected pages alive in the tab — Back could show
 * a page from the account that had just left.
 *
 * window.location.replace, not push: the cached RSC payloads and the bfcache
 * entry go with the document, and Back does not return to a signed-in page.
 *
 * `beforeLeave` runs after the clear and before the navigation, for the one
 * caller that needs to hand something to the next page (the deletion receipt)
 * without it being wiped.
 */
export async function signOutAndForget(
  destination = "/app/login",
  beforeLeave?: () => void
): Promise<void> {
  const auth = createClient().auth
  let userId: string | null = null
  try {
    userId = (await auth.getSession()).data.session?.user?.id ?? null
    // Global scope ends every session server-side. auth-js already drops the
    // local session when the server answers 401/403/404 (an account that was
    // just deleted), but not on a network failure — so fall back to local,
    // which never touches the network, rather than leave the cookies in place.
    const { error } = await auth.signOut()
    if (error) await auth.signOut({ scope: "local" })
  } catch {
    /* offline — the local forgetting below still runs */
  }
  await clearUserClientState(userId)
  beforeLeave?.()
  window.location.replace(destination)
}
