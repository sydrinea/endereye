import { notFound } from 'next/navigation'
import { getAllEvents, getActiveEvent } from '@/lib/events-config'
import { getEventContext, getEventViews } from '@/lib/event-data'
import { EventShell } from '@/app/views/EventShell'
import { NoData } from '@/app/views/NoData'
import { StandingsTabPage } from '@/app/views/tabs/StandingsTabPage'

const VALID_KINDS = ['worlds', 'mss', 'lcq'] as const
type EventKind = (typeof VALID_KINDS)[number]

function defaultLabel(kind: string, id: number): string {
  if (kind === 'worlds') return `${id} World Championships`
  return `${kind.toUpperCase()} Season ${id}`
}

export default async function EventKindPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>
}) {
  const { kind, id: idParam } = await params
  const id = Number(idParam)
  if (!VALID_KINDS.includes(kind as EventKind)) return notFound()

  const [allEvents, activeEvent] = await Promise.all([getAllEvents(), getActiveEvent()])
  const event = allEvents.find((e) => {
    if (e.kind !== kind) return false
    return kind === 'worlds' ? e.startDate.getFullYear() === id : e.season === id
  })
  if (!event) return notFound()

  const eventLabel = event.label ?? defaultLabel(kind, id)
  const prefix = event.prefix ?? `${kind}/${id}`
  const kindParam = kind as EventKind
  const season = event.season ?? id

  const eventData = await getEventContext(kindParam, season, prefix, event.qualifyCount)
  if (!eventData) return <NoData label={eventLabel} prefix={prefix} />

  const seed = Math.max(eventData.currentRound - 1, 0)
  const result = await getEventViews(kindParam, season, prefix, seed, event.qualifyCount)
  if (!result) return <NoData label={eventLabel} prefix={prefix} />

  return (
    <EventShell
      eventData={result.eventData}
      eventLabel={eventLabel}
      live={event.slug === activeEvent?.slug}
      basePath={`/${kind}/${id}`}
      prefix={prefix}
      seed={seed}
      views={result.views}
    >
      <StandingsTabPage />
    </EventShell>
  )
}
