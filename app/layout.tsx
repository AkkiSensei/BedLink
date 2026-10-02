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
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F6F4' },
    { media: '(prefers-color-scheme: dark)', color: '#1A2421' },
  ],
  colorScheme: 'light dark',
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
