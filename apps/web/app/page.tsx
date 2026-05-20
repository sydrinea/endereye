import { connection } from 'next/server'
import { ACTIVE_EVENT, EVENTS } from './events.config'
import { getLiveEventData } from './live-data'
import { HeroSection } from './views/HeroSection'

export default async function Page() {
  await connection()
  const pastEvents = EVENTS.filter((e) => e.slug !== ACTIVE_EVENT.slug)
  const eventData = await getLiveEventData()
  const now = new Date()
  const isLive = now >= ACTIVE_EVENT.startDate
  const isOver = isLive ? eventData.currentRound > 10 : false

  return <HeroSection event={ACTIVE_EVENT} pastEvents={pastEvents} isOver={isOver} />
}
