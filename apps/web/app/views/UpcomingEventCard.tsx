import type { EventConfig } from '../../lib/events-config'

export function UpcomingEventCard({ event }: { event: EventConfig }) {
  const dateLabel = event.startDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  })
  return (
    <div className="flex items-center justify-between gap-8 rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-4 w-full max-w-md">
      <div className="flex flex-col gap-0.5">
        <span className="font-display text-zinc-200">{event.label}</span>
        <span className="text-xs text-zinc-600">{dateLabel}</span>
      </div>
    </div>
  )
}
