// Client-side Plaid Link loader. The link token is minted server-side
// (plaid-link-token edge fn, gated on profiles.plaid_enabled); we open Plaid
// Link with it, and on success hand the short-lived public_token back for the
// server to exchange (plaid-exchange). No Plaid secret touches the browser.

/* eslint-disable @typescript-eslint/no-explicit-any */
let plaidLoad: Promise<void> | null = null
function loadPlaid(): Promise<void> {
  if (plaidLoad) return plaidLoad
  plaidLoad = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"))
    if ((window as any).Plaid) return resolve()
    const s = document.createElement("script")
    s.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js"
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error("Couldn't reach Plaid. Check your connection."))
    document.head.appendChild(s)
  })
  return plaidLoad
}

export interface PlaidLinkResult {
  public_token: string
  institution?: { id?: string; name?: string }
}

// Sentinel used when the user closes Link without an error — callers treat it
// as a silent no-op rather than surfacing an error.
export const PLAID_CANCELLED = "__plaid_cancelled__"

export async function openPlaidLink(linkToken: string): Promise<PlaidLinkResult> {
  await loadPlaid()
  return new Promise<PlaidLinkResult>((resolve, reject) => {
    const handler = (window as any).Plaid.create({
      token: linkToken,
      onSuccess: (public_token: string, metadata: any) =>
        resolve({
          public_token,
          institution: metadata?.institution
            ? { id: metadata.institution.institution_id, name: metadata.institution.name }
            : undefined,
        }),
      onExit: (err: any) => {
        if (err) reject(new Error(err.display_message || err.error_message || "Plaid Link closed."))
        else reject(new Error(PLAID_CANCELLED))
      },
    })
    handler.open()
  })
}
/* eslint-enable @typescript-eslint/no-explicit-any */
