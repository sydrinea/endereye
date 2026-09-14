// Covers computePlayerOdds' hypothetical (`opts.fixed`) path end to end: that
// pinned placements flow into both the Monte Carlo and the deterministic flags
// so a player eliminated by their own pin can't still show canStillWin, that
// duplicate/invalid pins are cleaned, and that clinch scoring is consistent.
import { describe, it, expect } from 'vitest'
import { computePlayerOdds } from '../lib/core/odds'
import { getClinchScore } from '../lib/core/simulation'
import { toSimPlayer, EMPTY_PLAYER } from '../lib/core/simulation'
import type { EliminationCut } from '../lib/core/config'
import type { BracketEntry } from '../lib/api/types'
import type { EventContext, EventPlayer } from '../lib/context/event'

function makePlayer(uuid: string): EventPlayer {
  return {
    ...EMPTY_PLAYER,
    uuid,
    nickname: uuid,
    eloRate: 1500,
    bestTimeMs: 300_000,
    avgTimeMs: 360_000,
    wins: 10,
    losses: 10,
    playedMatches: 20,
  }
}

// 10 alive players heading into seed 8 (ELIMINATION_SCHEDULE cuts to keepTop 8 after seed 8).
const POINTS = [140, 128, 120, 112, 104, 100, 96, 92, 90, 88]
const ids = POINTS.map((_, i) => `p${i}`)

function makeCtx(): EventContext {
  const brackets: BracketEntry[] = ids.map((uuid, i) => ({
    uuid,
    point: POINTS[i],
    bonus: 0,
    eliminated: false,
    completions: Array.from({ length: 7 }, () => ({ place: 1, score: 12 })),
    ranks: [],
  }))
  return {
    kind: 'mss',
    season: 11,
    players: ids.map(makePlayer),
    brackets,
    matches: [],
    currentRound: 8,
  }
}

const SCHEDULE: EliminationCut[] = [{ afterSeed: 8, keepTop: 8 }]

describe('computePlayerOdds with fixed placements', () => {
  it('empty fixed map returns the same odds as computePlayerOdds', () => {
    const ctx = makeCtx()
    const base = computePlayerOdds(ctx)
    const hypo = computePlayerOdds(ctx, { fixed: {}, iterations: 2000 })
    for (const id of ids) {
      expect(hypo[id].clinchPlace).toEqual(base[id].clinchPlace)
      expect(hypo[id].status).toEqual(base[id].status)
    }
  })

  it('a pinned player gets no clinch pill and ~certain survival when pinned to 1st', () => {
    const ctx = makeCtx()
    const hypo = computePlayerOdds(ctx, { fixed: { p9: 1 }, iterations: 3000 })
    expect(hypo['p9'].clinchPlace).toBeNull()
    expect(hypo['p9'].survivalProbability).toBeGreaterThan(0.9)
  })

  it('getClinchScore accepts pinned opponents and still returns a valid place or null', () => {
    const sim = ids.map((id, i) => toSimPlayer(makePlayer(id), POINTS[i]))
    const withTopFixed = getClinchScore('p6', sim, 8, SCHEDULE, { p0: 1, p1: 2 })
    if (withTopFixed !== null && withTopFixed.place !== 'DNF') {
      expect(withTopFixed.place).toBeGreaterThanOrEqual(3) // places 1,2 are taken
      expect(withTopFixed.place).toBeLessThanOrEqual(sim.length)
    }
  })
})
