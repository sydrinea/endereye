import { describe, expect, it } from 'vitest'
import { computePlayerOdds, computeSurvivalScenarios } from '../lib/core/odds'
import type { EventContext } from '../lib/context/event'
import type { BracketEntry } from '../lib/api/types'
import type { EventPlayer } from '../lib/context/event'

function makePlayer(uuid: string): EventPlayer {
  return {
    uuid,
    nickname: uuid,
    country: null,
    eloRate: 1800,
    eloRank: null,
    bestTimeMs: 30000,
    avgTimeMs: 35000,
    wins: 5,
    losses: 5,
    playedMatches: 10,
    forfeits: 0,
  }
}

function makeBracket(uuid: string, point: number, eliminated = false): BracketEntry {
  return { uuid, point, bonus: 0, eliminated, ranks: [], completions: [] }
}

function makeCtx(currentRound: number, qualifyCount: number | undefined, points: number[]): EventContext {
  const uuids = points.map((_, i) => `p${i + 1}`)
  return {
    kind: 'lcq',
    season: 99,
    currentRound,
    qualifyCount,
    players: uuids.map(makePlayer),
    brackets: uuids.map((id, i) => makeBracket(id, points[i])),
    matches: [],
  }
}

describe('qualifyCount propagation', () => {
  it('qualifies exactly qualifyCount=3 players after the event', () => {
    // 6 players with distinct scores, event over (round 11)
    const ctx = makeCtx(11, 3, [200, 180, 160, 140, 120, 100])
    const odds = computePlayerOdds(ctx)
    const qualified = Object.values(odds).filter((o) => o.status === 'qualified')
    expect(qualified).toHaveLength(3)
    expect(qualified.map((o) => o.uuid).sort()).toEqual(['p1', 'p2', 'p3'])
  })

  it('qualifies exactly qualifyCount=4 players (default) after the event', () => {
    const ctx = makeCtx(11, 4, [200, 180, 160, 140, 120, 100])
    const odds = computePlayerOdds(ctx)
    const qualified = Object.values(odds).filter((o) => o.status === 'qualified')
    expect(qualified).toHaveLength(4)
    expect(qualified.map((o) => o.uuid).sort()).toEqual(['p1', 'p2', 'p3', 'p4'])
  })

  it('win probability sums to qualifyCount=3 in Monte Carlo', () => {
    // 6 players alive at seed 9, event still running — all equal points
    const ctx = makeCtx(9, 3, [100, 100, 100, 100, 100, 100])
    const odds = computePlayerOdds(ctx)
    const totalWinProb = Object.values(odds).reduce((s, o) => s + o.winProbability, 0)
    // Sum of all win probabilities should be ~qualifyCount (3 winners per simulation)
    expect(totalWinProb).toBeCloseTo(3, 0)
  })

  it('win probability sums to qualifyCount=4 (default) in Monte Carlo', () => {
    const ctx = makeCtx(9, 4, [100, 100, 100, 100, 100, 100])
    const odds = computePlayerOdds(ctx)
    const totalWinProb = Object.values(odds).reduce((s, o) => s + o.winProbability, 0)
    expect(totalWinProb).toBeCloseTo(4, 0)
  })

  it('canStillWin is false for player ranked outside qualifyCount=3 with no seeds left', () => {
    // At seed 10 (final), only top 3 should be able to win
    // p4 has 0 points, everyone else has max — cannot win
    const ctx = makeCtx(10, 3, [240, 220, 200, 0, 0, 0])
    const odds = computePlayerOdds(ctx)
    expect(odds['p4'].canStillWin).toBe(false)
    expect(odds['p5'].canStillWin).toBe(false)
    expect(odds['p6'].canStillWin).toBe(false)
  })
})

describe('computeSurvivalScenarios', () => {
  it('returns empty array when event is over', () => {
    const ctx = makeCtx(11, 4, [200, 180, 160, 140, 120, 100])
    expect(computeSurvivalScenarios(ctx, 'p6')).toHaveLength(0)
  })

  it('returns empty array for eliminated player', () => {
    const uuids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']
    const ctx: EventContext = {
      kind: 'lcq', season: 99, currentRound: 9, qualifyCount: 4,
      players: uuids.map(makePlayer),
      brackets: uuids.map((id, i) => ({
        ...makeBracket(id, [200, 180, 160, 140, 120, 100][i]),
        eliminated: id === 'p6',
      })),
      matches: [],
    }
    expect(computeSurvivalScenarios(ctx, 'p6')).toHaveLength(0)
  })

  it('returns scenarios sorted by descending survivalProbability', () => {
    const ctx = makeCtx(9, 4, [140, 135, 130, 125, 120, 100])
    const scenarios = computeSurvivalScenarios(ctx, 'p6')
    for (let i = 1; i < scenarios.length; i++) {
      expect(scenarios[i].survivalProbability).toBeLessThanOrEqual(scenarios[i - 1].survivalProbability)
    }
  })

  it('all scenario probabilities and frequencies are in [0, 1]', () => {
    const ctx = makeCtx(9, 4, [140, 135, 130, 125, 120, 100])
    const scenarios = computeSurvivalScenarios(ctx, 'p6')
    for (const s of scenarios) {
      expect(s.survivalProbability).toBeGreaterThanOrEqual(0)
      expect(s.survivalProbability).toBeLessThanOrEqual(1)
      expect(s.frequency).toBeGreaterThan(0)
      expect(s.frequency).toBeLessThanOrEqual(1)
    }
  })

  it('constraints only reference players other than the target', () => {
    const ctx = makeCtx(9, 4, [140, 135, 130, 125, 120, 100])
    const scenarios = computeSurvivalScenarios(ctx, 'p6')
    for (const s of scenarios) {
      for (const c of s.constraints) {
        expect(c.uuid).not.toBe('p6')
      }
    }
  })
})
