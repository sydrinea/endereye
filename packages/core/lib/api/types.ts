/**
 * Zod schemas and inferred types for the MCSR Ranked API responses.
 *
 * These describe the wire format exactly, quirks included (the API spells it
 * "loses", not "losses"). `fetch.ts` parses raw JSON through these; the rest of
 * the engine consumes the inferred types. The internal domain model
 * (`EventContext`, `EventPlayer`) lives in `context/event.ts`, not here.
 */
import z from 'zod'

const TimelineEventSchema = z.object({
  uuid: z.string(),
  time: z.number(),
  type: z.string(),
})

/** Shared identity block that appears inside matches, spectators, and leaderboards. */
export const UserProfileSchema = z.object({
  uuid: z.string(),
  nickname: z.string(),
  roleType: z.number(),
  eloRate: z.number().nullable(),
  eloRank: z.number().nullable(),
  country: z.string().nullable(),
})

/** Season-phase standings. `predPhasePoint` is the projected end-of-phase total; `seasonResult.phasePoint` the current one. */
export const PhaseLeaderboardSchema = z.object({
  phase: z.object({
    endsAt: z.number().nullable(),
    number: z.number().nullable(),
    season: z.number(),
  }),
  users: z.array(
    UserProfileSchema.and(
      z.object({
        predPhasePoint: z.number(),
        seasonResult: z.object({
          eloRate: z.number(),
          eloRank: z.number().nullable(),
          phasePoint: z.number(),
        }),
      }),
    ),
  ),
})

export type PhaseLeaderboard = z.infer<typeof PhaseLeaderboardSchema>

/**
 * One ranked match. For event seeds, `completions` is the ordered list of
 * players who finished (index 0 = fastest) and is what `events/build.ts` scores
 * from; `result` is the winner of a 1v1 and is not used for events.
 */
export const MatchSchema = z.object({
  id: z.number(),
  date: z.number().nullable(),
  players: z.array(UserProfileSchema),
  result: z
    .object({
      uuid: z.string().nullable(),
      time: z.number(),
    })
    .nullable(),
  completions: z.array(z.object({ uuid: z.string(), time: z.number() })).optional(),
  spectators: z.array(UserProfileSchema),
  forfeited: z.boolean(),
  decayed: z.boolean(),
  botSource: z.union([z.string(), z.number()]).nullable(),
  tag: z.string().optional().nullable(),
  seedType: z.union([z.string(), z.number()]).optional().nullable(),
  timelines: z.array(TimelineEventSchema).optional(),
})

export const MatchListSchema = z.array(MatchSchema)

export type Match = z.infer<typeof MatchSchema>

export type MatchList = z.infer<typeof MatchListSchema>

export interface MatchFilter {
  before?: number
  after?: number
  count?: number
  type?: number
  season?: number
}

const StatsBucketSchema = z.object({
  ranked: z.number().nullable(),
  casual: z.number().nullable(),
})

const PhaseResultSchema = z.object({
  eloRate: z.number().nullable(),
  eloRank: z.number().nullable(),
  phasePoint: z.number().nullable(),
})

const PhaseEntrySchema = z.object({
  phase: z.number(),
  eloRate: z.number().nullable(),
  eloRank: z.number().nullable(),
  point: z.number().nullable(),
})

const SeasonResultSchema = z.object({
  last: PhaseResultSchema,
  phases: z.array(PhaseEntrySchema),
})

/**
 * A user's ranked stats. `seasonResult.phases[i]` holds per-phase Elo/points;
 * `enrichEventPlayers` indexes it by event kind and falls back to `last`.
 */
export const UserSchema = z.object({
  uuid: z.string(),
  nickname: z.string(),
  eloRate: z.number().nullable(),
  eloRank: z.number().nullable(),
  country: z.string().nullable(),
  statistics: z.object({
    season: z.object({
      wins: StatsBucketSchema,
      loses: StatsBucketSchema, // API spells it "loses"
      completions: StatsBucketSchema,
      completionTime: StatsBucketSchema,
      bestTime: StatsBucketSchema,
      forfeits: StatsBucketSchema,
      playedMatches: StatsBucketSchema,
    }),
  }),
  seasonResult: SeasonResultSchema.nullable(),
})

export type User = z.infer<typeof UserSchema>

const PlayerSchema = z.object({
  uuid: z.string(),
  country: z.string().nullable(),
})

/**
 * One player's progress through an event. `completions[s]` is their result in
 * seed `s+1` (`null` = didn't complete / already eliminated); `point` is the
 * running total including `bonus` (season carry-in); `ranks` is the standings
 * position after each seed.
 */
const BracketEntrySchema = z.object({
  ranks: z.array(z.number()), // ranks[i] = leaderboard position after seed i+1
  uuid: z.string(),
  completions: z.array(z.union([z.object({ place: z.number(), score: z.number() }), z.null()])),
  point: z.number(),
  bonus: z.number(),
  eliminated: z.boolean(),
})

export type BracketEntry = z.infer<typeof BracketEntrySchema>

/** A fully-built event: current seed, source match ids, per-player brackets, and the field. */
export const EventSchema = z.object({
  currentRound: z.number(),
  matches: z.array(z.number()),
  brackets: z.array(BracketEntrySchema),
  players: z.array(PlayerSchema),
})

export type Event = z.infer<typeof EventSchema>

/** Event type: last-chance qualifier, championship, or mid-season showdown. Selects the phase index in `enrichEventPlayers`. */
export type EventKind = 'lcq' | 'worlds' | 'mss'

export const LeaderboardSchema = z.object({
  season: z.object({
    startsAt: z.number(),
    endsAt: z.number(),
    number: z.number(),
  }),
})

export type Leaderboard = z.infer<typeof LeaderboardSchema>
