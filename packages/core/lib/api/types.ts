import z from 'zod'

const TimelineEventSchema = z.object({
  uuid: z.string(),
  time: z.number(),
  type: z.string(),
})

export const UserProfileSchema = z.object({
  uuid: z.string(),
  nickname: z.string(),
  roleType: z.number(),
  eloRate: z.number().nullable(),
  eloRank: z.number().nullable(),
  country: z.string().nullable(),
})

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

const BracketEntrySchema = z.object({
  ranks: z.array(z.number()), // ranks[i] = leaderboard position after seed i+1
  uuid: z.string(),
  completions: z.array(z.union([z.object({ place: z.number(), score: z.number() }), z.null()])),
  point: z.number(),
  bonus: z.number(),
  eliminated: z.boolean(),
})

export type BracketEntry = z.infer<typeof BracketEntrySchema>

export const EventSchema = z.object({
  currentRound: z.number(),
  matches: z.array(z.number()),
  brackets: z.array(BracketEntrySchema),
  players: z.array(PlayerSchema),
})

export type Event = z.infer<typeof EventSchema>

export type EventKind = 'lcq' | 'mss'
