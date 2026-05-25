import { getEventContext } from '../../../lib/event-data'
import { DashboardWrapper } from '@/app/views/DashboardWrapper'
import { NoData } from '@/app/views/NoData'
import { getAllEvents, getActiveEvent } from '@/lib/events-config'

export const revalidate = false

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ season: string }>
  searchParams: Promise<{ seed?: string }>
}) {
  const { season: seasonParam } = await params
  const season = Number(seasonParam)

  const [allEvents, activeEvent] = await Promise.all([getAllEvents(), getActiveEvent()])
  const event = allEvents.find((e) => e.kind === 'lcq' && e.season === season)
  const eventLabel = event?.label ?? `S${season} LCQ`
  const isActive = event?.slug === activeEvent?.slug

  const eventData = await getEventContext(
    'lcq',
    season,
    event?.prefix ?? `lcq/${season}`,
    event?.qualifyCount,
  )

  if (!eventData) return <NoData label={eventLabel} />

  const { seed: seedParam } = await searchParams
  const defaultSeed = Math.max(eventData.currentRound - 1, 0)
  const seed = Math.min(Math.max(Number(seedParam ?? defaultSeed), 0), 10)

  return (
    <DashboardWrapper
      eventData={eventData}
      seed={seed}
      eventLabel={eventLabel}
      live={isActive}
      backHref="/"
    />
  )
}
