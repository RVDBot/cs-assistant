import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CS Assistant',
  description: 'Customer Service WhatsApp AI Assistant',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body className="h-screen overflow-hidden">{children}</body>
    </html>
  )
}
