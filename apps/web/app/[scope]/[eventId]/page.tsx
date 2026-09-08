import { notFound } from 'next/navigation'
import { resolveEventRoute } from '@/lib/event-route'
import { getEventContext, getEventViews } from '@/lib/event-data'
import { EventShell } from '@/app/views/EventShell'
import { NoData } from '@/app/views/NoData'
import { StandingsTabPage } from '@/app/views/tabs/StandingsTabPage'

export default async function EventPage({
  params,
}: {
  params: Promise<{ scope: string; eventId: string }>
}) {
  const { scope, eventId } = await params
  const descriptor = await resolveEventRoute(scope, eventId)
  if (!descriptor) return notFound()

  const { prefix, season, qualifyCount, label, basePath } = descriptor

  const eventData = await getEventContext(descriptor.kind, season, prefix, qualifyCount)
  if (!eventData) return <NoData label={label} prefix={prefix} />

  const seed = Math.max(eventData.currentRound - 1, 0)
  const result = await getEventViews(descriptor.kind, season, prefix, seed, qualifyCount)
  if (!result) return <NoData label={label} prefix={prefix} />

  return (
    <EventShell
      eventData={result.eventData}
      eventLabel={label}
      live={descriptor.isActive && result.eventData.currentRound <= 10}
      basePath={basePath}
      prefix={prefix}
      seed={seed}
      views={result.views}
    >
      <StandingsTabPage />
    </EventShell>
  )
}
