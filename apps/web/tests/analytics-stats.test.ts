import { describe, it, expect } from 'vitest'
import {
  buildColorMap,
  getAlivePreset,
  getFinalCutPreset,
  getDominantPreset,
  getClutchPreset,
  buildSurvivalTrajectory,
  buildClinchSlackSeries,
  buildClinchSlackTrajectory,
  buildSeedSwings,
  buildDnfImpact,
  buildSeedResultsGrid,
  PLAYER_COLORS,
} from '../lib/analytics-stats'
import type { EventPlayer, PlayerOdds } from '@endereye/core'
import { MAX_SCORE_PER_SEED } from '@endereye/core'
import type { SeedSnapshot } from '../app/views/analytics.worker'

// ── helpers ───────────────────────────────────────────────────────────────────

function makePlayer(uuid: string, nickname = uuid): EventPlayer {
  return {
    uuid,
    nickname,
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

function makeSnapshot(
  seed: number,
  brackets: SeedSnapshot['brackets'],
  playerOdds: Record<string, Partial<PlayerOdds>> = {},
): SeedSnapshot {
  return { seed, brackets, playerOdds: playerOdds as SeedSnapshot['playerOdds'] }
}

function makeBracket(
  uuid: string,
  eliminated = false,
  opts: { ranks?: number[]; completions?: (null | { place: number; score: number })[] } = {},
): SeedSnapshot['brackets'][number] {
  return {
    uuid,
    point: 0,
    bonus: 0,
    eliminated,
    completions: opts.completions ?? [],
    ranks: opts.ranks ?? [],
  }
}

// ── buildColorMap ─────────────────────────────────────────────────────────────

describe('buildColorMap', () => {
  it('maps each player uuid to a color from PLAYER_COLORS', () => {
    const players = ['a', 'b', 'c'].map((id) => makePlayer(id))
    const map = buildColorMap(players)
    expect(map.get('a')).toBe(PLAYER_COLORS[0])
    expect(map.get('b')).toBe(PLAYER_COLORS[1])
    expect(map.get('c')).toBe(PLAYER_COLORS[2])
  })

  it('wraps around when player count exceeds PLAYER_COLORS length', () => {
    const players = Array.from({ length: PLAYER_COLORS.length + 1 }, (_, i) => makePlayer(`p${i}`))
    const map = buildColorMap(players)
    expect(map.get(`p${PLAYER_COLORS.length}`)).toBe(PLAYER_COLORS[0])
  })
})

// ── getAlivePreset ────────────────────────────────────────────────────────────

describe('getAlivePreset', () => {
  it('returns uuids of non-eliminated players in the last snapshot', () => {
    const snaps = [
      makeSnapshot(1, [makeBracket('a'), makeBracket('b'), makeBracket('c')]),
      makeSnapshot(2, [makeBracket('a'), makeBracket('b'), makeBracket('c', true)]),
    ]
    const result = getAlivePreset(snaps)
    expect(result.has('a')).toBe(true)
    expect(result.has('b')).toBe(true)
    expect(result.has('c')).toBe(false)
  })

  it('returns empty set for empty snapshots', () => {
    expect(getAlivePreset([])).toEqual(new Set())
  })
})

// ── getFinalCutPreset ─────────────────────────────────────────────────────────

describe('getFinalCutPreset', () => {
  it('returns players not eliminated at seed 9 snapshot', () => {
    const players = ['a', 'b', 'c'].map((id) => makePlayer(id))
    const snaps = [makeSnapshot(9, [makeBracket('a'), makeBracket('b'), makeBracket('c', true)])]
    const result = getFinalCutPreset(snaps, players)
    expect(result.has('a')).toBe(true)
    expect(result.has('b')).toBe(true)
    expect(result.has('c')).toBe(false)
  })

  it('returns empty set when no seed 9 snapshot exists', () => {
    const players = ['a', 'b'].map((id) => makePlayer(id))
    const result = getFinalCutPreset([makeSnapshot(5, [])], players)
    expect(result.size).toBe(0)
  })
})

// ── getDominantPreset ─────────────────────────────────────────────────────────

describe('getDominantPreset', () => {
  it('includes players who survived seed 7 and have positive average cutDelta', () => {
    const players = ['a', 'b', 'c'].map((id) => makePlayer(id))
    const snaps = [
      makeSnapshot(7, [makeBracket('a'), makeBracket('b'), makeBracket('c', true)], {
        a: { cutDelta: 5 },
        b: { cutDelta: -3 },
      }),
    ]
    const result = getDominantPreset(snaps, players)
    expect(result.has('a')).toBe(true)
    expect(result.has('b')).toBe(false) // negative avg delta
    expect(result.has('c')).toBe(false) // eliminated
  })

  it('excludes players eliminated before seed 7', () => {
    const players = ['a'].map((id) => makePlayer(id))
    const snaps = [makeSnapshot(7, [makeBracket('a', true)], { a: { cutDelta: 10 } })]
    expect(getDominantPreset(snaps, players).has('a')).toBe(false)
  })
})

// ── getClutchPreset ───────────────────────────────────────────────────────────

describe('getClutchPreset', () => {
  it('includes players with <20% survival at seed 5 who survived seed 7', () => {
    const players = ['a', 'b', 'c'].map((id) => makePlayer(id))
    const snaps = [
      makeSnapshot(5, [], {
        a: { survivalProbability: 0.1 },
        b: { survivalProbability: 0.5 },
      }),
      makeSnapshot(7, [makeBracket('a'), makeBracket('b'), makeBracket('c')]),
    ]
    const result = getClutchPreset(snaps, players)
    expect(result.has('a')).toBe(true) // low odds + survived
    expect(result.has('b')).toBe(false) // high odds at seed 5
    expect(result.has('c')).toBe(false) // missing seed 5 odds → defaults to 1.0 ≥ 0.2
  })

  it('excludes players eliminated before seed 7 even if they had low odds at seed 5', () => {
    const players = ['a'].map((id) => makePlayer(id))
    const snaps = [
      makeSnapshot(5, [], { a: { survivalProbability: 0.05 } }),
      makeSnapshot(7, [makeBracket('a', true)]),
    ]
    expect(getClutchPreset(snaps, players).has('a')).toBe(false)
  })
})

// ── buildSurvivalTrajectory ───────────────────────────────────────────────────

describe('buildSurvivalTrajectory', () => {
  it('produces one data point per snapshot with survival pct per player', () => {
    const players = [makePlayer('a', 'Alice'), makePlayer('b', 'Bob')]
    const colorMap = buildColorMap(players)
    const snaps = [
      makeSnapshot(1, [], {
        a: { survivalProbability: 0.8 },
        b: { survivalProbability: 0.4 },
      }),
      makeSnapshot(2, [], {
        a: { survivalProbability: 0.6 },
        b: { survivalProbability: 0.2 },
      }),
    ]
    const { data, players: outPlayers } = buildSurvivalTrajectory(snaps, players, colorMap)
    expect(data).toHaveLength(2)
    expect(data[0].Alice).toBe(80)
    expect(data[0].Bob).toBe(40)
    expect(data[1].Alice).toBe(60)
    expect(outPlayers[0].nickname).toBe('Alice')
  })

  it('returns cut seeds that appear in display snapshots', () => {
    const players = [makePlayer('a')]
    const colorMap = buildColorMap(players)
    // seeds 2, 3, 5 in snapshots — CLINCH_CUT_SEEDS are [3,5,7,8,9,10]
    const snaps = [2, 3, 5].map((s) => makeSnapshot(s, []))
    const { cutSeeds } = buildSurvivalTrajectory(snaps, players, colorMap)
    expect(cutSeeds).toEqual([3, 5])
  })

  it('uses 0 when a player has no odds in a snapshot', () => {
    const players = [makePlayer('a', 'Alice')]
    const colorMap = buildColorMap(players)
    const snaps = [makeSnapshot(1, [], {})] // no odds for 'a'
    const { data } = buildSurvivalTrajectory(snaps, players, colorMap)
    expect(data[0].Alice).toBe(0)
  })
})

// ── buildClinchSlackSeries ────────────────────────────────────────────────────

describe('buildClinchSlackSeries', () => {
  it('computes slack = actual score − clinch score for each player at each cut seed', () => {
    const players = [makePlayer('a', 'Alice')]
    const snaps = [
      makeSnapshot(2, [makeBracket('a', false, { completions: [null, null] })], {
        a: { clinchScore: 10 },
      }),
      makeSnapshot(3, [
        makeBracket('a', false, { completions: [null, null, { place: 1, score: 15 }] }),
      ]),
    ]
    const data = buildClinchSlackSeries(snaps, players)
    const seed3 = data.find((d) => d.label === 'Seed 3')
    expect(seed3?.Alice).toBe(5) // 15 − 10
  })

  it('includes avg key when there are slack values', () => {
    const players = [makePlayer('a', 'Alice'), makePlayer('b', 'Bob')]
    const snaps = [
      makeSnapshot(2, [], { a: { clinchScore: 10 }, b: { clinchScore: 8 } }),
      makeSnapshot(3, [
        makeBracket('a', false, { completions: [null, null, { place: 1, score: 16 }] }),
        makeBracket('b', false, { completions: [null, null, { place: 2, score: 10 }] }),
      ]),
    ]
    const data = buildClinchSlackSeries(snaps, players)
    const seed3 = data.find((d) => d.label === 'Seed 3')
    // Alice: 16-10=6, Bob: 10-8=2, avg=4
    expect(seed3?.avg).toBe(4)
  })

  it('only produces entries for cut seeds within displayed snapshots', () => {
    const players = [makePlayer('a')]
    const snaps = [makeSnapshot(2, []), makeSnapshot(3, [])]
    const data = buildClinchSlackSeries(snaps, players)
    // Only seed 3 is a CLINCH_CUT_SEED within seeds 1-3
    expect(data.every((d) => d.label === 'Seed 3')).toBe(true)
    expect(data).toHaveLength(1)
  })
})

// ── buildClinchSlackTrajectory ────────────────────────────────────────────────

describe('buildClinchSlackTrajectory', () => {
  it('uses MAX_SCORE_PER_SEED as threshold when clinchScore is null', () => {
    const players = [makePlayer('a', 'Alice')]
    const snaps = [
      makeSnapshot(2, [makeBracket('a')], { a: { clinchScore: null } }),
      makeSnapshot(3, [
        makeBracket('a', false, { completions: [null, null, { place: 1, score: 10 }] }),
      ]),
    ]
    const data = buildClinchSlackTrajectory(snaps, players)
    const seed3 = data.find((d) => d.seed === 3)
    expect(seed3?.Alice).toBe(10 - MAX_SCORE_PER_SEED)
  })

  it('skips players who are eliminated in beforeSnap', () => {
    const players = [makePlayer('a', 'Alice')]
    const snaps = [
      makeSnapshot(2, [makeBracket('a', true)], { a: { clinchScore: 5 } }),
      makeSnapshot(3, [
        makeBracket('a', false, { completions: [null, null, { place: 1, score: 10 }] }),
      ]),
    ]
    const data = buildClinchSlackTrajectory(snaps, players)
    const seed3 = data.find((d) => d.seed === 3)
    expect(seed3?.Alice).toBeUndefined()
  })
})

// ── buildSeedSwings ───────────────────────────────────────────────────────────

describe('buildSeedSwings', () => {
  it('produces one entry per snapshot after the first', () => {
    const snaps = [1, 2, 3, 4].map((s) => makeSnapshot(s, []))
    expect(buildSeedSwings(snaps)).toHaveLength(3)
  })

  it('returns 0 avgSwing when no players have both ranks', () => {
    const snaps = [
      makeSnapshot(1, [makeBracket('a', false, { ranks: [, 1] as number[] })]),
      makeSnapshot(2, [makeBracket('a', false, { ranks: [] })]),
    ]
    const swings = buildSeedSwings(snaps)
    expect(swings[0].avgSwing).toBe(0)
  })

  it('normalizes by lobby size squared: (total/count/count)*100', () => {
    // 2 players, each moved 1 rank: total=2, count=2 → (2/2/2)*100 = 50
    const snaps = [
      makeSnapshot(1, [
        makeBracket('a', false, { ranks: [0, 1, 2] }),
        makeBracket('b', false, { ranks: [0, 2, 1] }),
      ]),
      makeSnapshot(2, [
        makeBracket('a', false, { ranks: [0, 1, 2] }),
        makeBracket('b', false, { ranks: [0, 2, 1] }),
      ]),
    ]
    const swings = buildSeedSwings(snaps)
    // |2-1|=1 and |1-2|=1 → total=2, count=2 → (2/2/2)*100=50
    expect(swings[0].avgSwing).toBe(50)
  })
})

// ── buildDnfImpact ────────────────────────────────────────────────────────────

describe('buildDnfImpact', () => {
  it('records a DNF event when a player has null completion and odds drop', () => {
    const players = [makePlayer('a', 'Alice')]
    const snaps = [
      makeSnapshot(1, [makeBracket('a', false, { completions: [{ place: 1, score: 20 }] })], {
        a: { survivalProbability: 0.8 },
      }),
      makeSnapshot(2, [makeBracket('a', false, { completions: [{ place: 1, score: 20 }, null] })], {
        a: { survivalProbability: 0.5 },
      }),
    ]
    const { data, seedKeys } = buildDnfImpact(snaps, players)
    expect(data).toHaveLength(1)
    expect(data[0].nickname).toBe('Alice')
    expect(data[0].seed2).toBe(30) // Math.round((0.80 - 0.50) * 100)
    expect(seedKeys).toContain('seed2')
  })

  it('returns empty data when no DNFs occur', () => {
    const players = [makePlayer('a', 'Alice')]
    const snaps = [
      makeSnapshot(1, [makeBracket('a', false, { completions: [{ place: 1, score: 20 }] })], {
        a: { survivalProbability: 0.8 },
      }),
      makeSnapshot(
        2,
        [
          makeBracket('a', false, {
            completions: [
              { place: 1, score: 20 },
              { place: 2, score: 16 },
            ],
          }),
        ],
        { a: { survivalProbability: 0.9 } },
      ),
    ]
    const { data } = buildDnfImpact(snaps, players)
    expect(data).toHaveLength(0)
  })

  it('ignores DNF events with zero or negative odds drop', () => {
    const players = [makePlayer('a', 'Alice')]
    const snaps = [
      makeSnapshot(1, [makeBracket('a', false, { completions: [{ place: 1, score: 20 }] })], {
        a: { survivalProbability: 0.5 },
      }),
      makeSnapshot(2, [makeBracket('a', false, { completions: [{ place: 1, score: 20 }, null] })], {
        a: { survivalProbability: 0.6 },
      }),
    ]
    const { data } = buildDnfImpact(snaps, players)
    expect(data).toHaveLength(0)
  })

  it('accumulates drops across multiple DNF seeds for the same player', () => {
    const players = [makePlayer('a', 'Alice')]
    const snaps = [
      makeSnapshot(1, [makeBracket('a', false, { completions: [{ place: 1, score: 20 }] })], {
        a: { survivalProbability: 0.9 },
      }),
      makeSnapshot(2, [makeBracket('a', false, { completions: [{ place: 1, score: 20 }, null] })], {
        a: { survivalProbability: 0.7 },
      }),
      makeSnapshot(
        3,
        [makeBracket('a', false, { completions: [{ place: 1, score: 20 }, null, null] })],
        { a: { survivalProbability: 0.4 } },
      ),
    ]
    const { data, seedKeys } = buildDnfImpact(snaps, players)
    expect(data).toHaveLength(1)
    expect(seedKeys).toContain('seed2')
    expect(seedKeys).toContain('seed3')
    expect(data[0].seed2).toBe(20) // Math.round((0.90 - 0.70) * 100)
    expect(data[0].seed3).toBe(30) // Math.round((0.70 - 0.40) * 100)
  })

  it('sorts by total drop descending', () => {
    const players = [makePlayer('a', 'Alice'), makePlayer('b', 'Bob')]
    const snaps = [
      makeSnapshot(
        1,
        [
          makeBracket('a', false, { completions: [{ place: 1, score: 20 }] }),
          makeBracket('b', false, { completions: [{ place: 2, score: 16 }] }),
        ],
        {
          a: { survivalProbability: 0.9 },
          b: { survivalProbability: 0.7 },
        },
      ),
      makeSnapshot(
        2,
        [
          makeBracket('a', false, { completions: [{ place: 1, score: 20 }, null] }),
          makeBracket('b', false, { completions: [{ place: 2, score: 16 }, null] }),
        ],
        {
          a: { survivalProbability: 0.4 }, // drop=50
          b: { survivalProbability: 0.6 }, // drop=10
        },
      ),
    ]
    const { data } = buildDnfImpact(snaps, players)
    expect(data[0].nickname).toBe('Alice')
    expect(data[1].nickname).toBe('Bob')
  })
})

// ── buildSeedResultsGrid ──────────────────────────────────────────────────────

describe('buildSeedResultsGrid', () => {
  it('produces one row per visible player with one cell per snapshot', () => {
    const players = ['a', 'b'].map((id) => makePlayer(id))
    const colorMap = buildColorMap(players)
    const snaps = [makeSnapshot(1, [makeBracket('a'), makeBracket('b')])]
    const rows = buildSeedResultsGrid(snaps, players, colorMap)
    expect(rows).toHaveLength(2)
    expect(rows[0].cells).toHaveLength(1)
  })

  it('returns eliminated=true cell when bracket is missing for a player', () => {
    const players = [makePlayer('a')]
    const colorMap = buildColorMap(players)
    const snaps = [makeSnapshot(1, [])] // no bracket for 'a'
    const rows = buildSeedResultsGrid(snaps, players, colorMap)
    expect(rows[0].cells[0].eliminated).toBe(true)
  })

  it('computes rankDelta = prevRank − rankAfter (positive = moved up)', () => {
    const players = [makePlayer('a')]
    const colorMap = buildColorMap(players)
    const snaps = [
      makeSnapshot(1, [makeBracket('a', false, { ranks: [0, 3] })]),
      makeSnapshot(2, [makeBracket('a', false, { ranks: [0, 3, 1] })]),
    ]
    const rows = buildSeedResultsGrid(snaps, players, colorMap)
    // seed 2 cell: rankAfter=ranks[2]=1, prevRank=ranks[1]=3 → delta=3-1=2
    expect(rows[0].cells[1].rankDelta).toBe(2)
  })

  it('places null when ranks are missing', () => {
    const players = [makePlayer('a')]
    const colorMap = buildColorMap(players)
    const snaps = [makeSnapshot(1, [makeBracket('a', false, { ranks: [] })])]
    const rows = buildSeedResultsGrid(snaps, players, colorMap)
    expect(rows[0].cells[0].rankAfter).toBeNull()
  })
})
