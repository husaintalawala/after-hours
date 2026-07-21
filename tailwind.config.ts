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
        // --- Drift logged-in app (light theme). Namespaced `drift-*` so
        // they never collide with the marketing landing's dark palette
        // above. Mirrors DriftTheme.swift (iOS source of truth). ---
        drift: {
          coral: "#E0563B",
          "coral-50": "#FEEDE8",
          "coral-deep": "#B03421",
          ink: "#1F1F24",
          muted: "#6B6B72",
          "text-tertiary": "#9B9BA2",
          "alt-bg": "#F7F7F8",
          "card-active": "#F1F1F3",
          divider: "#E6E6E8",
        },
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
