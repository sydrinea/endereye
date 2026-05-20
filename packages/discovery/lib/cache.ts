import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createEventData,
  computeHistoricalData,
  buildPlayerViews,
} from '@endereye/core'
import type { EventContext, EventKind, EventPlayer, PlayerView } from '@endereye/core'

import eventJson from '../data/lcq/10.event.json'
import playersJson from '../data/lcq/10.players.json'

const CACHE: Partial<Record<string, { event: typeof eventJson; players: EventPlayer[] }>> = {
  'lcq:10': { event: eventJson, players: playersJson as EventPlayer[] },
}

export async function loadEventData(
  kind: EventKind,
  season: number,
): Promise<EventContext> {
  const cached = CACHE[`${kind}:${season}`]
  if (cached) {
    return {
      kind,
      season,
      players: cached.players,
      brackets: cached.event.brackets,
      matches: cached.event.matches,
      currentRound: cached.event.currentRound,
    }
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
export type { EventContext as EventData, EventKind, PlayerView }
