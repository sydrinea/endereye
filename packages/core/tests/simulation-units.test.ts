import { describe, it, expect } from 'vitest'
import {
  getAvailableScores,
  applyElimination,
  calculateLobbyStats,
  getPlayerPower,
  getPlayerVariance,
  getDNFProbability,
  toSimPlayer,
  EMPTY_PLAYER,
  runMonteCarlo,
  runFullHeatmapSimulation,
  simulateRound,
} from '../lib/core/simulation'
import type { SimPlayer } from '../lib/core/simulation'
import type { EliminationCut } from '../lib/core/config'

function makePlayer(
  id: string,
  point: number,
  overrides?: Partial<typeof EMPTY_PLAYER>,
): SimPlayer {
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

describe('getAvailableScores', () => {
  it('returns aliveCount scores', () => {
    expect(getAvailableScores(6)).toHaveLength(6)
    expect(getAvailableScores(1)).toHaveLength(1)
  })

  it('first place gets 24 points regardless of lobby size', () => {
    for (const n of [1, 6, 10, 24, 25]) {
      expect(getAvailableScores(n)[0]).toBe(24)
    }
  })

  it('scores are non-increasing', () => {
    for (const n of [3, 6, 10, 24, 25]) {
      const scores = getAvailableScores(n)
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeLessThanOrEqual(scores[i - 1])
      }
    }
  })

  it('players beyond rank 24 get 0 points', () => {
    const scores = getAvailableScores(25)
    expect(scores[24]).toBe(0)
  })

  it('6-player scores match formula', () => {
    // round(24 * (6 - place + 1) / 6) for places 1..6
    expect(getAvailableScores(6)).toEqual([24, 20, 16, 12, 8, 4])
  })
})

describe('applyElimination', () => {
  const players = [
    makePlayer('a', 50),
    makePlayer('b', 40),
    makePlayer('c', 30),
    makePlayer('d', 20),
    makePlayer('e', 10),
  ]

  it('keepTop=3 returns exactly 3 players', () => {
    const cut: EliminationCut = { afterSeed: 1, keepTop: 3 }
    expect(applyElimination(players, cut)).toHaveLength(3)
  })

  it('keepTop=3 keeps the highest-scoring players', () => {
    const cut: EliminationCut = { afterSeed: 1, keepTop: 3 }
    const kept = applyElimination(players, cut).map((p) => p.uuid)
    expect(kept).toContain('a')
    expect(kept).toContain('b')
    expect(kept).toContain('c')
    expect(kept).not.toContain('d')
    expect(kept).not.toContain('e')
  })

  it('zero_out rule removes players with 0 points', () => {
    const withZero = [makePlayer('a', 5), makePlayer('b', 0), makePlayer('c', 3)]
    const cut: EliminationCut = { afterSeed: 1, rule: 'zero_out' }
    const kept = applyElimination(withZero, cut)
    expect(kept.map((p) => p.uuid)).not.toContain('b')
    expect(kept).toHaveLength(2)
  })

  it('ties: all tied players survive', () => {
    const tied = [
      makePlayer('a', 30),
      makePlayer('b', 30),
      makePlayer('c', 30),
      makePlayer('d', 10),
    ]
    const cut: EliminationCut = { afterSeed: 1, keepTop: 2 }
    // threshold = sorted[1].point = 30, all three 30s survive
    expect(applyElimination(tied, cut)).toHaveLength(3)
  })
})

describe('calculateLobbyStats', () => {
  it('returns DEFAULT_LOBBY_STATS for empty input', () => {
    const stats = calculateLobbyStats([])
    expect(stats.meanBest).toBe(300_000)
    expect(stats.meanGap).toBe(150_000)
  })

  it('meanBest is the average of bestTimesMs', () => {
    const players = [
      makePlayer('a', 0, { bestTimeMs: 200_000 }),
      makePlayer('b', 0, { bestTimeMs: 400_000 }),
    ]
    const stats = calculateLobbyStats(players)
    expect(stats.meanBest).toBe(300_000)
  })

  it('stdDevBest is 0 when all best times are identical', () => {
    const players = [1, 2, 3, 4].map((i) => makePlayer(`p${i}`, 0))
    const stats = calculateLobbyStats(players)
    expect(stats.stdDevBest).toBe(0)
  })

  it('meanGap is 0 when avg equals best for all players', () => {
    const players = [1, 2, 3].map((i) =>
      makePlayer(`p${i}`, 0, { bestTimeMs: 300_000, avgTimeMs: 300_000 }),
    )
    const stats = calculateLobbyStats(players)
    expect(stats.meanGap).toBe(0)
  })
})

describe('getPlayerPower', () => {
  it('returns a finite number for identical lobby stats (stdDevBest=0)', () => {
    const players = [1, 2, 3, 4].map((i) => makePlayer(`p${i}`, 0))
    const stats = calculateLobbyStats(players)
    for (const p of players) {
      const power = getPlayerPower(p, 1, stats)
      expect(Number.isFinite(power)).toBe(true)
    }
  })

  it('all identical players get equal power', () => {
    const players = [1, 2, 3, 4].map((i) => makePlayer(`p${i}`, 0))
    const stats = calculateLobbyStats(players)
    const powers = players.map((p) => getPlayerPower(p, 1, stats))
    expect(powers.every((pw) => pw === powers[0])).toBe(true)
  })

  it('higher elo → higher power', () => {
    const low = makePlayer('low', 0, { eloRate: 1500 })
    const high = makePlayer('high', 0, { eloRate: 2000 })
    const players = [low, high]
    const stats = calculateLobbyStats(players)
    expect(getPlayerPower(high, 1, stats)).toBeGreaterThan(getPlayerPower(low, 1, stats))
  })

  it('avg bonus is larger in early rounds (round ≤ 5) than late (round > 5)', () => {
    const p = makePlayer('p', 0, { bestTimeMs: 200_000, avgTimeMs: 300_000 })
    const stats = calculateLobbyStats([
      p,
      makePlayer('q', 0, { bestTimeMs: 400_000, avgTimeMs: 500_000 }),
    ])
    const earlyPower = getPlayerPower(p, 1, stats)
    const latePower = getPlayerPower(p, 9, stats)
    expect(earlyPower).toBeGreaterThan(latePower)
  })
})

describe('getDNFProbability', () => {
  it('is 0 when avg equals best (no gap)', () => {
    const p = makePlayer('p', 0, { bestTimeMs: 300_000, avgTimeMs: 300_000 })
    const players = [p]
    const stats = calculateLobbyStats(players)
    expect(getDNFProbability(p, stats)).toBe(0)
  })

  it('never exceeds 0.4', () => {
    const p = makePlayer('p', 0, { bestTimeMs: 100_000, avgTimeMs: 2_000_000 })
    const stats = calculateLobbyStats([p])
    expect(getDNFProbability(p, stats)).toBeLessThanOrEqual(0.4)
  })

  it('increases with larger gap', () => {
    const small = makePlayer('s', 0, { bestTimeMs: 300_000, avgTimeMs: 350_000 })
    const large = makePlayer('l', 0, { bestTimeMs: 300_000, avgTimeMs: 600_000 })
    const stats = calculateLobbyStats([small, large])
    expect(getDNFProbability(large, stats)).toBeGreaterThan(getDNFProbability(small, stats))
  })
})

describe('getPlayerVariance', () => {
  it('decreases as playedMatches increases (more data → less uncertainty)', () => {
    const few = makePlayer('f', 0, { playedMatches: 10 })
    const many = makePlayer('m', 0, { playedMatches: 500 })
    const stats = calculateLobbyStats([few, many])
    expect(getPlayerVariance(few, stats)).toBeGreaterThan(getPlayerVariance(many, stats))
  })

  it('increases with larger avg−best gap (erratic placer → more variance)', () => {
    const stable = makePlayer('s', 0, { bestTimeMs: 300_000, avgTimeMs: 310_000 })
    const erratic = makePlayer('e', 0, { bestTimeMs: 300_000, avgTimeMs: 600_000 })
    const stats = calculateLobbyStats([stable, erratic])
    expect(getPlayerVariance(erratic, stats)).toBeGreaterThan(getPlayerVariance(stable, stats))
  })

  it('is always positive', () => {
    const p = makePlayer('p', 0)
    const stats = calculateLobbyStats([p])
    expect(getPlayerVariance(p, stats)).toBeGreaterThan(0)
  })
})

describe('simulateRound: completer-count scoring', () => {
  it('scores are based on completers, not lobby size', () => {
    // Create one player who always DNFs and one who never does
    // The completer should receive getAvailableScores(1)[0] = 24 points
    const dnfer = makePlayer('dnf', 0, { bestTimeMs: 1, avgTimeMs: 9_999_999 })
    const completer = makePlayer('comp', 0, { bestTimeMs: 300_000, avgTimeMs: 300_000 })

    const stats = calculateLobbyStats([dnfer, completer])

    // Run 100 iterations and check completer almost always gets 24 (1-player pool)
    let got24 = 0
    for (let i = 0; i < 200; i++) {
      const result = simulateRound([dnfer, completer], 1, stats)
      const comp = result.find((p) => p.uuid === 'comp')!
      if (comp.point === 24) got24++
    }
    // DNF prob for dnfer ≈ 0.4 (capped), so completer is alone in most rounds
    // When alone, completer should get 24 (not last-place of 2-player score)
    // Last place of 2-player: round(24*1/2) = 12. So if we see 24s, scoring is by completers.
    expect(got24).toBeGreaterThan(50)
  })
})

describe('runMonteCarlo', () => {
  const CUT: EliminationCut[] = [{ afterSeed: 3, keepTop: 5 }]
  const players = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, i) => makePlayer(id, i * 5))

  it('all win probabilities are in [0, 1]', () => {
    const results = runMonteCarlo(players, 1, CUT, 3, 2000)
    for (const r of Object.values(results)) {
      expect(r.winProbability).toBeGreaterThanOrEqual(0)
      expect(r.winProbability).toBeLessThanOrEqual(1)
    }
  })

  it('win probabilities sum to approximately targetRank', () => {
    const targetRank = 3
    const results = runMonteCarlo(players, 1, CUT, targetRank, 5000)
    const total = Object.values(results).reduce((s, r) => s + r.winProbability, 0)
    expect(total).toBeCloseTo(targetRank, 0)
  })

  it('all survival probabilities are in [0, 1]', () => {
    const results = runMonteCarlo(players, 1, CUT, 3, 2000)
    for (const r of Object.values(results)) {
      expect(r.survivalProbability).toBeGreaterThanOrEqual(0)
      expect(r.survivalProbability).toBeLessThanOrEqual(1)
    }
  })

  it('when event is over, top targetRank players have winProbability=1', () => {
    const done = runMonteCarlo(players, 11, CUT, 3, 100)
    const sorted = [...players].sort((a, b) => b.point - a.point)
    for (let i = 0; i < 3; i++) {
      expect(done[sorted[i].uuid].winProbability).toBe(1)
    }
    for (let i = 3; i < players.length; i++) {
      expect(done[sorted[i].uuid].winProbability).toBe(0)
    }
  })
})

describe('runFullHeatmapSimulation', () => {
  const CUT: EliminationCut[] = [
    { afterSeed: 3, keepTop: 5 },
    { afterSeed: 7, keepTop: 3 },
  ]
  const players = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, i) => makePlayer(id, i * 5))

  it('each key is a seed or 999 (final qualify bucket)', () => {
    const result = runFullHeatmapSimulation(players, 1, CUT, 1000, 3)
    for (const counts of Object.values(result)) {
      for (const key of Object.keys(counts)) {
        const k = Number(key)
        expect([3, 7, 999]).toContain(k)
      }
    }
  })

  it('all probabilities are in [0, 1]', () => {
    const result = runFullHeatmapSimulation(players, 1, CUT, 1000, 3)
    for (const counts of Object.values(result)) {
      for (const prob of Object.values(counts)) {
        expect(prob).toBeGreaterThanOrEqual(0)
        expect(prob).toBeLessThanOrEqual(1)
      }
    }
  })

  it('final qualify probabilities sum to approximately qualifyCount', () => {
    const qualifyCount = 3
    const result = runFullHeatmapSimulation(players, 1, CUT, 5000, qualifyCount)
    const total = Object.values(result).reduce((s, counts) => s + (counts[999] ?? 0), 0)
    expect(total).toBeCloseTo(qualifyCount, 0)
  })
})
