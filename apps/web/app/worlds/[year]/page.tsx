import type { Metadata } from 'next'
import { getEventContext } from '../../../lib/event-data'
import { DashboardWrapper } from '@/app/views/DashboardWrapper'
import { NoData } from '@/app/views/NoData'
import { getAllEvents, getActiveEvent } from '@/lib/events-config'
import { buildMeta } from '@/lib/og-metadata'

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
    title: `endereye | ${label}`,
    description: `Live survival odds and match tracking for the ${label}.`,
    imagePath,
  })
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>
  searchParams: Promise<{ seed?: string }>
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
