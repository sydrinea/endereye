import { describe, it, expect } from 'vitest'
import {
  applyElimination,
  runMonteCarlo,
  toSimPlayer,
  EMPTY_PLAYER,
  getAvailableScores,
} from '../lib/core/simulation'
import type { SimPlayer } from '../lib/core/simulation'
import type { EliminationCut } from '../lib/core/config'

function makePlayer(id: string, point: number, overrides?: Partial<typeof EMPTY_PLAYER>): SimPlayer {
  return toSimPlayer(
    {
      ...EMPTY_PLAYER,
      uuid: id,
      nickname: id,
      eloRate: 1500,
      bestTimeMs: 300_000,
      avgTimeMs: 300_000,
      wins: 10,
      losses: 10,
      playedMatches: 20,
      ...overrides,
    },
    point,
  )
}

describe('runMonteCarlo with fixed placements', () => {
  const CUT: EliminationCut[] = [{ afterSeed: 8, keepTop: 6 }]
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
  const players = ids.map((id, i) => makePlayer(id, (10 - i) * 3))

  it('empty fixed map behaves like no fixed placements at all (probabilities in range, survival sums plausibly)', () => {
    const res = runMonteCarlo(players, 8, CUT, 4, { fixed: {}, iterations: 3000 })
    for (const r of Object.values(res)) {
      expect(r.winProbability).toBeGreaterThanOrEqual(0)
      expect(r.winProbability).toBeLessThanOrEqual(1)
      expect(r.survivalProbability).toBeGreaterThanOrEqual(0)
      expect(r.survivalProbability).toBeLessThanOrEqual(1)
    }
    const survivalTotal = Object.values(res).reduce((s, r) => s + r.survivalProbability, 0)
    expect(survivalTotal).toBeCloseTo(6, 0)
  })

  it('fixing every player to a place makes survival deterministic and matches applyElimination', () => {
    // Assign places by current standings order (a=1 .. j=10).
    const fixed: Record<string, number> = {}
    ids.forEach((id, i) => (fixed[id] = i + 1))

    const res = runMonteCarlo(players, 8, CUT, 4, { fixed, iterations: 500 })

    const scores = getAvailableScores(players.length)
    const projected = players.map((p, i) => ({
      ...p,
      point: p.point + scores[i],
    }))
    const survivors = new Set(applyElimination(projected, CUT[0]).map((p) => p.uuid))

    for (const id of ids) {
      expect(res[id].survivalProbability).toBe(survivors.has(id) ? 1 : 0)
    }
  })

  it('pinning a bottom player to 1st this seed raises their survival odds', () => {
    const baseline = runMonteCarlo(players, 8, CUT, 4, { iterations: 4000 })
    const boosted = runMonteCarlo(players, 8, CUT, 4, { fixed: { j: 1 }, iterations: 4000 })
    expect(boosted['j'].survivalProbability).toBeGreaterThan(baseline['j'].survivalProbability)
  })
})
