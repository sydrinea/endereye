import { loadEventData } from '@endereye/discovery'
import { DashboardWrapper } from '@/app/views/DashboardWrapper'
import { EVENTS, ACTIVE_EVENT } from '@/app/events.config'

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ season: string }>
  searchParams: Promise<{ seed?: string }>
}) {
  const { season: seasonParam } = await params
  const season = Number(seasonParam)

  const event = EVENTS.find(e => e.kind === 'lcq' && e.season === season)
  const eventLabel = event?.label ?? `S${season} LCQ`
  const isActive = event?.slug === ACTIVE_EVENT.slug

  const eventData = await loadEventData('lcq', season, { skipOdds: true })

  const { seed: seedParam } = await searchParams
  const defaultSeed = Math.max(eventData.currentRound - 1, 1)
  const seed = Math.min(Math.max(Number(seedParam ?? defaultSeed), 1), 10)

  return <DashboardWrapper eventData={eventData} seed={seed} eventLabel={eventLabel} live={isActive} backHref="/" />
}
