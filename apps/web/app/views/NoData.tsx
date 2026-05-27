import Link from 'next/link'
import { Surface } from '@/components/layout/Surface'

export function NoData({ label }: { label: string }) {
  return (
    <Surface variant="centered">
      <div className="text-center space-y-4">
        <h1 className="font-display text-2xl text-zinc-200">{label}</h1>
        <p className="text-zinc-500 text-sm max-w-xs mx-auto">
          Data isn&apos;t available yet. Check back soon.
        </p>
        <Link href="/" className="inline-block text-accent hover:underline text-sm">
          Back to Home
        </Link>
      </div>
    </Surface>
  )
}
