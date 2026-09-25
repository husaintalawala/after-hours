import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Side Quest | 89 Days Around the World",
  description: "A personal 89-day sabbatical around the world.",
  alternates: { canonical: "https://rashu.after-hours.app/" },
  openGraph: {
    title: "Side Quest | 89 Days Around the World",
    description: "A personal 89-day sabbatical around the world.",
    url: "https://rashu.after-hours.app/",
    type: "website",
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/favicon.svg" },
}

export default function SideQuestLayout({ children }: { children: React.ReactNode }) {
  return children
}
