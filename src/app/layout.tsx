import type { Metadata } from "next"
import "@/styles/globals.css"

export const metadata: Metadata = {
  title: "Side Quest | 89 Days Around the World",
  description: "89 days, 10 countries, 40,000+ miles.",
  icons: { icon: "/favicon.svg" },
  other: {
    "impact-site-verification": "d801b9d7-f165-4297-814c-bd75223d116b",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&family=Inter:wght@300;400;500&family=Playfair+Display:ital,wght@0,300;0,400;0,500;1,300;1,400&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-black text-[#f5f5f7] antialiased">{children}</body>
    </html>
  )
}
