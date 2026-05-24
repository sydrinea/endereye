import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { EventConfig } from '../../lib/events-config'

export function EventCard({ event, upcoming = false }: { event: EventConfig; upcoming?: boolean }) {
  const dateLabel = upcoming
    ? event.startDate.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'America/New_York',
      })
    : String(event.startDate.getFullYear())

  const inner = (
    <div
      className={`flex items-center justify-between gap-8 rounded-xl border px-6 py-4 w-full max-w-md transition-colors ${
        upcoming
          ? 'border-accent/20 border-l-2 border-l-accent/40 bg-zinc-900/50'
          : 'border-zinc-800 bg-zinc-900 group-hover:border-zinc-700'
      }`}
    >
      <div className="flex flex-col gap-0.5">
        <span
          className={`font-display transition-colors ${
            upcoming ? 'text-zinc-400' : 'text-zinc-200 group-hover:text-zinc-100'
          }`}
        >
          {event.label}
        </span>
        <span className="text-xs text-zinc-600">{dateLabel}</span>
      </div>
      {!upcoming && (
        <span className="inline-flex items-center gap-1.5 text-zinc-600 group-hover:text-zinc-400 transition-colors text-sm shrink-0">
          View results <ArrowRight size={14} />
        </span>
      )}
    </div>
  )

  if (upcoming) return inner

  return (
    <Link href={event.path} className="group w-full max-w-md">
      {inner}
    </Link>
  )
}
