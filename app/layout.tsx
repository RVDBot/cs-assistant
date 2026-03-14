import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CS Assistant',
  description: 'Customer Service WhatsApp AI Assistant',
  icons: {
    icon: [
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body className="h-screen overflow-hidden">{children}</body>
    </html>
  )
}
