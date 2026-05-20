import { getLiveEventData, IS_MOCK } from '../live-data'
import { DashboardWrapper } from '../views/DashboardWrapper'
import { LivePoller } from '../views/LivePoller'
import { ACTIVE_EVENT } from '../events.config'

export default async function Page({ searchParams }: { searchParams: Promise<{ seed?: string }> }) {
  const { seed: seedParam } = await searchParams
  const eventData = await getLiveEventData()

  const defaultSeed = Math.max(eventData.currentRound - 1, 0)
  const seed = Math.min(Math.max(Number(seedParam ?? defaultSeed), 0), 10)

  return (
    <>
      <DashboardWrapper
        eventData={eventData}
        seed={seed}
        eventLabel={ACTIVE_EVENT.label}
        live={eventData.currentRound <= 10}
        backHref="/"
      />
      <LivePoller intervalMs={IS_MOCK ? 10_000 : 30_000} />
    </>
  )
}
