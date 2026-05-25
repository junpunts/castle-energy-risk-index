import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Castle Risk Index',
  description:
    'Political and regulatory risk index for renewable-energy projects.',
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
