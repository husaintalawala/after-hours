import "server-only"
import { createClient } from "@/lib/supabase/server"

export interface DriftUpstream {
  functionsBase: string // https://<ref>.supabase.co/functions/v1
  anonKey: string
  token: string // the caller's Supabase access token
}

/**
 * Resolve the upstream Supabase Functions base + the caller's access token from
 * the session cookie. Returns null when there's no authenticated session (the
 * route handler should then 401). The token is read server-side so it never
 * reaches the browser.
 */
export async function getDriftUpstream(): Promise<DriftUpstream | null> {
  const supabase = await createClient()

  // getUser() before getSession(), deliberately. getSession() only decodes the
  // cookie — it does not ask the Auth server whether that JWT is still valid,
  // so on its own it trusts client-supplied input. The middleware DOES call
  // getUser(), but its matcher excludes `api/`, so these route handlers get no
  // revalidation from it. The edge functions downstream validate too, so this
  // was defence-in-depth rather than an open door — but an unvalidated session
  // must not be the gate on our side of the call.
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) return null

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  return {
    functionsBase: `${url}/functions/v1`,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    token,
  }
}
