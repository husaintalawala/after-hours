import { ImageResponse } from "next/og"

// The Drift-branded card an invite unfurls with when the trip has no cover of
// its own (neither a chosen cover nor the Unsplash fallback). Rendered on demand
// so it can carry the trip's title; 1200×630 is what iMessage, Slack, WhatsApp
// and Twitter all lay out for. Nothing personal can ever appear on it.
//
// Lives under /api so the marketing middleware's rewrite (/x → /drift/x) leaves
// it alone — the same reason the join page itself is carved out.

export const dynamic = "force-dynamic"

const MIDNIGHT = "#08131D"
const TEAL = "#37D6C4"
const TEAL_END = "#22B7D4"
const TITLE = "#F4F8F9"
const SUBTITLE = "rgba(198,208,217,0.9)"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  // Title only — no other query input is drawn, so nothing an attacker can put
  // in a URL reaches the image except a trimmed string of text.
  const raw = (searchParams.get("t") ?? "").trim().slice(0, 90)
  const title = raw || "a trip"

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 84px",
          background: `linear-gradient(160deg, ${MIDNIGHT} 0%, #0E2233 55%, #0B2E3A 100%)`,
          color: TITLE,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              background: `linear-gradient(135deg, ${TEAL}, ${TEAL_END})`,
            }}
          />
          <div style={{ fontSize: 44, fontWeight: 700, color: TEAL, letterSpacing: -1 }}>drift</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 30, color: SUBTITLE }}>You&apos;re invited to</div>
          <div
            style={{
              fontSize: title.length > 40 ? 60 : 76,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -2,
              maxWidth: 1000,
            }}
          >
            {title}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 26, color: SUBTITLE }}>See the plan and join on Drift</div>
          <div
            style={{
              padding: "14px 30px",
              borderRadius: 999,
              background: `linear-gradient(135deg, ${TEAL}, ${TEAL_END})`,
              color: "#062A2B",
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            drift.after-hours.app
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
