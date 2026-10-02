import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BedLink — Emergency Hospital-Bed Coordination',
  description:
    'Real-time emergency bed coordination platform. Nurse, Dispatch Operator, and Hospital Staff interfaces with deterministic ranking, atomic reservation holds, and Supabase Realtime synchronization.',
  authors: [{ name: 'Bug Dealers' }],
  keywords: ['emergency', 'hospital', 'bed coordination', 'EMS', 'dispatch'],
  robots: 'noindex, nofollow',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
