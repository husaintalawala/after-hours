import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        midnight: "#0a0a0f",
        deep: "#12121a",
        gold: "#c9a227",
        "gold-dim": "rgba(201, 162, 39, 0.4)",
        copper: "#b87333",
        cream: "#f5f3ef",
        // --- Aurora (Drift Visual Language v1.0) — the logged-in app's DARK
        // identity, ported 1:1 from iOS Drift/Design/AuroraTheme.swift. Deep
        // Midnight ground, ONE teal action accent (never a large fill), indigo
        // for routes/timeline/AI, a 3-level ink text ramp, glass surfaces. ---
        aurora: {
          midnight: "#08131D", // app ground (never pure black)
          midnight2: "#0B1A25", // raised panels / sheets / section bg
          glass: "#16222F", // card / chip fill (solid, cool blue-lifted)
          glass2: "#1B2A38", // higher elevation (menus, nested cards)
          border: "rgba(255,255,255,0.14)", // hairline card edge
          "border-strong": "rgba(255,255,255,0.22)",
          teal: "#37D6C4", // THE action accent
          "teal-end": "#22B7D4", // CTA gradient bottom stop
          "teal-ink": "#04231F", // text/glyph ON a filled-teal surface
          indigo: "#6B5CFF", // routes / timeline / AI
          warn: "#E7A24B", // "needs attention" (kept distinct from accent)
          ink: "#FFFFFF", // primary text
          ink2: "#C6D0D9", // secondary text
          ink3: "#7D8C98", // tertiary / muted captions
        },
        // --- Drift logged-in app tokens. RE-POINTED to Aurora dark values
        // (role-preserving: ink=text, alt-bg=ground, coral=accent, muted=2nd
        // text, divider=hairline) so the app flips to dark in ONE place and no
        // un-migrated `drift-*` class can leak the old light theme. New code
        // should use `aurora-*` above; these remain as a safety net + are being
        // migrated over. Old light values kept in git history. ---
        drift: {
          coral: "#37D6C4", // accent → Aurora teal
          "coral-50": "#0F2E34", // selected-chip bg → teal @ ~14% over midnight
          "coral-deep": "#22B7D4", // pressed/emphasis → teal-end
          ink: "#FFFFFF", // primary text → white
          muted: "#C6D0D9", // secondary text → ink2
          "text-tertiary": "#7D8C98", // tertiary → ink3
          "alt-bg": "#0B1A25", // section bg → midnight2
          "card-active": "#1B2A38", // active/pressed row → glass2
          divider: "rgba(255,255,255,0.14)", // hairline → glass border
        },
      },
      backgroundImage: {
        // Filled teal action (CTA / active tab / selected chip). iOS tealGradient.
        "aurora-teal": "linear-gradient(180deg, #37D6C4, #22B7D4)",
        // AI / sparkle — teal → indigo. iOS auroraGradient. Never yellow.
        "aurora-ai": "linear-gradient(135deg, #37D6C4, #6B5CFF)",
      },
      boxShadow: {
        // Ambient glow (used INSTEAD of drop shadows on the dark ground).
        "aurora-glow": "0 0 24px 0 rgba(55,214,196,0.22)",
        "aurora-glow-lg": "0 0 40px 0 rgba(55,214,196,0.20)",
      },
      borderRadius: {
        card: "22px", // Aurora.cardRadius (list cards)
        hero: "28px", // Aurora.heroCardRadius (hero / feature cards)
      },
      fontFamily: {
        display: ["Playfair Display", "serif"],
        mono: ["IBM Plex Mono", "monospace"],
        body: ["Inter", "sans-serif"],
        // Drift app typography (iOS uses Fraunces + Inter).
        "drift-display": ["Fraunces", "serif"],
        "drift-body": ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
}

export default config
