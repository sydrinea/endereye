import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { EventConfig } from '../events.config'

export function PastEventCard({ event }: { event: EventConfig }) {
  return (
    <Link
      href={event.path}
      className="group flex items-center justify-between gap-8 rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-4 w-full max-w-md hover:border-zinc-700 transition-colors"
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-display text-zinc-200 group-hover:text-zinc-100 transition-colors">
          {event.label}
        </span>
        <span className="text-xs text-zinc-600">
          {event.startDate.getFullYear()}
        </span>
      </div>
      <span className="inline-flex items-center gap-1.5 text-zinc-600 group-hover:text-zinc-400 transition-colors text-sm shrink-0">
        View results <ArrowRight size={14} />
      </span>
    </Link>
  )
}
