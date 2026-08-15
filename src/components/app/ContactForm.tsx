"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"

// The postcard, in the Aurora identity — the web half of the iOS ContactView.
//
// Same idea in both places: a signed-in card is already franked (we know the
// return address, and the postmark shows you exactly what travels with the
// note), a signed-out card has a blank return address you have to write.
//
// On a wide screen it opens out into a real postcard — message on the left,
// stamp and postmark on the right, divided by the rule a postcard actually
// has. Narrow screens stack it, matching the phone.

const CATEGORIES = [
  { key: "bug", label: "BROKEN", title: "Something's broken",
    prompt: "What happened, and what did you expect instead?" },
  { key: "idea", label: "IDEA", title: "An idea",
    prompt: "What do you wish Drift could do?" },
  { key: "praise", label: "LOVED IT", title: "Something you loved",
    prompt: "What worked? We'd love to know." },
  { key: "other", label: "OTHER", title: "Something else",
    prompt: "Anything at all." },
] as const

type CategoryKey = (typeof CATEGORIES)[number]["key"]

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** The scalloped edge of a postage stamp, as one SVG path.
 *
 *  Quadratic curves rather than arcs, and inset by the bulge so the outline
 *  stays inside its own box — the same two decisions as the Swift shape, for
 *  the same reasons (no arc-winding to get wrong; neighbouring stamps don't
 *  interlock). Kept as a viewBox-relative path scaled by preserveAspectRatio
 *  = none, so one string serves every stamp size. */
function stampPath(w: number, h: number, scallop = 6): string {
  const x0 = scallop
  const y0 = scallop
  const x1 = w - scallop
  const y1 = h - scallop

  const corners: [number, number][] = [
    [x0, y0], [x1, y0], [x1, y1], [x0, y1],
  ]
  // Outward normals in draw order: top, right, bottom, left.
  const normals: [number, number][] = [
    [0, -1], [1, 0], [0, 1], [-1, 0],
  ]

  let d = `M ${x0} ${y0}`
  for (let edge = 0; edge < 4; edge++) {
    const [ax, ay] = corners[edge]
    const [bx, by] = corners[(edge + 1) % 4]
    const [nx, ny] = normals[edge]

    const span = Math.hypot(bx - ax, by - ay)
    if (span <= 0) continue
    const count = Math.max(1, Math.round(span / (scallop * 2)))
    const step = span / count
    const ux = (bx - ax) / span
    const uy = (by - ay) / span

    for (let i = 1; i <= count; i++) {
      const tipX = ax + ux * step * i
      const tipY = ay + uy * step * i
      const midX = tipX - (ux * step) / 2
      const midY = tipY - (uy * step) / 2
      // A quad's apex sits halfway to its control point, so 2x gives a bulge
      // of exactly `scallop`.
      const cx = midX + nx * scallop * 2
      const cy = midY + ny * scallop * 2
      d += ` Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${tipX.toFixed(2)} ${tipY.toFixed(2)}`
    }
  }
  return d + " Z"
}

function Stamp({
  selected,
  children,
  onClick,
  title,
}: {
  selected: boolean
  children: React.ReactNode
  onClick: () => void
  title: string
}) {
  const path = useMemo(() => stampPath(120, 96), [])

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={title}
      className="group relative block flex-1 cursor-pointer bg-transparent p-0 focus:outline-none"
      style={{ minWidth: 0 }}
    >
      <svg
        viewBox="0 0 120 96"
        preserveAspectRatio="none"
        className="block h-[86px] w-full transition-colors"
        aria-hidden="true"
      >
        <path
          d={path}
          fill={selected ? "rgba(55,214,196,0.12)" : "#1B2A38"}
          stroke={selected ? "rgba(55,214,196,0.55)" : "rgba(255,255,255,0.14)"}
          strokeWidth={selected ? 2 : 1.2}
          vectorEffect="non-scaling-stroke"
          className="transition-all group-hover:stroke-aurora-teal/40"
        />
      </svg>
      <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5">
        {children}
      </span>
    </button>
  )
}

function CategoryIcon({ kind, active }: { kind: CategoryKey; active: boolean }) {
  const color = active ? "#37D6C4" : "#7D8C98"
  const common = {
    width: 18, height: 18, viewBox: "0 0 24 24", fill: "none",
    stroke: color, strokeWidth: 1.8, strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const, "aria-hidden": true,
  }
  switch (kind) {
    case "bug":
      return (
        <svg {...common}>
          <path d="M8 6a4 4 0 0 1 8 0" />
          <rect x="7" y="8" width="10" height="12" rx="5" />
          <path d="M4 12h3M17 12h3M5 17l2-1.5M19 17l-2-1.5M5 8l2 1M19 8l-2 1" />
        </svg>
      )
    case "idea":
      return (
        <svg {...common}>
          <path d="M9 18h6M10 21h4" />
          <path d="M12 3a6 6 0 0 1 3.6 10.8c-.5.4-.8 1-.9 1.6l-.1.6H9.4l-.1-.6c-.1-.6-.4-1.2-.9-1.6A6 6 0 0 1 12 3Z" />
        </svg>
      )
    case "praise":
      return (
        <svg {...common} fill={color} stroke="none">
          <path d="M12 20.5 4.4 13.3a4.6 4.6 0 0 1 6.5-6.5l1.1 1.1 1.1-1.1a4.6 4.6 0 1 1 6.5 6.5Z" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <path d="M20 15a3 3 0 0 1-3 3H8l-4 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3Z" />
          <path d="M8 9h8M8 13h5" />
        </svg>
      )
  }
}

export default function ContactForm({ accountEmail }: { accountEmail: string | null }) {
  const [category, setCategory] = useState<CategoryKey>("idea")
  const [message, setMessage] = useState("")
  const [replyEmail, setReplyEmail] = useState("")
  const [attachContext, setAttachContext] = useState(true)
  const [honeypot, setHoneypot] = useState("")
  const [busy, setBusy] = useState(false)
  const [posted, setPosted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // "Franked" means we know where to write back, not merely that a session
  // exists — an account with no email on file still needs a return address.
  const franked = Boolean(accountEmail)
  const active = CATEGORIES.find((c) => c.key === category)!
  const canSend =
    message.trim().length > 0 && (franked || replyEmail.includes("@")) && !busy

  // Set after mount, not during render: `navigator` does not exist on the
  // server, so computing this inline made the server emit an empty string and
  // the client emit the locale — a hydration mismatch that blew away the
  // server HTML for the whole page.
  const [postmarkLine, setPostmarkLine] = useState("Drift for web")
  useEffect(() => {
    setPostmarkLine(["Drift for web", navigator.language || "en"].join(" · "))
  }, [])

  async function send() {
    if (!canSend) return
    setBusy(true)
    setError(null)

    const context = attachContext
      ? {
          platform: "web",
          screen: typeof window !== "undefined" ? window.location.pathname : undefined,
          locale: typeof navigator !== "undefined" ? navigator.language : undefined,
        }
      : null

    try {
      // The edge function runs with verify_jwt off so a signed-out sender can
      // reach it, and resolves identity from the token itself. Pass the real
      // session when there is one; fall back to the anon key so the gateway
      // still accepts the request.
      const supabase = createClient()
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token ?? ANON_KEY

      const response = await fetch(`${SUPABASE_URL}/functions/v1/submit-feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          source: "web",
          category,
          message: message.trim(),
          email: franked ? undefined : replyEmail.trim(),
          context,
          website: honeypot, // honeypot: real people never fill this
        }),
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setPosted(true)
    } catch (err) {
      console.error("[contact] submit failed", err)
      setError("That didn't send. Check your connection and try again — your note is still here.")
    } finally {
      setBusy(false)
    }
  }

  if (posted) {
    return (
      <div className="flex flex-col items-center gap-5 py-24 text-center">
        <div className="relative flex h-24 w-24 items-center justify-center">
          <span className="absolute inset-0 rounded-full border border-aurora-teal/20" />
          <span className="absolute inset-[7px] rounded-full border-[1.5px] border-aurora-teal/35" />
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none"
               stroke="#37D6C4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 13 4 4L19 7" />
          </svg>
        </div>
        <h2 className="font-drift-display text-3xl text-aurora-ink">Posted</h2>
        <p className="max-w-sm text-[15px] leading-relaxed text-aurora-ink2">
          {`Thank you — if it needs an answer, it'll come to ${accountEmail ?? replyEmail}.`}
        </p>
      </div>
    )
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="font-drift-display text-[40px] leading-[1.1] text-aurora-ink sm:text-[52px]">
          Say hello
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-aurora-ink2">
          Tell us what broke, what you wish Drift did, or what made the trip. A
          real person reads every one of these.
        </p>
      </header>

      {/* The postcard */}
      <div className="overflow-hidden rounded-hero border border-aurora-border bg-aurora-glass">
        {/* A grid, so the three blocks can sit in a different order in each
            layout without duplicating markup.
              narrow  — stamps, message, return address (top to bottom)
              wide    — message on the left; stamps over return on the right,
                        which is what a postcard actually looks like.
            The stamps lead on narrow screens because picking one rewrites the
            message prompt, and a control below the thing it changes reads
            backwards. Rules are borders rather than separate elements so they
            can flip between vertical and horizontal for free. */}
        <div className="grid lg:grid-cols-[1fr_340px]">
          {/* Message */}
          <div className="order-2 border-aurora-border lg:order-none lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:border-r">
            <label htmlFor="contact-message" className="sr-only">
              {active.title}
            </label>
            <textarea
              id="contact-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={active.prompt}
              maxLength={5000}
              rows={9}
              className="block w-full resize-none bg-transparent px-5 py-5 text-[16px] leading-relaxed text-aurora-ink outline-none placeholder:text-white/40"
            />
          </div>

          {/* Stamps */}
          {/* items-start, not the default stretch: on wide screens the message
              column makes this grid row far taller than a stamp, and stretched
              buttons grew to 130px around an 86px graphic — a visible gap under
              the stamps and 44px of invisible click target below each one. */}
          <div className="order-1 flex items-start gap-2.5 border-b border-aurora-border p-3.5 lg:order-none lg:col-start-2 lg:row-start-1">
            {CATEGORIES.map((option) => (
              <Stamp
                key={option.key}
                selected={option.key === category}
                title={option.title}
                onClick={() => setCategory(option.key)}
              >
                <CategoryIcon kind={option.key} active={option.key === category} />
                <span
                  className={`text-[9px] font-semibold tracking-[0.06em] ${
                    option.key === category ? "text-aurora-ink" : "text-aurora-ink3"
                  }`}
                >
                  {option.label}
                </span>
              </Stamp>
            ))}
          </div>

          {/* Return address / postmark */}
          <div className="order-3 border-t border-aurora-border lg:order-none lg:col-start-2 lg:row-start-2 lg:self-start lg:border-t-0">
            {franked ? (
              <div className="flex items-start gap-3 p-4">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7D8C98"
                     strokeWidth="1.2" className="mt-0.5 shrink-0 -rotate-[8deg]" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <circle cx="12" cy="5" r="2.2" /><circle cx="12" cy="19" r="2.2" />
                  <circle cx="5" cy="8.5" r="2.2" /><circle cx="19" cy="8.5" r="2.2" />
                  <circle cx="5" cy="15.5" r="2.2" /><circle cx="19" cy="15.5" r="2.2" />
                </svg>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold tracking-[0.1em] text-aurora-ink3">
                    FRANKED
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-aurora-ink2">
                    {attachContext ? postmarkLine : `Replies go to ${accountEmail}`}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={attachContext}
                  aria-label="Attach browser and page details"
                  onClick={() => setAttachContext((v) => !v)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    attachContext ? "bg-aurora-teal" : "bg-white/15"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                      attachContext ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-4">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7D8C98"
                     strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
                     className="mt-3.5 shrink-0" aria-hidden="true">
                  <path d="M9 14 4 9l5-5" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" />
                </svg>
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor="contact-email"
                    className="block text-[10px] font-semibold tracking-[0.1em] text-aurora-ink3"
                  >
                    RETURN ADDRESS
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    autoComplete="email"
                    value={replyEmail}
                    onChange={(e) => setReplyEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-1 block w-full bg-transparent text-[15px] text-aurora-ink outline-none placeholder:text-white/40"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Honeypot — off-screen, never announced, never tabbed to. */}
      <input
        type="text"
        name="website"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="pointer-events-none absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      {error && (
        <p className="mt-4 text-[13px] text-aurora-warn" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row-reverse sm:justify-start sm:gap-5">
        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          className="h-[52px] w-full rounded-full bg-aurora-teal bg-gradient-to-b from-aurora-teal to-aurora-teal-end text-[16px] font-semibold text-aurora-teal-ink transition-opacity disabled:opacity-50 sm:w-[220px]"
        >
          {busy ? "Posting…" : "Post it"}
        </button>
        <p className="text-[12px] text-aurora-ink3">Nothing here is shared publicly.</p>
      </div>
    </>
  )
}
