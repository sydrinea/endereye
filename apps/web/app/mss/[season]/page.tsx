import { notFound } from 'next/navigation'
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
  params: Promise<{ season: string }>
}): Promise<Metadata> {
  const { season: seasonParam } = await params
  const season = Number(seasonParam)
  const allEvents = await getAllEvents()
  const event = allEvents.find((e) => e.kind === 'mss' && e.season === season)
  if (!event) return {}
  const imagePath = `/api/og?type=event&label=${encodeURIComponent(event.label)}`
  return buildMeta({
    title: `${event.label} | endereye`,
    description: `Survival analytics and round tracking for ${event.label}.`,
    imagePath,
  })
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ season: string }>
  searchParams: Promise<{ seed?: string }>
}) {
  const { season: seasonParam } = await params
  const season = Number(seasonParam)

  const [allEvents, activeEvent] = await Promise.all([getAllEvents(), getActiveEvent()])
  const event = allEvents.find((e) => e.kind === 'mss' && e.season === season)
  if (!event) return notFound()
  const eventLabel = event.label
  const isActive = event.slug === activeEvent?.slug

  const eventData = await getEventContext('mss', season, event.prefix, event.qualifyCount)

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
