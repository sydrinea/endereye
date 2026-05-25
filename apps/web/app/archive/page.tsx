import { connection } from 'next/server'
import { getAllEvents } from '../../lib/events-config'
import { EventCard } from '../views/EventCard'

export const revalidate = false

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
        <h1 className="font-display text-3xl text-zinc-100 mb-6">Archives</h1>
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
