import type { EliminationCut } from './config'
import type { SimPlayer } from './player-model'

export function mssPhasePoints(rank: number): number {
  if (rank <= 4) return 25
  if (rank <= 6) return 20
  if (rank <= 8) return 15
  if (rank <= 10) return 10
  return 0
}

const SCORE_CACHE: number[][] = Array.from({ length: 25 }, (_, n) =>
  Array.from({ length: n }, (_, i) => {
    const p = i + 1
    return p > 24 ? 0 : Math.round((24 * (n - p + 1)) / n)
  }),
)

export function getAvailableScores(aliveCount: number): number[] {
  if (aliveCount <= 24) return SCORE_CACHE[aliveCount] ?? []
  // Beyond 24 players the trailing positions score 0
  return [...SCORE_CACHE[24], ...new Array(aliveCount - 24).fill(0)]
}

export function applyElimination(players: SimPlayer[], cut: EliminationCut): SimPlayer[] {
  if (players.length === 0) return []
  if ('rule' in cut && cut.rule === 'zero_out') return players.filter((p) => p.point > 0)

  const sorted = [...players].sort((a, b) => b.point - a.point)
  const keepCount = 'rule' in cut ? Math.ceil(players.length / 2) : cut.keepTop
  if (keepCount >= sorted.length) return sorted

  const threshold = sorted[keepCount - 1].point
  return sorted.filter((p) => p.point >= threshold)
}
