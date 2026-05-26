import { describe, it, expect } from 'vitest'
import { calculatePoints, computeHistoricalData } from '../lib/core/context'
import { computePlayerOdds } from '../lib/core/odds'
import type { BracketEntry } from '../lib/api/types'
import type { EventContext, EventPlayer } from '../lib/context/event'

function makePlayer(uuid: string): EventPlayer {
  return {
    uuid,
    nickname: uuid,
    country: null,
    eloRate: 1500,
    eloRank: null,
    bestTimeMs: 300_000,
    avgTimeMs: 420_000,
    wins: 10,
    losses: 10,
    playedMatches: 20,
    forfeits: 0,
  }
}

function makeBracket(
  uuid: string,
  completions: (null | { place: number; score: number })[],
  opts: { bonus?: number; eliminated?: boolean } = {},
): BracketEntry {
  const scores = completions.map((c) => c?.score ?? 0)
  const point = scores.reduce((a, b) => a + b, 0) + (opts.bonus ?? 0)
  return {
    uuid,
    point,
    bonus: opts.bonus ?? 0,
    eliminated: opts.eliminated ?? false,
    completions,
    ranks: completions.map((_, i) => i + 1),
  }
}

function makeEvent(brackets: BracketEntry[], currentRound = 1): EventContext {
  return {
    kind: 'lcq',
    season: 10,
    players: brackets.map((b) => makePlayer(b.uuid)),
    brackets,
    matches: [],
    currentRound,
  }
}

describe('calculatePoints', () => {
  it('sums completions up to viewSeed (0-indexed)', () => {
    const b = makeBracket('a', [
      { place: 1, score: 24 },
      { place: 2, score: 20 },
      { place: 3, score: 16 },
    ])
    expect(calculatePoints(b, 1)).toBe(24)
    expect(calculatePoints(b, 2)).toBe(44)
    expect(calculatePoints(b, 3)).toBe(60)
  })

  it('treats null completions as 0', () => {
    const b = makeBracket('a', [{ place: 1, score: 24 }, null, { place: 1, score: 24 }])
    expect(calculatePoints(b, 2)).toBe(24) // seed 2 is null → 0
    expect(calculatePoints(b, 3)).toBe(48)
  })

  it('includes bonus in total', () => {
    const b = makeBracket('a', [{ place: 1, score: 24 }], { bonus: 10 })
    expect(calculatePoints(b, 1)).toBe(34)
  })

  it('does not include seeds beyond viewSeed', () => {
    const b = makeBracket('a', [
      { place: 1, score: 24 },
      { place: 1, score: 24 },
    ])
    // viewSeed=1 → only first completion counts
    expect(calculatePoints(b, 1)).toBe(24)
  })
})

// ── computePlayerOdds: eliminated player ─────────────────────────────────────

describe('computePlayerOdds: eliminated player', () => {
  it('eliminated player has status=eliminated, winProbability=0, survivalProbability=0, clinchPlace=null', () => {
    const brackets = [
      makeBracket('alive', [{ place: 1, score: 24 }]),
      makeBracket('dead', [null], { eliminated: true }),
    ]
    const ctx = makeEvent(brackets, 2)
    const odds = computePlayerOdds(ctx)
    expect(odds['dead'].status).toBe('eliminated')
    expect(odds['dead'].winProbability).toBe(0)
    expect(odds['dead'].survivalProbability).toBe(0)
    expect(odds['dead'].clinchPlace).toBeNull()
  })
})

// ── computeHistoricalData: viewSeed slicing ───────────────────────────────────

describe('computeHistoricalData', () => {
  it('hides completions beyond viewSeed (sets them to null)', () => {
    const brackets = [
      makeBracket('a', [
        { place: 1, score: 24 },
        { place: 2, score: 20 },
        { place: 1, score: 24 },
      ]),
    ]
    const ctx = makeEvent(brackets, 4)
    const sliced = computeHistoricalData(ctx, 2)
    const b = sliced.brackets.find((b) => b.uuid === 'a')!
    expect(b.completions[0]).not.toBeNull()
    expect(b.completions[1]).not.toBeNull()
    expect(b.completions[2]).toBeNull()
  })

  it('sets currentRound to viewSeed + 1', () => {
    const ctx = makeEvent([makeBracket('a', [{ place: 1, score: 24 }])], 2)
    expect(computeHistoricalData(ctx, 1).currentRound).toBe(2)
    expect(computeHistoricalData(ctx, 3).currentRound).toBe(4)
  })

  it('point on the sliced bracket equals calculatePoints at viewSeed', () => {
    const completions = [
      { place: 1, score: 24 },
      { place: 2, score: 20 },
      { place: 3, score: 16 },
    ] as const
    const brackets = [makeBracket('a', [...completions])]
    const ctx = makeEvent(brackets, 4)

    for (const seed of [1, 2, 3]) {
      const sliced = computeHistoricalData(ctx, seed)
      const b = sliced.brackets.find((b) => b.uuid === 'a')!
      expect(b.point).toBe(calculatePoints(brackets[0], seed))
    }
  })
})
