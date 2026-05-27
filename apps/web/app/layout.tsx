import type { Metadata, Viewport } from 'next'
import { Geist_Mono, Raleway, Lora } from 'next/font/google'
import localFont from 'next/font/local'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'

const minecraft = localFont({
  src: [
    { path: '../public/font/minecraft-regular.otf', weight: '400', style: 'normal' },
    { path: '../public/font/minecraft-bold.otf', weight: '700', style: 'normal' },
    { path: '../public/font/minecraft-italic.otf', weight: '400', style: 'italic' },
    { path: '../public/font/minecraft-bold-italic.otf', weight: '700', style: 'italic' },
  ],
  variable: '--font-minecraft',
  display: 'block',
})

const raleway = Raleway({
  subsets: ['latin'],
  variable: '--font-raleway',
  display: 'swap',
})

const lora = Lora({
  subsets: ['latin'],
  variable: '--font-lora',
  display: 'swap',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : (process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000')

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: 'endereye | LCQ and MSS events tracker',
  description: 'Survival analytics for MCSR Ranked LCQ and MSS events.',
  openGraph: {
    type: 'website',
    title: 'endereye | LCQ/MSS Tracker',
    description: 'Survival analytics for MCSR Ranked LCQ and MSS events.',
    images: [{ url: '/api/og?type=default', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'endereye | LCQ/MSS Tracker',
    description: 'Survival analytics for MCSR Ranked LCQ and MSS events.',
    images: ['/api/og?type=default'],
  },
}

export const viewport: Viewport = {
  themeColor: '#4ade80',
  initialScale: 1,
}

export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode
  modal: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`h-full ${minecraft.variable} ${raleway.variable} ${lora.variable} ${geistMono.variable}`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950">
        <div className="flex-1">{children}</div>
        {modal}
        {process.env.VERCEL_ENV === 'production' && <Analytics />}
        <SpeedInsights />
      </body>
    </html>
  )
}
