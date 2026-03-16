import type { Metadata } from 'next'
import { Playfair_Display, IBM_Plex_Mono, Inter } from 'next/font/google'
import '@/styles/globals.css'

const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-display', display: 'swap' })
const ibmMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['300', '400', '500'], variable: '--font-mono', display: 'swap' })
const inter = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' })

export const metadata: Metadata = {
  title: "Side Quest '25–26 | 89 Days Around the World",
  description: '89 days, 10 countries, 40,000+ miles.',
  icons: { icon: '/favicon.svg' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${ibmMono.variable} ${inter.variable}`}>
      <body className="bg-black text-[#f5f5f7] antialiased">{children}</body>
    </html>
  )
}
