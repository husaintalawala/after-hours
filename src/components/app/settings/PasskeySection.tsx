"use client"

import { useEffect, useState } from "react"
import { isAuthSessionMissingError, type PasskeyListItem } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"
import { passkeysOffered, passkeyCancelled } from "@/lib/passkeys"

/**
 * Passkeys — add one, see what's enrolled, remove one you don't recognise.
 *
 * Renders nothing unless passkeysOffered(): passkeys are not switched on in the
 * Supabase project yet, so with the flag at its shipped `false` every call here
 * would fail against a server with no relying party configured. A button that
 * always errors is worse than no button — see lib/passkeys.ts.
 *
 * WHY THE LIST AND REMOVE ARE HERE and not just "add". Two reasons, and the
 * second is the real one. Add-only can never tell you whether you already have
 * a passkey, so it reads "Add a passkey" forever and invites duplicates. More
 * importantly, registerPasskey() takes no reauthentication nonce — the SDK has
 * no way to demand one — so anyone holding a live session can silently enrol a
 * credential that outlives the session they stole. Seeing the list and being
 * able to delete an unfamiliar entry is the only mitigation available on the
 * client. An enrolment notification email is the server-side half and is not
 * built here.
 *
 * No captcha, unlike the login page: RegisterPasskeyCredentials exposes only
 * { signal } — there is no captchaToken, because these calls are authorised by
 * the session rather than being anonymous auth attempts.
 *
 * Delete never updates the list optimistically. Telling someone a credential is
 * gone while it still signs them in is the one thing this section must not get
 * wrong, so a row only disappears once the server's own list says so — the same
 * reasoning GoogleConnection spells out for throwOnError.
 */

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })

// The SDK's own message is usually the most accurate thing we can say. The one
// exception is a dead session, whose message is literally "Auth session
// missing!" — jargon, an exclamation mark, and the only failure here with a
// clear next step.
function sessionGone(error: unknown): boolean {
  return isAuthSessionMissingError(error)
}
const EXPIRED = "Your session has expired. Sign in again."

export default function PasskeySection() {
  const [offered, setOffered] = useState(false)
  const [keys, setKeys] = useState<PasskeyListItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    try {
      const { data, error } = await createClient().auth.passkey.list()
      if (error) {
        setMsg(sessionGone(error) ? EXPIRED : "Couldn't load your passkeys. Try again in a moment.")
        return
      }
      setKeys(data)
      setLoaded(true)
    } catch {
      setMsg("Couldn't load your passkeys. Try again in a moment.")
    }
  }

  // passkeysOffered() reads window, so it runs here rather than in the render
  // body — and nothing is fetched until we know the feature is on.
  useEffect(() => {
    if (!passkeysOffered()) return
    setOffered(true)
    void load()
  }, [])

  async function add() {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      const { error } = await createClient().auth.registerPasskey()
      if (passkeyCancelled(error)) {
        setMsg("No passkey was added.")
        return
      }
      if (error) {
        // The server's own message, not a paraphrase: "already registered",
        // "this authenticator can't do that" and a verification failure are
        // different problems, and guessing which one you hit is how a wrong
        // explanation gets written.
        setMsg(sessionGone(error) ? EXPIRED : error.message)
        return
      }
      setMsg("Passkey added. You can use it to sign in from now on.")
      await load()
    } catch {
      // registerPasskey rejects rather than resolving for anything that isn't an
      // AuthError, and throws outright if the experimental flag is missing.
      setMsg("Couldn't add that passkey. Try again in a moment.")
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      const { error } = await createClient().auth.passkey.delete({ passkeyId: id })
      if (error) {
        setMsg(sessionGone(error) ? EXPIRED : "Couldn't remove that passkey. It still works for signing in.")
        return
      }
      setMsg("Passkey removed.")
      await load()
    } catch {
      setMsg("Couldn't remove that passkey. It still works for signing in.")
    } finally {
      setBusy(false)
    }
  }

  if (!offered) return null

  return (
    <section className="mt-3 rounded-2xl border border-aurora-border bg-aurora-glass p-5">
      <h2 className="text-[15px] font-bold text-aurora-ink">Passkeys</h2>
      <p className="mt-1 text-[13px] text-drift-muted">
        Sign in with your face, fingerprint or device PIN instead of waiting for
        an email. The passkey stays on your device — Drift keeps only the half
        that checks it.
      </p>

      {keys.length > 0 && (
        <div className="mt-3 divide-y divide-drift-divider">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold text-aurora-ink">
                  {k.friendly_name || "Passkey"}
                </span>
                <span className="mt-0.5 block text-[12px] text-drift-muted">
                  Added {day(k.created_at)}
                  {k.last_used_at ? ` · Last used ${day(k.last_used_at)}` : ""}
                </span>
              </span>
              <button
                onClick={() => remove(k.id)}
                disabled={busy}
                className="shrink-0 rounded-full border border-aurora-border px-3.5 py-1.5 text-[12.5px] font-semibold text-aurora-ink transition-colors hover:border-red-400/50 hover:text-red-400 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {loaded && keys.length === 0 && (
        <p className="mt-3 text-[12.5px] text-drift-muted">No passkeys yet.</p>
      )}

      <button
        onClick={add}
        disabled={busy}
        className="mt-3 rounded-full border border-aurora-border px-4 py-2 text-[13px] font-semibold text-aurora-ink transition-colors hover:border-aurora-teal/50 hover:text-aurora-teal disabled:opacity-50"
      >
        {busy ? "Waiting for your device…" : "Add a passkey"}
      </button>

      {msg && <p className="mt-2 text-[12.5px] text-drift-muted">{msg}</p>}

      <p className="mt-2 text-[12px] text-drift-muted">
        Remove any passkey you don&rsquo;t recognise — it stops working straight
        away.
      </p>
    </section>
  )
}
