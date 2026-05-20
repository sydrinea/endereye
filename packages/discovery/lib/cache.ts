import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createEventData,
  createEventDataFromParts,
  computeHistoricalData,
  buildPlayerViews,
} from '@endereye/core'
import type { EventData, EventKind, EventPlayer, PlayerView } from '@endereye/core'

import eventJson from '../data/lcq/10.event.json'
import playersJson from '../data/lcq/10.players.json'

const CACHE: Partial<Record<string, { event: typeof eventJson; players: EventPlayer[] }>> = {
  'lcq:10': { event: eventJson, players: playersJson as EventPlayer[] },
}

export async function loadEventData(kind: EventKind, season: number): Promise<EventData> {
  const cached = CACHE[`${kind}:${season}`]
  if (cached) {
    return createEventDataFromParts(cached.event, cached.players, kind, season)
  }
  return createEventData(kind, season)
}

export async function seedPlayerCache(kind: EventKind, season: number): Promise<void> {
  const data = await createEventData(kind, season)
  const pPath = join(__dirname, `../data/${kind}/${season}.players.json`)
  writeFileSync(pPath, JSON.stringify(data.players, null, 2))
  console.log(`Wrote ${data.players.length} players to ${pPath}`)
}

export { computeHistoricalData, buildPlayerViews }
export type { EventData, EventKind, PlayerView }
