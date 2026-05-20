import { loadEventData } from '@endereye/discovery'
import { DashboardWrapper } from './DashboardWrapper'

export default async function Page({ searchParams }: { searchParams: Promise<{ seed?: string }> }) {
  const { seed: seedParam } = await searchParams
  const seed = Math.min(Math.max(Number(seedParam ?? 7), 1), 10)

  const eventData = await loadEventData('lcq', 10, { skipOdds: true })

  return <DashboardWrapper eventData={eventData} seed={seed} />
}
