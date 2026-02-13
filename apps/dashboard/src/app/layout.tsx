import type { Metadata } from 'next'

import { ThemeProvider } from '@/components/theme-provider'

import './globals.css'

export const metadata: Metadata = {
  title: 'Pigeon Dashboard',
  description: 'Manage projects, templates, environments, and notifications.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          storageKey="pigeon-dashboard-theme"
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
