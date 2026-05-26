import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { PlayerAvatar } from '@/components/ui'

export function PlayerCard({ uuid, nickname, from }: { uuid: string; nickname: string; from?: string }) {
  const href = from ? `/players/${uuid}?from=${encodeURIComponent(from)}` : `/players/${uuid}`
  return (
    <Link href={href} className="group w-full">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 transition-colors group-hover:border-zinc-700">
        <div className="flex items-center gap-3 min-w-0">
          <PlayerAvatar nickname={nickname} size="md" />
          <span className="font-display text-sm text-zinc-200 group-hover:text-zinc-100 transition-colors truncate">
            {nickname}
          </span>
        </div>
        <span className="inline-flex items-center gap-1 text-zinc-600 group-hover:text-zinc-400 transition-colors text-xs shrink-0">
          View career <ArrowRight size={12} />
        </span>
      </div>
    </Link>
  )
}
