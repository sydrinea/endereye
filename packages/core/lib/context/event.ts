import z from 'zod'
import { fetchEvent } from '../api/fetch'
import { BracketEntry, EventKind } from '../api/types'
import { enrichEventPlayers as enrichUsers } from '../players'

export const EventPlayerSchema = z.object({
  uuid: z.string(),
  nickname: z.string(),
  country: z.string().nullable(),
  eloRate: z.number().nullable(),
  eloRank: z.number().nullable(),
  bestTimeMs: z.number(),
  avgTimeMs: z.number(),
  wins: z.number(),
  losses: z.number(),
  playedMatches: z.number(),
  forfeits: z.number(),
})

export type EventPlayer = z.infer<typeof EventPlayerSchema>

export interface EventContext {
  readonly kind: EventKind
  readonly season: number
  readonly players: EventPlayer[]
  readonly brackets: BracketEntry[]
  readonly matches: number[]
  readonly currentRound: number
  readonly qualifyCount?: number
}

export async function createEventContext(kind: EventKind, season: number): Promise<EventContext> {
  const raw = await fetchEvent(kind, season)
  const players = await enrichUsers(raw, kind, season)
  return {
    kind,
    season,
    players,
    brackets: raw.brackets,
    matches: raw.matches,
    currentRound: raw.currentRound,
  }
}
