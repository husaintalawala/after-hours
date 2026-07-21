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
  const supabase = createClient()
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
