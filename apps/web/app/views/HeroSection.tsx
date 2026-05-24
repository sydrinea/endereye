import Ranked from '@/components/icons/Ranked'
import { Countdown } from './Countdown'
import { PastEventCard } from './PastEventCard'
import type { EventConfig } from '../../lib/events-config'

interface Props {
  event: EventConfig | null
  pastEvents: EventConfig[]
  upcomingEvents: EventConfig[]
  isOver?: boolean
}

export function HeroSection({ event, pastEvents, isOver = false }: Props) {
  const dateLabel = event?.startDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  })

  return (
    <main className="min-h-[calc(100vh-4rem)] flex flex-col">
      <section className="flex-1 flex flex-col items-center justify-center gap-8 px-6 text-center">
        <Ranked size={128} />
        {event ? (
          <>
            <div className="flex flex-col items-center gap-2">
              <h1 className="font-display text-4xl lg:text-6xl text-zinc-100">{event.label}</h1>
              <p className="text-zinc-500">{dateLabel} · 11am ET</p>
            </div>
            <Countdown target={event.startDate} isOver={isOver} />
          </>
        ) : (
          <p className="text-zinc-500">No upcoming events</p>
        )}
      </section>

      {pastEvents.length > 0 && (
        <section className="flex flex-col items-center gap-3 pb-16 px-6">
          <p className="text-xs text-zinc-600 uppercase tracking-widest mb-1">Past Events</p>
          {pastEvents.map((e) => (
            <PastEventCard key={e.slug} event={e} />
          ))}
        </section>
      )}
    </main>
  )
}
