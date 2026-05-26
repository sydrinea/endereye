import { describe, it, expect, beforeAll } from 'vitest'
import {
  runBatchSimulation,
  derivePlayerScenarios,
  runScenarioAnalysis,
  toSimPlayer,
  EMPTY_PLAYER,
} from '../lib/core/simulation'
import type {
  SimPlayer,
  SharedRecord,
  SurvivalScenario,
  PlacementConstraint,
} from '../lib/core/simulation'
import type { EliminationCut } from '../lib/core/config'

// Inline the score formula (mirrors private getAvailableScores in simulation.ts)
function seedScores(n: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    const p = i + 1
    return Math.round((24 * (n - p + 1)) / n)
  })
}

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
      avgTimeMs: 420_000,
      wins: 10,
      losses: 10,
      playedMatches: 20,
      ...overrides,
    },
    point,
  )
}

// ── helpers for exact permutation enumeration ────────────────────────────────

function allPerms(arr: string[]): string[][] {
  if (arr.length <= 1) return [arr]
  return arr.flatMap((v, i) =>
    allPerms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [v, ...p]),
  )
}

function constraintsMet(perm: string[], constraints: PlacementConstraint[]): boolean {
  return constraints.every((c) => {
    const place = perm.indexOf(c.uuid) + 1 // 1-based
    if (place === 0) return false
    return c.maxPlace !== undefined ? place <= c.maxPlace : place >= c.minPlace
  })
}

// Mirrors applyElimination: keep all players >= threshold (keepTop-th highest score)
function exactStats(
  completers: string[],
  target: string,
  startPts: Record<string, number>,
  scores: number[],
  keepTop: number,
  constraints?: PlacementConstraint[],
): { survivalRate: number; frequency: number; conditionalFrequency: number } {
  const perms = allPerms(completers)
  const matching = constraints ? perms.filter((p) => constraintsMet(p, constraints)) : perms

  function survives(perm: string[]): boolean {
    const pts: Record<string, number> = { ...startPts }
    perm.forEach((name, i) => {
      pts[name] = (pts[name] ?? 0) + (scores[i] ?? 0)
    })
    const sorted = Object.values(pts).sort((a, b) => b - a)
    const threshold = sorted[Math.min(keepTop - 1, sorted.length - 1)]
    return (pts[target] ?? 0) >= threshold
  }

  const survived = matching.filter(survives).length
  const totalSurvived = perms.filter(survives).length
  // P(constraint | survived) = (survived with constraint) / (all survived)
  const conditionalFrequency = totalSurvived > 0 ? survived / totalSurvived : 0
  return {
    survivalRate: matching.length > 0 ? survived / matching.length : 0,
    frequency: matching.length / perms.length,
    conditionalFrequency,
  }
}

// ── shared config ────────────────────────────────────────────────────────────

const CUT: EliminationCut[] = [{ afterSeed: 1, keepTop: 3 }]
const ROUND = 1
const QUALIFY = 3
const POINTS = [50, 48, 40, 35, 30, 30]

function makeLobby(identical: boolean): SimPlayer[] {
  return POINTS.map((pt, i) => {
    const id = `p${i}`
    return identical
      ? makePlayer(id, pt, { avgTimeMs: 300_000 })
      : makePlayer(id, pt, {
          eloRate: 1500 + i * 50,
          bestTimeMs: 290_000 + i * 10_000,
          avgTimeMs: 400_000 + i * 15_000,
        })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Block 1: scenario invariants
// ─────────────────────────────────────────────────────────────────────────────

describe('scenario invariants', { timeout: 120_000 }, () => {
  let players: SimPlayer[]
  let records: SharedRecord[]
  // Precompute per-player results once to avoid per-test derivation overhead
  let survivalResults: Map<string, { scenarios: SurvivalScenario[]; baseProbability: number }>
  let threatResults: Map<string, { scenarios: SurvivalScenario[]; baseProbability: number }>
  let dnfResults: Map<string, { baseProbability: number }>

  beforeAll(() => {
    players = makeLobby(false)
    records = runBatchSimulation(players, ROUND, CUT, 20_000)
    survivalResults = new Map(
      players.map((p) => [p.uuid, derivePlayerScenarios(p.uuid, records, players)]),
    )
    threatResults = new Map(
      players.map((p) => [
        p.uuid,
        derivePlayerScenarios(p.uuid, records, players, { threatMode: true }),
      ]),
    )
    dnfResults = new Map(
      players.map((p) => {
        const { baseProbability } = runScenarioAnalysis(
          p.uuid,
          players,
          ROUND,
          CUT,
          20_000,
          true,
        )
        return [p.uuid, { baseProbability }]
      }),
    )
  })

  it('all probabilities and frequencies are in [0, 1]', () => {
    for (const p of players) {
      const { scenarios, baseProbability } = survivalResults.get(p.uuid)!
      expect(baseProbability).toBeGreaterThanOrEqual(0)
      expect(baseProbability).toBeLessThanOrEqual(1)
      for (const s of scenarios) {
        expect(s.survivalProbability).toBeGreaterThanOrEqual(0)
        expect(s.survivalProbability).toBeLessThanOrEqual(1)
        expect(s.frequency).toBeGreaterThanOrEqual(0)
        expect(s.frequency).toBeLessThanOrEqual(1)
      }
    }
  })

  it('no scenario constraint references the target player', () => {
    for (const p of players) {
      const { scenarios } = survivalResults.get(p.uuid)!
      for (const s of scenarios) {
        for (const c of s.constraints) {
          expect(c.uuid).not.toBe(p.uuid)
        }
      }
    }
  })

  it('scenarios sorted descending by frequency', () => {
    for (const p of players) {
      const { scenarios: survival } = survivalResults.get(p.uuid)!
      for (let i = 1; i < survival.length; i++) {
        expect(survival[i].frequency).toBeLessThanOrEqual(survival[i - 1].frequency)
      }
      const { scenarios: threat } = threatResults.get(p.uuid)!
      for (let i = 1; i < threat.length; i++) {
        expect(threat[i].frequency).toBeLessThanOrEqual(threat[i - 1].frequency)
      }
    }
  })

  it('threat mode constraints all have maxPlace set', () => {
    for (const p of players) {
      const { scenarios } = threatResults.get(p.uuid)!
      for (const s of scenarios) {
        for (const c of s.constraints) {
          expect(c.maxPlace, `constraint on ${c.uuid} in threat scenario`).toBeDefined()
        }
      }
    }
  })

  it('survival mode constraints have only minPlace (no maxPlace)', () => {
    for (const p of players) {
      const { scenarios } = survivalResults.get(p.uuid)!
      for (const s of scenarios) {
        for (const c of s.constraints) {
          expect(
            c.maxPlace,
            `survival constraint on ${c.uuid} should not have maxPlace`,
          ).toBeUndefined()
        }
      }
    }
  })

  it('threat mode multi-constraint scenarios are jointly feasible', () => {
    for (const p of players) {
      const { scenarios } = threatResults.get(p.uuid)!
      for (const s of scenarios) {
        if (s.constraints.length < 2) continue
        const sorted = s.constraints.map((c) => c.maxPlace!).sort((a, b) => a - b)
        sorted.forEach((t, i) => {
          expect(t, `threshold ${t} at index ${i} must be >= ${i + 1}`).toBeGreaterThanOrEqual(
            i + 1,
          )
        })
      }
    }
  })

  it('DNF base probability <= overall base probability', () => {
    for (const p of players) {
      const overallP = survivalResults.get(p.uuid)!.baseProbability
      const dnfP = dnfResults.get(p.uuid)!.baseProbability
      expect(
        dnfP,
        `DNF survival (${dnfP.toFixed(3)}) should be <= overall (${overallP.toFixed(3)}) for ${p.uuid}`,
      ).toBeLessThanOrEqual(overallP + 0.02)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Block 2: exact permutation validation
// ─────────────────────────────────────────────────────────────────────────────

describe('exact permutation validation', { timeout: 120_000 }, () => {
  // Identical player stats → approximately uniform placement distribution
  let players: SimPlayer[]
  let records: SharedRecord[]
  let survivalResults: Map<string, { scenarios: SurvivalScenario[]; baseProbability: number }>
  const scores6 = seedScores(6)
  const scores5 = seedScores(5)
  const startPts: Record<string, number> = {}

  beforeAll(() => {
    players = makeLobby(true)
    players.forEach((p) => {
      startPts[p.uuid] = p.point
    })
    records = runBatchSimulation(players, ROUND, CUT, 20_000)
    survivalResults = new Map(
      players.map((p) => [p.uuid, derivePlayerScenarios(p.uuid, records, players)]),
    )
  })

  it('base survival probability matches exact enumeration within 3%', () => {
    const ids = players.map((p) => p.uuid)
    for (const p of players) {
      const { baseProbability } = survivalResults.get(p.uuid)!
      const { survivalRate } = exactStats(ids, p.uuid, startPts, scores6, QUALIFY)
      expect(
        Math.abs(baseProbability - survivalRate),
        `${p.uuid}: MC=${baseProbability.toFixed(3)} exact=${survivalRate.toFixed(3)}`,
      ).toBeLessThan(0.03)
    }
  })

  it('scenario survival probability matches exact enumeration within 5%', () => {
    const ids = players.map((p) => p.uuid)
    for (const p of players) {
      const { scenarios } = survivalResults.get(p.uuid)!
      for (const s of scenarios) {
        const { survivalRate } = exactStats(ids, p.uuid, startPts, scores6, QUALIFY, s.constraints)
        expect(
          Math.abs(s.survivalProbability - survivalRate),
          `${p.uuid} scenario: MC=${s.survivalProbability.toFixed(3)} exact=${survivalRate.toFixed(3)}`,
        ).toBeLessThan(0.05)
      }
    }
  })

  it('scenario frequency matches exact P(constraint | survived) within 3%', () => {
    const ids = players.map((p) => p.uuid)
    for (const p of players) {
      const { scenarios } = survivalResults.get(p.uuid)!
      for (const s of scenarios) {
        const { conditionalFrequency } = exactStats(ids, p.uuid, startPts, scores6, QUALIFY, s.constraints)
        expect(
          Math.abs(s.frequency - conditionalFrequency),
          `${p.uuid} freq: MC=${s.frequency.toFixed(3)} exact=${conditionalFrequency.toFixed(3)}`,
        ).toBeLessThan(0.03)
      }
    }
  })

  it('DNF base probability matches exact enumeration within 3%', () => {
    const target = players[0]
    const completers = players.filter((p) => p.uuid !== target.uuid).map((p) => p.uuid)
    const { baseProbability } = runScenarioAnalysis(
      target.uuid,
      players,
      ROUND,
      CUT,
      20_000,
      true,
    )
    const { survivalRate } = exactStats(completers, target.uuid, startPts, scores5, QUALIFY)
    expect(
      Math.abs(baseProbability - survivalRate),
      `DNF: MC=${baseProbability.toFixed(3)} exact=${survivalRate.toFixed(3)}`,
    ).toBeLessThan(0.03)
  })

  it('k=3 scenarios are achievable (exact permutation count > 0)', () => {
    const ids = players.map((p) => p.uuid)
    const perms = allPerms(ids)
    for (const p of players) {
      const { scenarios } = survivalResults.get(p.uuid)!
      const tripleScenarios = scenarios.filter((s) => s.constraints.length === 3)
      for (const s of tripleScenarios) {
        const count = perms.filter((perm) => constraintsMet(perm, s.constraints)).length
        expect(
          count,
          `k=3 scenario for ${p.uuid} should have > 0 matching permutations`,
        ).toBeGreaterThan(0)
      }
    }
  })
})
