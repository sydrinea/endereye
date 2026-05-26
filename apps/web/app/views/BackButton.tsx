'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

const cls = 'inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors'

function Inner({ fallback }: { fallback: string }) {
  const from = useSearchParams().get('from') ?? fallback
  return <Link href={from} className={cls}><ArrowLeft size={14} />Back</Link>
}

export function BackButton({ fallback = '/' }: { fallback?: string }) {
  return (
    <Suspense fallback={<Link href={fallback} className={cls}><ArrowLeft size={14} />Back</Link>}>
      <Inner fallback={fallback} />
    </Suspense>
  )
}
