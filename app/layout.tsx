import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'BedLink — Database Layer',
  description: 'BedLink Foundational Database Schema and Identity Services',
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
