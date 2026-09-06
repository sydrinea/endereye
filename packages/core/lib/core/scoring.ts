/**
 * The per-seed score table and the deterministic, array-based elimination step.
 *
 * `deterministic.ts` and `context.ts` use `applyElimination` on plain
 * `SimPlayer[]`; the Monte Carlo hot loop has its own typed-array equivalent in
 * `monte-carlo.ts`. Both keep the same tie handling (see `applyElimination`).
 */
import { getKeepCount, type EliminationCut } from './config'
import type { SimPlayer } from './player-model'

/**
 * Season-phase points a player earns from their finishing rank in an MSS event,
 * used as carry-in "bonus" toward the next phase. Flat tiers: 25 / 20 / 15 / 10 / 0.
 */
export function mssPhasePoints(rank: number): number {
  if (rank <= 4) return 25
  if (rank <= 6) return 20
  if (rank <= 8) return 15
  if (rank <= 10) return 10
  return 0
}

/**
 * `SCORE_CACHE[n][p - 1]` is the score for finishing place `p` of `n`
 * completers: `round(24 * (n - p + 1) / n)`, so first place always scores 24
 * and the spacing widens as the lobby shrinks. Precomputed for every `n` up to
 * 24 because a seed is scored once per simulated round in the hot loop.
 */
const SCORE_CACHE: number[][] = Array.from({ length: 25 }, (_, n) =>
  Array.from({ length: n }, (_, i) => {
    const p = i + 1
    return p > 24 ? 0 : Math.round((24 * (n - p + 1)) / n)
  }),
)

/**
 * Score vector for a round with `aliveCount` completers, index 0 = first place.
 * Beyond 24 completers the extra trailing places all score 0.
 */
export function getAvailableScores(aliveCount: number): number[] {
  if (aliveCount <= 24) return SCORE_CACHE[aliveCount] ?? []
  return [...SCORE_CACHE[24], ...new Array(aliveCount - 24).fill(0)]
}

/**
 * Applies one cut to a player list and returns the survivors.
 *
 * `zero_out` simply drops players on 0 points. Otherwise the field is sorted by
 * points and the score of the last keeper (`sorted[keepCount - 1]`) becomes the
 * threshold: everyone `>= threshold` survives. The `>=` is deliberate — a tie
 * on the cutline keeps *all* tied players, which can leave more than
 * `keepCount` alive. The typed-array path in `monte-carlo.ts` uses the same rule.
 */
export function applyElimination(players: SimPlayer[], cut: EliminationCut): SimPlayer[] {
  if (players.length === 0) return []
  if ('rule' in cut && cut.rule === 'zero_out') return players.filter((p) => p.point > 0)

  const sorted = [...players].sort((a, b) => b.point - a.point)
  const keepCount = getKeepCount(cut, players.length)
  if (keepCount >= sorted.length) return sorted

  const threshold = sorted[keepCount - 1].point
  return sorted.filter((p) => p.point >= threshold)
}
