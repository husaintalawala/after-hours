import type { Metadata } from "next"

// Browser-tab identity for the whole Drift app section (/app/*), including the
// login page which lives OUTSIDE the (protected) group. Scoped here so the
// marketing/Side Quest root layout keeps its own title + favicon. The real
// Drift mark (drift-logo.png, the same logo shown in the app nav rail) is the
// favicon — the old teal-arrow drift-icon.svg was a placeholder.
export const metadata: Metadata = {
  title: "Drift | AI Travel Planner",
  icons: {
    icon: "/drift-logo.png",
    shortcut: "/drift-logo.png",
    apple: "/drift-logo.png",
  },
}

export default function AppSectionLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
