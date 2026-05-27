import { Footer } from '@/components/layout'
import { connection } from 'next/server'
import { getAllEvents } from '../../lib/events-config'
import { EventCard } from '../views/EventCard'
import { Breadcrumbs } from '@/components/ui'
import { buildMeta } from '@/lib/og-metadata'

export const revalidate = false

export const metadata = buildMeta({
  title: 'Archive | endereye',
  description:
    'Review survival analytics and round history for past MCSR Ranked LCQ and MSS events.',
  imagePath: '/api/og?type=default',
})

export default async function ArchivePage() {
  await connection()
  const allEvents = await getAllEvents()
  const now = new Date()
  const past = allEvents
    .filter((e) => e.startDate < now)
    .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())

  const lcq = past.filter((e) => e.kind === 'lcq' || e.kind === 'worlds')
  const mss = past.filter((e) => e.kind === 'mss')

  return (
    <>
    <main className="flex flex-col items-center px-6 py-8 gap-6">
      <div className="w-full max-w-4xl">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Archives' }]} />
        <div className="flex items-center justify-between mb-6 mt-2">
          <h1 className="font-display text-3xl text-zinc-100">Archives</h1>
        </div>
        {past.length === 0 ? (
          <p className="text-zinc-500 text-sm">No past events yet.</p>
        ) : (
          <div className="flex flex-col gap-12">
            {lcq.length > 0 && (
              <section>
                <h2 className="font-display text-2xl text-zinc-100 mb-4">LCQ</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 justify-items-center sm:justify-items-stretch">
                  {lcq.map((e) => (
                    <EventCard key={e.slug} event={e} />
                  ))}
                </div>
              </section>
            )}

            {mss.length > 0 && (
              <section>
                <h2 className="font-display text-2xl text-zinc-100 mb-4">MSS</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 justify-items-center sm:justify-items-stretch">
                  {mss.map((e) => (
                    <EventCard key={e.slug} event={e} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
    <Footer />
    </>
  )
}
