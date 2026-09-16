import "server-only"

// The one way the web reaches the email-preferences edge function. Shared by the
// one-click route, the signed-link proxy, the Settings proxy and the public
// page's first render, so the URL, the keys and the timeout are decided once.
//
// The function is deployed with verify_jwt = false (an unsubscribe link has no
// session behind it), so for the link routes the anon key is only what the
// gateway expects to see. Settings passes the caller's own JWT instead: that is
// how the function knows whose address to look up.

export interface UpstreamAnswer {
  status: number
  text: string
  /** The one-click route counts only a plain-text 2xx as "recorded". */
  contentType: string | null
}

/** Throws on a timeout or a connection failure; every caller turns that into
 *  its own "couldn't reach it" answer rather than a verdict. */
export async function postEmailPreferences(opts: {
  body: string
  contentType: string
  timeoutMs: number
  /** Already encoded, without the "?". */
  query?: string
  /** A user's access token. Omitted for link requests. */
  bearer?: string
}): Promise<UpstreamAnswer> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const res = await fetch(`${url}/functions/v1/email-preferences${opts.query ? `?${opts.query}` : ""}`, {
    method: "POST",
    headers: {
      "Content-Type": opts.contentType,
      Authorization: `Bearer ${opts.bearer ?? anonKey}`,
      apikey: anonKey,
    },
    body: opts.body,
    signal: AbortSignal.timeout(opts.timeoutMs),
    cache: "no-store",
  })
  return { status: res.status, text: await res.text(), contentType: res.headers.get("content-type") }
}
