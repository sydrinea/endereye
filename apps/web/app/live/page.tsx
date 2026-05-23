import { getEventContext } from '../../lib/event-data'
import { DashboardWrapper } from '../views/DashboardWrapper'
import { getActiveEvent } from '../../lib/events-config'

export const revalidate = false

export default async function Page({ searchParams }: { searchParams: Promise<{ seed?: string }> }) {
  const { seed: seedParam } = await searchParams

  const activeEvent = await getActiveEvent()

  if (!activeEvent) {
    return (
      <div className="flex items-center justify-center min-h-screen text-neutral-400 text-sm">
        No event data available yet.
      </div>
    )
  }

  const eventData = await getEventContext(
    activeEvent.kind,
    activeEvent.season,
    activeEvent.prefix,
    activeEvent.qualifyCount,
  )

  if (!eventData) {
    return (
      <div className="flex items-center justify-center min-h-screen text-neutral-400 text-sm">
        No event data available yet.
      </div>
    )
  }

  const defaultSeed = Math.max(eventData.currentRound - 1, 0)
  const seed = Math.min(Math.max(Number(seedParam ?? defaultSeed), 0), 10)

  return (
    <DashboardWrapper
      eventData={eventData}
      seed={seed}
      eventLabel={activeEvent.label}
      live={eventData.currentRound <= 10}
      backHref="/"
    />
  )
}
