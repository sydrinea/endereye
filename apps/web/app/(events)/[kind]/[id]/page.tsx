import { notFound } from 'next/navigation'
import {
  computeHistoricalData,
  computeMCResults,
  computePlayerOdds,
  buildPlayerViews,
} from '@endereye/core'
import { getAllEvents, getActiveEvent } from '@/lib/events-config'
import { getEventContext } from '@/lib/event-data'
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

  const eventLabel = event?.label ?? defaultLabel(kind, id)
  const eventData = await getEventContext(
    kind as EventKind,
    event?.season ?? id,
    event?.prefix ?? `${kind}/${id}`,
    event?.qualifyCount,
  )
  if (!eventData) return <NoData label={eventLabel} />

  const latestSeed = Math.max(eventData.currentRound - 1, 0)
  const ctx = computeHistoricalData(eventData, latestSeed)
  const mcResults = computeMCResults(ctx, 20000)
  const odds = computePlayerOdds(ctx, mcResults)
  const views = buildPlayerViews(ctx, odds)

  return (
    <EventShell
      eventData={eventData}
      eventLabel={eventLabel}
      live={event?.slug === activeEvent?.slug}
      basePath={`/${kind}/${id}`}
      seed={latestSeed}
      views={views}
    >
      <StandingsTabPage />
    </EventShell>
  )
}
