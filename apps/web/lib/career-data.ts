import type { EventContext, EventPlayer } from '@endereye/core'
import { getAllEvents } from './events-config'
import type { EventConfig } from './events-config'
import { getEventContext } from './event-data'
import { getR2Object } from './r2'

export interface CareerSeedSnapshot {
  seed: number
  survivalPct: number
  clinchSlack: number | null
}

export interface CareerSeedResultCell {
  place: number | null
  score: number | null
  rankAfter: number | null
  rankDelta: number | null
  eliminated: boolean
}

export interface CareerEventSlice {
  label: string
  color: string
  snapshots: CareerSeedSnapshot[]
  finalRank: number | null
  qualified: boolean
  dnfSeeds: Array<{ seed: number; survivalDrop: number }>
  seedResults: CareerSeedResultCell[]
}

export const CAREER_COLORS = [
  '#38bdf8',
  '#4ade80',
  '#f472b6',
  '#fb923c',
  '#a78bfa',
  '#facc15',
  '#34d399',
  '#f87171',
  '#60a5fa',
  '#e879f9',
  '#fbbf24',
  '#2dd4bf',
  '#818cf8',
  '#f43f5e',
  '#22d3ee',
  '#84cc16',
  '#c084fc',
  '#fb7185',
  '#0ea5e9',
  '#10b981',
]

export interface CareerRawEvent {
  label: string
  color: string
  kind: 'lcq' | 'mss' | 'worlds'
  season: number
  path: string
  eventContext: EventContext
}

export interface CareerContext {
  uuid: string
  nickname: string
  country: string | null
  events: CareerRawEvent[]
}

export async function getCareerContext(uuid: string): Promise<CareerContext | null> {
  const allEvents = await getAllEvents()

  const playerLists = await Promise.all(
    allEvents.map((e) => getR2Object<EventPlayer[]>(`${e.prefix}.players.json`)),
  )

  const matchedEvents = allEvents.filter((_, i) => playerLists[i]?.some((p) => p.uuid === uuid))

  if (matchedEvents.length === 0) return null

  const contexts = await Promise.all(
    matchedEvents.map((e) => getEventContext(e.kind, e.season, e.prefix, e.qualifyCount)),
  )

  const sorted = matchedEvents
    .map((e, i) => ({ event: e, ctx: contexts[i] }))
    .filter((x): x is { event: EventConfig; ctx: EventContext } => x.ctx !== null)
    .sort((a, b) => a.event.startDate.getTime() - b.event.startDate.getTime())

  if (sorted.length === 0) return null

  const player = sorted[0].ctx.players.find((p) => p.uuid === uuid)
  if (!player) return null

  const events: CareerRawEvent[] = sorted.map(({ event, ctx }, idx) => ({
    label: event.label,
    color: CAREER_COLORS[idx % CAREER_COLORS.length],
    kind: event.kind,
    season: event.season,
    path: event.path,
    eventContext: ctx,
  }))

  return { uuid, nickname: player.nickname, country: player.country, events }
}
