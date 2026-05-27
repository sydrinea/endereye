import type { Metadata } from 'next'
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
  params: Promise<{ year: string }>
}): Promise<Metadata> {
  const { year: yearParam } = await params
  const year = Number(yearParam)
  const allEvents = await getAllEvents()
  const event = allEvents.find((e) => e.kind === 'worlds' && e.startDate.getFullYear() === year)
  const label = event?.label ?? `${year} World Championships`
  const imagePath = `/api/og?type=event&label=${encodeURIComponent(label)}`
  return buildMeta({
    title: `${label} | endereye`,
    description: `Survival analytics and round tracking for ${label}.`,
    imagePath,
  })
}

export default async function WorldsYearLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ year: string }>
}) {
  const { year: yearParam } = await params
  const year = Number(yearParam)

  const [allEvents, activeEvent] = await Promise.all([getAllEvents(), getActiveEvent()])
  const event = allEvents.find((e) => e.kind === 'worlds' && e.startDate.getFullYear() === year)
  const eventLabel = event?.label ?? `${year} World Championships`
  const isActive = event?.slug === activeEvent?.slug

  const eventData = await getEventContext(
    'worlds',
    event?.season ?? year,
    event?.prefix ?? `worlds/${year}`,
    event?.qualifyCount,
  )

  if (!eventData) return <NoData label={eventLabel} />

  return (
    <>
      <EventShell
        eventData={eventData}
        eventLabel={eventLabel}
        live={isActive}
        basePath={`/worlds/${year}`}
      >
        {children}
      </EventShell>
      <Footer />
    </>
  )
}
