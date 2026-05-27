import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Footer } from '@/components/layout'
import { getAllEvents, getActiveEvent } from '@/lib/events-config'
import { getEventContext } from '@/lib/event-data'
import { buildMeta } from '@/lib/og-metadata'
import { EventShell } from '@/app/views/EventShell'
import { NoData } from '@/app/views/NoData'

export const revalidate = false

export async function generateMetadata({
  params,
}: {
  params: Promise<{ season: string }>
}): Promise<Metadata> {
  const { season: seasonParam } = await params
  const season = Number(seasonParam)
  const allEvents = await getAllEvents()
  const event = allEvents.find((e) => e.kind === 'lcq' && e.season === season)
  if (!event) return {}
  const imagePath = `/api/og?type=event&label=${encodeURIComponent(event.label)}`
  return buildMeta({
    title: `${event.label} | endereye`,
    description: `Survival analytics and round tracking for ${event.label}.`,
    imagePath,
  })
}

export default async function LCQSeasonLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ season: string }>
}) {
  const { season: seasonParam } = await params
  const season = Number(seasonParam)

  const [allEvents, activeEvent] = await Promise.all([getAllEvents(), getActiveEvent()])
  const event = allEvents.find((e) => e.kind === 'lcq' && e.season === season)
  if (!event) return notFound()

  const eventData = await getEventContext('lcq', season, event.prefix, event.qualifyCount)
  if (!eventData) return <NoData label={event.label} />

  const isActive = event.slug === activeEvent?.slug

  return (
    <>
      <EventShell
        eventData={eventData}
        eventLabel={event.label}
        live={isActive}
        basePath={`/lcq/${season}`}
      >
        {children}
      </EventShell>
      <Footer />
    </>
  )
}
