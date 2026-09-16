"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  describeFinishing,
  describeKept,
  describeRemoved,
  plural,
  readReceipt,
  RECEIPT_STORAGE_KEY,
  type DeletionReceipt,
} from "@/lib/drift/deleteAccount"

// The receipt shown once, straight after an account is deleted. Its detail
// arrives through sessionStorage from DeleteAccountFlow and is removed on read —
// it names trips and co-travellers, and the account it describes is gone. With
// no receipt (a reload, another tab) the page still says the one thing that
// matters; the emailed receipt carries the detail.
//
// Deliberately imports nothing from the flow: this page is reached signed out,
// and the flow's bundle carries the Supabase and Google clients.

const GOOGLE_CONNECTIONS = "https://myaccount.google.com/connections"

export default function AccountDeletedReceipt() {
  const [receipt, setReceipt] = useState<DeletionReceipt | null>(null)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RECEIPT_STORAGE_KEY)
      if (!raw) return
      sessionStorage.removeItem(RECEIPT_STORAGE_KEY)
      setReceipt(readReceipt(JSON.parse(raw)))
    } catch {
      /* no readable receipt — the generic copy stands */
    }
  }, [])

  const summary = receipt?.summary ?? null
  const removed = summary ? describeRemoved(summary) : []
  const kept = summary ? describeKept(summary) : null
  const stillFinishing = receipt ? describeFinishing(receipt.status, receipt.finishing) : []
  const apple = receipt?.followups.find((f) => f.code === "apple_manual") ?? null
  const disconnected = [
    receipt?.google === "revoked" ? "Google access revoked" : null,
    summary?.cardsDisconnected ? `${plural(summary.cardsDisconnected, "bank card")} disconnected` : null,
  ].filter((x): x is string => !!x)

  return (
    <>
      <h1 className="font-drift-display text-[32px] font-bold leading-tight">Your account is deleted</h1>
      <p className="mt-3 text-[15px] text-aurora-ink2">
        Your Drift account and the data tied to it are gone, and you&rsquo;re signed out. If the account had an email
        address, a receipt is on its way to it.
      </p>

      {stillFinishing.map((line) => (
        <p key={line} className="mt-4 rounded-xl bg-aurora-glass px-3.5 py-2.5 text-[13.5px] text-aurora-ink2">
          {line} &mdash; this finishes automatically.
        </p>
      ))}

      {removed.length > 0 && (
        <Section title="Removed">
          <ul className="space-y-1.5 text-[14px] text-aurora-ink">
            <li>Your profile and sign-in</li>
            {removed.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Section>
      )}

      {summary && summary.handovers.length > 0 && (
        <Section title="Handed to your travel group">
          <ul className="space-y-1.5 text-[14px] text-aurora-ink">
            {summary.handovers.map((h, i) => (
              <li key={h.tripId ?? i}>
                <span className="font-semibold">{h.title}</span> is now organised by {h.toName}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {kept && (
        <Section title="Kept for your travel group">
          <p className="text-[14px] text-aurora-ink">{kept}</p>
        </Section>
      )}

      {disconnected.length > 0 && (
        <Section title="Disconnected">
          <ul className="space-y-1.5 text-[14px] text-aurora-ink">
            {disconnected.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </Section>
      )}

      {(apple || receipt?.google === "not_revoked") && (
        <Section title="One more step">
          <ul className="space-y-3 text-[14px] text-aurora-ink">
            {apple && (
              <li>
                <a
                  href={apple.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-aurora-teal hover:underline"
                >
                  Remove Drift from Sign in with Apple
                </a>
                <span className="mt-0.5 block text-[12.5px] text-aurora-ink3">
                  Apple keeps its own list of apps you&rsquo;ve signed in to.
                </span>
              </li>
            )}
            {receipt?.google === "not_revoked" && (
              <li>
                <a
                  href={GOOGLE_CONNECTIONS}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-aurora-teal hover:underline"
                >
                  Remove Drift from your Google account
                </a>
                <span className="mt-0.5 block text-[12.5px] text-aurora-ink3">
                  Google may still list Drift under third-party access.
                </span>
              </li>
            )}
          </ul>
        </Section>
      )}

      <p className="mt-8 text-[13.5px] text-aurora-ink3">
        Questions about your deletion?{" "}
        <Link href="/app/contact" className="font-semibold text-aurora-teal hover:underline">
          Contact us
        </Link>
        .
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex rounded-full bg-aurora-glass px-5 py-2.5 text-[13.5px] font-semibold text-aurora-ink2 transition-colors hover:text-aurora-ink"
      >
        Back to drift
      </Link>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 rounded-2xl border border-aurora-border bg-aurora-glass p-5">
      <h2 className="mb-2.5 text-[11.5px] font-bold uppercase tracking-wider text-aurora-ink3">{title}</h2>
      {children}
    </section>
  )
}
