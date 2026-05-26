import type { EliminationCut } from './config'
import type { SimPlayer } from './player-model'

export function getAvailableScores(aliveCount: number): number[] {
  const N = Math.min(aliveCount, 24)
  return Array.from({ length: aliveCount }, (_, i) => {
    const p = i + 1
    return p > 24 ? 0 : Math.round((24 * (N - p + 1)) / N)
  })
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
