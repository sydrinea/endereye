import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import Ranked from '@/components/icons/Ranked'
import { AnnouncementBanner } from '@/components/layout'
import { Countdown } from './Countdown'
import { EventCard } from './EventCard'
import type { EventConfig } from '../../lib/events-config'

interface Props {
  event: EventConfig | null
  upcomingEvents: EventConfig[]
  hasPastEvents?: boolean
  isOver?: boolean
}

export function HeroSection({
  event,
  upcomingEvents,
  hasPastEvents = false,
  isOver = false,
}: Props) {
  const dateLabel = event?.startDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  })

  return (
    <main className="min-h-[calc(100vh-4rem)] flex flex-col">
      <AnnouncementBanner label="New: Methodology & Accuracy" href="/method" />
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

      {(upcomingEvents.length > 0 || hasPastEvents) && (
        <section className="flex flex-col items-center gap-3 pt-12 pb-16 px-6">
          {upcomingEvents.length > 0 && (
            <>
              <p className="text-xs text-zinc-600 uppercase tracking-widest mb-1">Next Event</p>
              {upcomingEvents
                .sort((a, b) => (new Date(a.startDate) > new Date(b.startDate) ? 1 : -1))
                .slice(0, 1)
                .map((e) => (
                  <EventCard key={e.slug} event={e} upcoming />
                ))}
            </>
          )}
          {hasPastEvents && (
            <Link
              href="/archive"
              className="group inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mt-2"
            >
              View Archives <ArrowRight size={14} />
            </Link>
          )}
        </section>
      )}
    </main>
  )
}
