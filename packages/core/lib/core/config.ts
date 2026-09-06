/**
 * Tournament rules shared by every part of the engine.
 *
 * An event is played over up to 10 "seeds" (rounds). After certain seeds a
 * cut removes the bottom players. The schedule and the two helpers here are
 * the single source of truth for those rules, so the deterministic math
 * (`deterministic.ts`), the array simulation (`scoring.ts`), the typed-array
 * Monte Carlo (`monte-carlo.ts`) and the odds orchestrator (`odds.ts`) all
 * agree on where a cutline falls.
 */

/** Points awarded to first place in a seed; every lower place scores less. */
export const MAX_SCORE_PER_SEED = 24

/** Players remaining after the final cut — how many "qualify" from the event. */
export const QUALIFY_COUNT = 4

/**
 * One elimination cut. Either rule-based (computed from the alive count) or a
 * fixed target:
 * - `zero_out` — drop everyone still on 0 points.
 * - `bottom_half` — keep the top `ceil(alive / 2)`.
 * - `keepTop` — keep exactly this many.
 */
export type EliminationCut =
  | { afterSeed: number; rule: 'zero_out' }
  | { afterSeed: number; rule: 'bottom_half' }
  | { afterSeed: number; keepTop: number }

/** The cuts, in seed order. The last entry's `keepTop` is the default qualify count. */
export const ELIMINATION_SCHEDULE: EliminationCut[] = [
  { afterSeed: 3, rule: 'zero_out' },
  { afterSeed: 5, rule: 'bottom_half' },
  { afterSeed: 7, keepTop: 10 },
  { afterSeed: 8, keepTop: 8 },
  { afterSeed: 9, keepTop: 6 },
  { afterSeed: 10, keepTop: 4 },
]

/**
 * How many players a cut keeps, before clamping to how many are actually alive.
 * Rule-based cuts (`zero_out`, `bottom_half`) key off `aliveCount`; fixed cuts
 * return their `keepTop`. Every place that needs a cutline calls this so the
 * threshold can't be computed two different ways.
 */
export function getKeepCount(cut: EliminationCut, aliveCount: number): number {
  return 'rule' in cut ? Math.ceil(aliveCount / 2) : cut.keepTop
}

/**
 * Resolves the schedule for one event and the seed bookkeeping that goes with it.
 *
 * An event may set its own `qualifyCount` (e.g. a bracket that takes 6, not 4);
 * that value replaces the final cut's `keepTop`. Call this rather than reading
 * `ELIMINATION_SCHEDULE` directly so every consumer sees the same final cutline,
 * `lastSeed`, and `isOver` flag.
 *
 * @returns `qualifyCount` in effect, the `effectiveSchedule` with that value
 *   spliced in, the `lastSeed` any cut acts after, and whether the event has
 *   already played past that seed (`isOver`).
 */
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
