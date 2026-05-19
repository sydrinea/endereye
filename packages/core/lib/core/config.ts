export const TOTAL_SEEDS = 10
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
