import z from 'zod'
import { BracketEntry, EventKind } from '../api/types'

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

