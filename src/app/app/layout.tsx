import type { Metadata } from "next"

// Browser-tab identity for the whole Drift app section (/app/*), including the
// login page which lives OUTSIDE the (protected) group. Scoped here so the
// marketing/Side Quest root layout keeps its own title + favicon. The real
// Drift mark (drift-logo.png, the same logo shown in the app nav rail) is the
// favicon — the old teal-arrow drift-icon.svg was a placeholder.
export const metadata: Metadata = {
  title: "Drift | AI Travel Planner",
  // The whole /app tree stays out of search results.
  //
  // Nothing under here is a landing page: /app/login is a door, and everything
  // behind it is someone's trip. Search Console was already reporting these as
  // "Page with redirect" because Googlebot hits a protected route and gets
  // bounced to login — crawl budget spent to learn nothing.
  //
  // The privacy half matters more than the SEO half: trips carry real
  // itineraries, and indexing is not the mechanism that should be deciding
  // what is public.
  robots: { index: false, follow: false },
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
