export const dynamic = 'force-dynamic'

import { ACTIVE_EVENT, EVENTS } from './events.config'
import { getLiveEventData } from './live-data'
import { HeroSection } from './views/HeroSection'
import { LivePoller } from './views/LivePoller'
import { DashboardWrapper } from './views/DashboardWrapper'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ seed?: string }>
}) {
  const now = new Date()
  const isLive = now >= ACTIVE_EVENT.startDate

  if (!isLive) {
    const pastEvents = EVENTS.filter(e => e.slug !== ACTIVE_EVENT.slug)
    return <HeroSection event={ACTIVE_EVENT} pastEvents={pastEvents} />
  }

  const eventData = await getLiveEventData()

  if (!eventData) {
    // After startDate but no matches discovered yet
    const pastEvents = EVENTS.filter(e => e.slug !== ACTIVE_EVENT.slug)
    return (
      <>
        <HeroSection event={ACTIVE_EVENT} pastEvents={pastEvents} />
        <LivePoller intervalMs={30_000} />
      </>
    )
  }

  const { seed: seedParam } = await searchParams
  const defaultSeed = Math.max(eventData.currentRound - 1, 1)
  const seed = Math.min(Math.max(Number(seedParam ?? defaultSeed), 1), 10)

  return (
    <>
      <DashboardWrapper eventData={eventData} seed={seed} eventLabel={ACTIVE_EVENT.label} />
      <LivePoller intervalMs={30_000} />
    </>
  )
}
