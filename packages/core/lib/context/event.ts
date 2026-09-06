/**
 * The internal domain model — the boundary object between data-building and the
 * engine. `events/build.ts` + `players.ts` produce an `EventContext`; `core/*`
 * consumes it and never touches the raw API types or `api/fetch`.
 *
 * Pure types and schemas, no logic.
 */
import z from 'zod'
import { BracketEntry, EventKind } from '../api/types'

/**
 * A player as the simulation needs them: identity, season Elo (`eloRate`), and
 * the ranked timing / W–L stats that feed the player model. Hydrated from the
 * API by `enrichEventPlayers`.
 */
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

/** A manually corrected seed score: what the data said vs. what it should be. */
export interface OverrideInfo {
  original: number
  override: number
}

/** Resolved overrides: uuid → 0-based seed index → { original, override }. */
export type OverrideMap = Record<string, Record<number, OverrideInfo>>

/** Storage form of overrides (JSON keys are strings): uuid → seed index string → replacement score. */
export type RawOverrides = Record<string, Record<string, number>>

/**
 * Everything the engine needs about one event. `currentRound` is the seed
 * about to be / being played (1-based); `qualifyCount` overrides the schedule
 * default; `overrides` are applied when the brackets are built, not here.
 */
export interface EventContext {
  readonly kind: EventKind
  readonly season: number
  readonly players: EventPlayer[]
  readonly brackets: BracketEntry[]
  readonly matches: number[]
  readonly currentRound: number
  readonly qualifyCount?: number
  readonly overrides?: OverrideMap
}

