import type { Metadata } from 'next'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: "Side Quest '25–26 | 89 Days Around the World",
  description: '89 days, 10 countries, 40,000+ miles.',
  icons: { icon: '/favicon.svg' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-midnight text-cream antialiased">{children}</body>
    </html>
  )
}
