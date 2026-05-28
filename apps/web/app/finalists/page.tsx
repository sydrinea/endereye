import { Footer } from '@/components/layout'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Breadcrumbs } from '@/components/ui'
import { FinalistsPanel } from './FinalistsPanel'
import { buildMeta } from '@/lib/og-metadata'
import type { FinalistsChartData } from '@/lib/finals-stats'
import { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const data = await readFile(
    join(process.cwd(), 'public', 'data', 'finalists.json'),
    'utf-8',
  ).then((json) => JSON.parse(json) as FinalistsChartData)
  const imagePath = `/api/og?type=finalists&players=${[...new Set([...data.finalists.map((finalist) => finalist.uuid)])].join(',')}`
  return buildMeta({
    title: 'Finalist Results | endereye',
    description: 'Survival analytics across all finalists from every historical event',
    imagePath,
  })
}

export default async function FinalistsPage() {
  const data = await readFile(
    join(process.cwd(), 'public', 'data', 'finalists.json'),
    'utf-8',
  ).then((json) => JSON.parse(json) as FinalistsChartData)

  return (
    <>
      <main className="flex flex-col items-center px-6 py-8 gap-8">
        <div className="w-full max-w-3xl flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Finalist Results' }]} />
            <h1 className="font-display text-3xl text-zinc-100">Finalist Results</h1>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Survival odds and clinch slack for every player who qualified across all{' '}
              {data.events.length} historical events. Use the presets and event filter to narrow
              your view.
            </p>
          </div>
          <FinalistsPanel data={data} />
        </div>
      </main>
      <Footer />
    </>
  )
}
