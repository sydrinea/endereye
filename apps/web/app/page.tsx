import { connection } from 'next/server'
import { getActiveEvent, getAllEvents } from '../lib/events-config'
import { getEventContext } from '../lib/event-data'
import { HeroSection } from './views/HeroSection'

export const revalidate = false

export default async function Page() {
  await connection()
  const [activeEvent, allEvents] = await Promise.all([getActiveEvent(), getAllEvents()])
  const pastEvents = allEvents.filter((e) => e.slug !== activeEvent?.slug)

  const eventData = activeEvent
    ? await getEventContext(activeEvent.kind, activeEvent.season, activeEvent.prefix, activeEvent.qualifyCount)
    : null

  const now = new Date()
  const isLive = activeEvent ? now >= activeEvent.startDate : false
  const isOver = isLive ? (eventData?.currentRound ?? 0) > 10 : false

  return <HeroSection event={activeEvent} pastEvents={pastEvents} isOver={isOver} />
}
