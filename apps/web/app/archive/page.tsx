import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { connection } from 'next/server'
import { getAllEvents } from '../../lib/events-config'
import { EventCard } from '../views/EventCard'
import { BackButton } from '../views/BackButton'
import { buildMeta } from '@/lib/og-metadata'

export const revalidate = false

export const metadata = buildMeta({
  title: 'endereye | Archive',
  description: 'Past MCSR Ranked LCQ and MSS events with survival odds and match history.',
  imagePath: '/api/og?type=default',
})

export default async function ArchivePage() {
  await connection()
  const allEvents = await getAllEvents()
  const now = new Date()
  const past = allEvents
    .filter((e) => e.startDate < now)
    .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())

  return (
    <main className="flex flex-col items-center px-6 py-8 gap-6">
      <div className="w-full max-w-md">
        <BackButton />
        <div className="flex items-center justify-between mb-6 mt-2">
          <h1 className="font-display text-3xl text-zinc-100">Archives</h1>
          <Link
            href="/finalists"
            className="group inline-flex items-center gap-1.5 text-zinc-600 hover:text-zinc-400 transition-colors text-sm shrink-0"
          >
            Finalist Results <ArrowRight size={14} />
          </Link>
        </div>
        <div className="flex flex-col gap-3">
          {past.map((e) => (
            <EventCard key={e.slug} event={e} />
          ))}
          {past.length === 0 && <p className="text-zinc-500 text-sm">No past events yet.</p>}
        </div>
      </div>
    </main>
  )
}
