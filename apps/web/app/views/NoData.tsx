'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Surface } from '@/components/layout/Surface'

export function NoData({ label, prefix }: { label: string; prefix?: string }) {
  const router = useRouter()
  const [waiting] = useState(!!prefix)

  useEffect(() => {
    if (!prefix) return
    const check = async () => {
      try {
        const res = await fetch(`/api/events/version?prefix=${encodeURIComponent(prefix)}`)
        const { currentRound } = await res.json()
        if (currentRound !== null) router.refresh()
      } catch {}
    }
    const id = setInterval(check, 10_000)
    return () => clearInterval(id)
  }, [prefix, router])

  return (
    <Surface variant="centered">
      <div className="text-center space-y-4">
        <h1 className="font-display text-2xl text-zinc-200">{label}</h1>
        {waiting ? (
          <div className="flex items-center justify-center gap-2 text-zinc-500 text-sm">
            <span>Waiting for data</span>
            <Loader2 size={14} className="animate-spin" />
          </div>
        ) : (
          <p className="text-zinc-500 text-sm max-w-xs mx-auto">
            Data isn&apos;t available yet. Check back soon.
          </p>
        )}
        <Link href="/" className="inline-block text-accent hover:underline text-sm">
          Back to Home
        </Link>
        <p className="text-xs text-zinc-600">
          Match data via{' '}
          <a
            href="https://api.mcsrranked.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-400 transition-colors"
          >
            api.mcsrranked.com
          </a>
        </p>
      </div>
    </Surface>
  )
}
