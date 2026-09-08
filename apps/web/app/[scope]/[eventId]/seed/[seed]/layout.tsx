import { notFound } from 'next/navigation'
import { resolveEventRoute } from '@/lib/event-route'
import { getEventViews } from '@/lib/event-data'
import { EventShell } from '@/app/views/EventShell'
import { NoData } from '@/app/views/NoData'

export default async function EventSeedLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ scope: string; eventId: string; seed: string }>
}) {
  const { scope, eventId, seed: seedParam } = await params
  const seed = Math.min(Math.max(Number(seedParam), 0), 10)

  const descriptor = await resolveEventRoute(scope, eventId)
  if (!descriptor) return notFound()

  const { prefix, season, qualifyCount, label, basePath } = descriptor
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
      {children}
    </EventShell>
  )
}
