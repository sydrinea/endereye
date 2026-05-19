import { Surface } from '@/components/layout/Surface'
import Link from 'next/link'

export default function NotFound() {
  return (
    <Surface variant="centered">
      <div className="text-center space-y-4">
        <p className="font-display text-6xl text-accent">404</p>
        <h1 className="font-display text-2xl text-zinc-200">Page not found</h1>
        <p className="text-zinc-500 text-sm max-w-xs mx-auto">
          This page doesn&apos;t exist. It may have been moved or never existed.
        </p>
        <Link href="/" className="inline-block text-accent hover:underline text-sm">
          Back to Home
        </Link>
      </div>
    </Surface>
  )
}
