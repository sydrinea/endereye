import { getAllEvents } from '@/lib/events-config'
import { getEventContext } from '@/lib/event-data'
import { computeFinalistsData } from '@/lib/finals-stats'
import { BackButton } from '@/app/views/BackButton'
import { FinalistsPanel } from './FinalistsPanel'

export const revalidate = false

import { buildMeta } from '@/lib/og-metadata'

export const metadata = buildMeta({
  title: 'endereye | Finalist Results',
  description: 'Survival odds and clinch slack across all finalists from every historical event.',
  imagePath: '/api/og?type=finalists',
})

export default async function FinalistsPage() {
  const allEvents = await getAllEvents()
  const now = new Date()
  const completed = allEvents
    .filter((e) => e.startDate < now)
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())

  const loaded = (
    await Promise.all(
      completed.map(async (config) => {
        const context = await getEventContext(
          config.kind,
          config.season,
          config.prefix,
          config.qualifyCount,
        )
        if (!context) return null
        return { config, context }
      }),
    )
  ).filter((x): x is NonNullable<typeof x> => x !== null)

  const data = computeFinalistsData(loaded)

  return (
    <main className="flex flex-col items-center px-6 py-8 gap-8">
      <div className="w-full max-w-3xl flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <BackButton />
          <h1 className="font-display text-3xl text-zinc-100">Finalist Results</h1>
          <p className="text-sm text-zinc-500 leading-relaxed">
            Survival odds and clinch slack for every player who qualified across all{' '}
            {data.events.length} historical events. Use the filters to focus on specific patterns or
            events.
          </p>
        </div>
        <FinalistsPanel data={data} />
      </div>
    </main>
  )
}
