import type { Metadata } from 'next'
import { Inter, Geist_Mono } from 'next/font/google'
import './globals.css'
import { SyncProvider } from '@/components/layout/sync-context'
import { Sidebar } from '@/components/layout/sidebar'
import { AutoSync } from '@/components/layout/auto-sync'
import { Toaster } from '@/components/ui/sonner'

const inter = Inter({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Product Feedback — Zeni',
  description: 'AI-powered product feedback analysis for Zeni',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`dark ${inter.className}`}>
      <body className={`${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  )
}
