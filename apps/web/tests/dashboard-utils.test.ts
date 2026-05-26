import { describe, it, expect } from 'vitest'
import {
  mssPhasePoints,
  survivalPct,
  computeCutKeep,
  mapStatus,
  mapPill,
  toRowData,
} from '../lib/dashboard-utils'
import type { PlayerView } from '@endereye/core'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    uuid: 'test-uuid',
    nickname: 'TestPlayer',
    country: null,
    eloRate: 1500,
    eloRank: null,
    bestTimeMs: 300_000,
    avgTimeMs: 420_000,
    wins: 10,
    losses: 10,
    playedMatches: 20,
    forfeits: 0,
    point: 50,
    bonus: 0,
    eliminated: false,
    completions: [],
    ranks: [],
    rank: 1,
    prevRank: null,
    winProbability: 0.5,
    survivalProbability: 0.5,
    clinchPlace: null,
    cutDelta: 5,
    status: 'danger',
    ...overrides,
  } as PlayerView
}

// ── mssPhasePoints ────────────────────────────────────────────────────────────

describe('mssPhasePoints', () => {
  it('rank 1 → 25', () => expect(mssPhasePoints(1)).toBe(25))
  it('rank 4 → 25', () => expect(mssPhasePoints(4)).toBe(25))
  it('rank 5 → 20', () => expect(mssPhasePoints(5)).toBe(20))
  it('rank 6 → 20', () => expect(mssPhasePoints(6)).toBe(20))
  it('rank 7 → 15', () => expect(mssPhasePoints(7)).toBe(15))
  it('rank 8 → 15', () => expect(mssPhasePoints(8)).toBe(15))
  it('rank 9 → 10', () => expect(mssPhasePoints(9)).toBe(10))
  it('rank 10 → 10', () => expect(mssPhasePoints(10)).toBe(10))
  it('rank 11 → 0', () => expect(mssPhasePoints(11)).toBe(0))
  it('rank 100 → 0', () => expect(mssPhasePoints(100)).toBe(0))
})

// ── survivalPct ───────────────────────────────────────────────────────────────

describe('survivalPct', () => {
  it('0 → 0', () => expect(survivalPct(0)).toBe(0))
  it('1 → 100', () => expect(survivalPct(1)).toBe(100))
  it('0.5 → 50', () => expect(survivalPct(0.5)).toBe(50))
  it('0.505 → 51 (rounds half up)', () => expect(survivalPct(0.505)).toBe(51))
  it('0.334 → 33', () => expect(survivalPct(0.334)).toBe(33))
  it('0.999 → 100', () => expect(survivalPct(0.999)).toBe(100))
})

// ── computeCutKeep ────────────────────────────────────────────────────────────

describe('computeCutKeep', () => {
  it('seed 0 → nextCut=3 → undefined (zero_out rule, no keepTop)', () => {
    expect(computeCutKeep(0, 20, 4)).toBeUndefined()
  })

  it('seed 3 → nextCut=5 → half of players', () => {
    expect(computeCutKeep(3, 20, 4)).toBe(10)
    expect(computeCutKeep(3, 21, 4)).toBe(11) // Math.ceil
  })

  it('seed 5 → nextCut=7 → 10', () => {
    expect(computeCutKeep(5, 20, 4)).toBe(10)
  })

  it('seed 7 → nextCut=8 → 8', () => {
    expect(computeCutKeep(7, 20, 4)).toBe(8)
  })

  it('seed 8 → nextCut=9 → 6', () => {
    expect(computeCutKeep(8, 20, 4)).toBe(6)
  })

  it('seed 9 → nextCut=10 → qualifyCount', () => {
    expect(computeCutKeep(9, 20, 4)).toBe(4)
    expect(computeCutKeep(9, 20, 6)).toBe(6)
  })

  it('seed 10 → no next cut → undefined', () => {
    expect(computeCutKeep(10, 20, 4)).toBeUndefined()
  })
})

// ── mapStatus ─────────────────────────────────────────────────────────────────

describe('mapStatus', () => {
  it('qualified → "qualified"', () => {
    expect(mapStatus(makeView({ status: 'qualified' }))).toBe('qualified')
  })

  it('eliminated → "out"', () => {
    expect(mapStatus(makeView({ status: 'eliminated' }))).toBe('out')
  })

  it('safe → "safe"', () => {
    expect(mapStatus(makeView({ status: 'safe' }))).toBe('safe')
  })

  it('danger with p=0.80 → "near-safe"', () => {
    expect(mapStatus(makeView({ status: 'danger', survivalProbability: 0.8 }))).toBe('near-safe')
  })

  it('danger with p=0.75 → "near-safe" (boundary)', () => {
    expect(mapStatus(makeView({ status: 'danger', survivalProbability: 0.75 }))).toBe('near-safe')
  })

  it('danger with p=0.60 → "coin-flip"', () => {
    expect(mapStatus(makeView({ status: 'danger', survivalProbability: 0.6 }))).toBe('coin-flip')
  })

  it('danger with p=0.45 → "coin-flip" (boundary)', () => {
    expect(mapStatus(makeView({ status: 'danger', survivalProbability: 0.45 }))).toBe('coin-flip')
  })

  it('danger with p=0.30 → "at-risk"', () => {
    expect(mapStatus(makeView({ status: 'danger', survivalProbability: 0.3 }))).toBe('at-risk')
  })

  it('danger with p=0.15 → "at-risk" (boundary)', () => {
    expect(mapStatus(makeView({ status: 'danger', survivalProbability: 0.15 }))).toBe('at-risk')
  })

  it('danger with p=0.10 → "must-clutch"', () => {
    expect(mapStatus(makeView({ status: 'danger', survivalProbability: 0.1 }))).toBe('must-clutch')
  })
})

// ── mapPill ───────────────────────────────────────────────────────────────────

describe('mapPill', () => {
  it('qualified → undefined', () => {
    expect(mapPill(makeView({ status: 'qualified' }))).toBeUndefined()
  })

  it('eliminated → undefined', () => {
    expect(mapPill(makeView({ status: 'eliminated' }))).toBeUndefined()
  })

  it('clinchPlace=2 → needs pill with rank 2', () => {
    const pill = mapPill(makeView({ status: 'danger', clinchPlace: 2, cutDelta: 5 }))
    expect(pill).toEqual({ type: 'needs', rank: 2 })
  })

  it('clinchPlace=DNF → no needs pill (falls through to cutDelta check)', () => {
    const pill = mapPill(makeView({ status: 'danger', clinchPlace: 'DNF', cutDelta: -3 }))
    expect(pill).toEqual({ type: 'to-cut', deficit: 3 })
  })

  it('clinchPlace=null with cutDelta=-5 → to-cut pill', () => {
    const pill = mapPill(makeView({ status: 'danger', clinchPlace: null, cutDelta: -5 }))
    expect(pill).toEqual({ type: 'to-cut', deficit: 5 })
  })

  it('clinchPlace=null with cutDelta=0 → undefined', () => {
    expect(mapPill(makeView({ status: 'danger', clinchPlace: null, cutDelta: 0 }))).toBeUndefined()
  })

  it('clinchPlace=null with cutDelta=3 (above cut) → undefined', () => {
    expect(mapPill(makeView({ status: 'danger', clinchPlace: null, cutDelta: 3 }))).toBeUndefined()
  })
})

// ── toRowData ─────────────────────────────────────────────────────────────────

describe('toRowData', () => {
  it('rank delta is null when prevRank is null', () => {
    const row = toRowData(makeView({ rank: 3, prevRank: null }))
    expect(row.delta).toBeNull()
  })

  it('rank delta is null when rank equals prevRank', () => {
    const row = toRowData(makeView({ rank: 3, prevRank: 3 }))
    expect(row.delta).toBeNull()
  })

  it('rank delta is positive when player improved (moved up)', () => {
    // prevRank=5, rank=3 → delta = 5 - 3 = +2
    const row = toRowData(makeView({ rank: 3, prevRank: 5 }))
    expect(row.delta).toBe(2)
  })

  it('rank delta is negative when player dropped', () => {
    // prevRank=2, rank=5 → delta = 2 - 5 = -3
    const row = toRowData(makeView({ rank: 5, prevRank: 2 }))
    expect(row.delta).toBe(-3)
  })

  it('survivalPct is Math.round(survivalProbability * 100)', () => {
    const row = toRowData(makeView({ survivalProbability: 0.734 }))
    expect(row.survivalPct).toBe(73)
  })

  it('pts maps from view.point', () => {
    const row = toRowData(makeView({ point: 42 }))
    expect(row.pts).toBe(42)
  })

  it('overrides is undefined when overrideMap has no entry for this uuid', () => {
    const row = toRowData(makeView({ uuid: 'abc' }), { xyz: { 0: { original: 5, override: 10 } } })
    expect(row.overrides).toBeUndefined()
  })

  it('overrides are mapped with seed = seedIndex + 1', () => {
    const row = toRowData(makeView({ uuid: 'abc' }), {
      abc: { 2: { original: 5, override: 10 } },
    })
    expect(row.overrides).toEqual([{ seed: 3, original: 5, override: 10 }])
  })

  it('qualifiedLabel is forwarded', () => {
    const row = toRowData(makeView(), undefined, '25 Phase Points')
    expect(row.qualifiedLabel).toBe('25 Phase Points')
  })

  it('qualifiedLabel is undefined when not provided', () => {
    const row = toRowData(makeView())
    expect(row.qualifiedLabel).toBeUndefined()
  })
})
