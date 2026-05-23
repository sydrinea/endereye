import { getR2Object } from './r2'
import type { EventContext, EventKind, EventPlayer, BracketEntry } from '@endereye/core'

interface StoredEvent {
  currentRound: number
  matches: number[]
  brackets: BracketEntry[]
  players: { uuid: string; country: string | null }[]
  qualifyCount?: number
}

export async function getEventContext(
  kind: EventKind,
  season: number,
  prefix: string,
  qualifyCount?: number,
): Promise<EventContext | null> {
  const [eventData, playersData] = await Promise.all([
    getR2Object<StoredEvent>(`${prefix}.event.json`),
    getR2Object<EventPlayer[]>(`${prefix}.players.json`),
  ])

  if (!eventData) {
    const defaultPlayers = await getR2Object<EventPlayer[]>(`${prefix}.players.default.json`)
    if (!defaultPlayers) return null
    return {
      kind,
      season,
      players: defaultPlayers,
      brackets: defaultPlayers.map((p, i) => ({
        uuid: p.uuid,
        ranks: [i + 1],
        completions: [],
        point: 0,
        bonus: 0,
        eliminated: false,
      })),
      matches: [],
      currentRound: 1,
      qualifyCount,
    }
  }

  return {
    kind,
    season,
    players: playersData ?? [],
    brackets: eventData.brackets,
    matches: eventData.matches,
    currentRound: eventData.currentRound,
    qualifyCount: eventData.qualifyCount ?? qualifyCount,
  }
}
