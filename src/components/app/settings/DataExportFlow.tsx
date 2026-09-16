"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import BackLink from "@/components/app/BackLink"
import {
  describeExportContents,
  describeSize,
  prepareExportDownload,
  readExportResponse,
  type ExportResponse,
} from "@/lib/drift/exportAccount"

// Download your data — the web half of iOS DataExportView, and the portability
// counterpart to /app/settings/delete-account. Two requests, no ceremony:
// `preview` says what is in the file before anyone waits for it, `export`
// returns the document and the browser saves it.
//
// The file is JSON, not a zip: photos and files are the CloudFront links they
// already are, so there is nothing to bundle and nothing to upload to a public
// bucket on the way. The copy says so, because "download your data" invites the
// reasonable assumption that the photos are inside.
//
// Nothing here is destructive, so a failure only ever means "no file" — and it
// says that, rather than leaving a spinner on a dead request.

type Phase = "loading" | "ready" | "working" | "done"

/** The browser gives up before Vercel's maxDuration does, so a dropped
 *  connection ends as our own `network` answer instead of a spinner. */
const CLIENT_TIMEOUT_MS = 75_000

/** A 401 is a session that ran out between opening this page and asking for
 *  the file — the protected layout gates navigation, not fetches — so pressing
 *  the button again can only 401 again. Say so, and point at the way out. */
const SESSION_EXPIRED =
  "Your session has expired, so nothing was exported. Sign in again and the file is one press away."

async function post(mode: "preview" | "export"): Promise<ExportResponse> {
  try {
    const r = await fetch("/api/drift/export-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    })
    // readExportResponse turns "no answer" into code:"network".
    return readExportResponse(await r.json().catch(() => null))
  } catch {
    return readExportResponse(null)
  }
}

export default function DataExportFlow() {
  const [phase, setPhase] = useState<Phase>("loading")
  const [preview, setPreview] = useState<ExportResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [savedName, setSavedName] = useState<string | null>(null)

  /** One place where a refusal becomes a sentence, so a dead session reads as
   *  one on both requests rather than as "please try again". */
  function fail(res: ExportResponse, fallback: string) {
    const gone = res.code === "unauthorized"
    setExpired(gone)
    setError(gone ? SESSION_EXPIRED : (res.error ?? fallback))
  }

  async function loadPreview() {
    const res = await post("preview")
    if (res.ok) setPreview(res)
    // `preview` and `export` are separate requests with separate timeouts, so
    // one failing says nothing about the other: land on the ready screen with
    // the summary missing, rather than behind a retry button that would be the
    // only remaining route to the person's own data.
    else fail(res, "We couldn’t check what’s on your account, but you can still generate the file.")
    setPhase("ready")
  }

  useEffect(() => {
    void loadPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function generate() {
    if (phase === "working") return
    setPhase("working")
    setError(null)
    setExpired(false)
    setSavedName(null)

    const res = await post("export")
    const file = prepareExportDownload(res)
    if (!file) {
      setPhase("ready")
      fail(
        res,
        "We couldn’t build your file, so nothing was exported. Nothing on your account has changed — please try again."
      )
      return
    }

    const url = URL.createObjectURL(new Blob([file.json], { type: "application/json" }))
    const a = document.createElement("a")
    a.href = url
    a.download = file.filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoked on a delay, like the itinerary PDF export: the download has
    // started by now, but Safari has been known to need the URL a moment
    // longer. The timer outliving this component is fine — it only revokes.
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
    setSavedName(file.filename)
    setPhase("done")
  }

  const contents = preview?.counts ? describeExportContents(preview.counts) : []
  const size = describeSize(preview?.estimatedBytes ?? null)

  // What a screen reader hears as the phase changes. Failures are left out of
  // it: ErrorNote is role="alert" and announces itself on insertion.
  const announcement =
    phase === "loading"
      ? "Checking what’s on your account."
      : phase === "working"
        ? "Building your file."
        : phase === "done" && savedName
          ? `Saved as ${savedName}. Check your downloads.`
          : preview?.counts
            ? `Ready. The file will hold ${["your profile", ...contents].join(", ")}${size ? `, and is ${size}` : ""}.`
            : "Ready to build your file."

  return (
    <div className="mx-auto w-full max-w-xl px-5 pb-32 pt-8 lg:pt-12">
      <BackLink href="/app/settings" label="Settings" className="mb-5" />
      <h1 className="font-drift-display text-[28px] font-bold">Download your data</h1>
      <p className="mt-3 text-[14.5px] text-aurora-ink2">
        One JSON file with everything Drift holds for your account. It&rsquo;s yours to keep, open or
        move somewhere else.
      </p>

      {/* One live region, mounted from the first render and never replaced: a
          region inserted together with its text is generally not announced, so
          a region per phase leaves every transition silent. The visible copy
          below says the same things in their own places. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {phase === "loading" && (
        <p className="mt-5 text-[14.5px] text-aurora-ink2">
          Checking what&rsquo;s on your account&hellip;
        </p>
      )}

      {phase !== "loading" && (
        <>
          <Section title="What’s in the file">
            {/* An unknown total and an empty account are not the same thing.
                Without this branch a dropped `counts` key tells somebody with
                forty trips that they have none — and then hands them a file
                that says otherwise. */}
            {!preview?.counts ? (
              <p className="text-[14px] text-aurora-ink">
                We couldn&rsquo;t total up what&rsquo;s on your account, but the file will still hold
                everything Drift has for you &mdash; your profile, trips, expenses, saved places and
                photo links.
              </p>
            ) : contents.length > 0 ? (
              <ul className="space-y-1.5 text-[14px] text-aurora-ink">
                <li>Your profile, sign-in methods and travel preferences</li>
                {contents.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-aurora-ink">
                Your profile and settings. You haven&rsquo;t saved any trips yet, so there&rsquo;s not
                much else to put in it.
              </p>
            )}
            {size && <p className="mt-2.5 text-[12.5px] text-aurora-ink3">The file is {size}.</p>}
          </Section>

          <Section title="Worth knowing">
            <ul className="space-y-1.5 text-[14px] text-aurora-ink2">
              <li>
                Photos and files are links to where they already live, not copies &mdash; so the file
                stays small enough to open.
              </li>
              <li>
                People you travel with appear by name and handle, never by email, and their private
                notes and messages aren&rsquo;t included.
              </li>
              <li>
                Nothing secret is in it: no passwords, no bank or sign-in tokens. Linked cards appear
                as the bank&rsquo;s name and the last four digits.
              </li>
            </ul>
          </Section>

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void generate()}
              disabled={phase === "working"}
              className="rounded-full bg-aurora-teal/15 px-5 py-2.5 text-[13.5px] font-bold text-aurora-teal transition-colors hover:bg-aurora-teal/25 disabled:cursor-wait disabled:opacity-60"
            >
              {phase === "working" ? "Building your file…" : phase === "done" ? "Download again" : "Generate my file"}
            </button>
            <Link
              href="/app/settings"
              className="rounded-full bg-aurora-glass px-5 py-2.5 text-[13.5px] font-semibold text-aurora-ink2 transition-colors hover:text-aurora-ink"
            >
              Back to settings
            </Link>
          </div>

          {/* Visible only — the announcing is done by the region at the top,
              which exists before this text does. */}
          <p className="mt-4 min-h-[20px] text-[13px] text-aurora-ink3">
            {phase === "working"
              ? "Building your file — this can take a few seconds."
              : phase === "done" && savedName
                ? `Saved as ${savedName}. Check your downloads.`
                : ""}
          </p>

          {error && (
            <>
              <ErrorNote>{error}</ErrorNote>
              {expired && (
                <Link
                  href="/app/login"
                  className="mt-3 inline-block rounded-full bg-aurora-glass px-5 py-2.5 text-[13.5px] font-semibold text-aurora-ink2 transition-colors hover:text-aurora-ink"
                >
                  Sign in again
                </Link>
              )}
            </>
          )}

          <p className="mt-6 text-[12.5px] text-aurora-ink3">
            Something missing, or a question about what&rsquo;s in here?{" "}
            <Link href="/app/contact" className="font-semibold text-aurora-teal hover:underline">
              Tell us
            </Link>
            .
          </p>
        </>
      )}
    </div>
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

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-4 rounded-xl bg-red-500/10 px-3.5 py-2.5 text-[13px] font-medium text-red-400">
      {children}
    </p>
  )
}
