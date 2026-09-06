export const MAX_SCORE_PER_SEED = 24
export const QUALIFY_COUNT = 4

export type EliminationCut =
  | { afterSeed: number; rule: 'zero_out' }
  | { afterSeed: number; rule: 'bottom_half' }
  | { afterSeed: number; keepTop: number }

export const ELIMINATION_SCHEDULE: EliminationCut[] = [
  { afterSeed: 3, rule: 'zero_out' },
  { afterSeed: 5, rule: 'bottom_half' },
  { afterSeed: 7, keepTop: 10 },
  { afterSeed: 8, keepTop: 8 },
  { afterSeed: 9, keepTop: 6 },
  { afterSeed: 10, keepTop: 4 },
]

// How many players a cut keeps, before clamping to how many are actually
// alive. Shared by scoring.ts's applyElimination and odds.ts's getCutThreshold
// so the two can't silently disagree about where the cutline falls.
export function getKeepCount(cut: EliminationCut, aliveCount: number): number {
  return 'rule' in cut ? Math.ceil(aliveCount / 2) : cut.keepTop
}

// Splices an event's own qualifyCount (falling back to QUALIFY_COUNT) into the
// final cut's keepTop, and derives the last-seed/isOver flags that go with it.
// Was previously copy-pasted at 7+ call sites across odds.ts/context.ts,
// each of which could (and once did) drift from the others.
export function getEffectiveSchedule(ctx: {
  currentRound: number
  qualifyCount?: number
}): {
  qualifyCount: number
  effectiveSchedule: EliminationCut[]
  lastSeed: number
  isOver: boolean
} {
  const qualifyCount = ctx.qualifyCount ?? QUALIFY_COUNT
  const baseLast = ELIMINATION_SCHEDULE[ELIMINATION_SCHEDULE.length - 1]
  const effectiveSchedule = ELIMINATION_SCHEDULE.map((cut) =>
    cut === baseLast && 'keepTop' in cut ? { ...cut, keepTop: qualifyCount } : cut,
  )
  const lastSeed = Math.max(...effectiveSchedule.map((c) => c.afterSeed))
  const isOver = ctx.currentRound > lastSeed
  return { qualifyCount, effectiveSchedule, lastSeed, isOver }
}
