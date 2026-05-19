import z from 'zod'

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
  rank: z.number(),
  prevRank: z.number(),
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
