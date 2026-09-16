import { createClient } from "@/lib/supabase/server"
import DeleteAccountFlow from "@/components/app/settings/DeleteAccountFlow"

// Delete account — the web half of iOS DeleteAccountView: what happens, then
// confirm it's you, then progress. Its own page rather than a confirm inline in
// Settings, because the honest answer to "what happens" now depends on the
// account (shared trips handed over, the group's ledger kept) and needs room.
//
// WHETHER TO REVOKE GOOGLE IS DECIDED HERE, before anything is deleted. The
// revoke runs in the browser after the server delete succeeds, and by then
// import_sources — one of the two signals — has been deleted with the account;
// the old flow re-read it on every retry, so a retry after a partial failure
// skipped the revoke. A Google identity counts too: signing in with Google
// grants Drift access at Google whether or not a Gmail scan ever ran.
export default async function DeleteAccountPage() {
  const supabase = await createClient()
  // getUser, not the layout's cookie read: identities come from the auth
  // server, and this page is rare enough that the round trip costs nothing.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: sources, error } = await supabase
    .from("import_sources")
    .select("provider")
    .in("provider", ["gmail", "calendar"])
    .limit(1)

  const googleConnected =
    (user.identities ?? []).some((i) => i.provider === "google") ||
    // Can't tell → attempt the revoke rather than silently skip it.
    !!error ||
    ((sources ?? []) as unknown[]).length > 0

  return <DeleteAccountFlow email={user.email ?? null} googleConnected={googleConnected} />
}
