import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildLiveEventData } from '../lib/live'
import {
  ALL_RAW_MATCHES,
  DECAYED_MATCH,
  EVENT_MATCH_IDS,
  FORFEITED_MATCHES,
  LADDER_MATCHES,
  LATEST_MATCH_ID,
  VALID_MATCHES,
  VALID_MATCHES_3,
} from './fixtures/worlds-matches'
import { WORLDS_LEADERBOARD } from './fixtures/worlds-leaderboard'
import type { EventPlayer } from '@endereye/core'

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as Response
}

const OPTS = {
  after: 10_399_800,
  players: WORLDS_LEADERBOARD.users.map(
    (u): EventPlayer => ({
      uuid: u.uuid,
      nickname: u.nickname,
      country: u.country,
      eloRate: u.eloRate,
      eloRank: u.eloRank,
      bestTimeMs: 280_000,
      avgTimeMs: 370_000,
      wins: 100,
      losses: 50,
      playedMatches: 150,
      forfeits: 2,
    }),
  ),
  qualifyCount: 2,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => vi.unstubAllGlobals())

describe('pre-event (no matches)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.includes('/phase-leaderboard')) return jsonOk(WORLDS_LEADERBOARD)
      // fetchLatestMatchId — /matches? with no before/after
      if (url.endsWith('/matches?')) return jsonOk([{ ...VALID_MATCHES[0], id: LATEST_MATCH_ID }])
      // fetchMatches batch — no event matches exist yet
      if (url.includes('/matches?before=')) return jsonOk([])
      throw new Error(`fixture: unhandled URL: ${url}`)
    })
  })

  it('returns currentRound 1 with empty brackets', async () => {
    const ctx = await buildLiveEventData('lcq', 11, OPTS)
    expect(ctx.currentRound).toBe(1)
    expect(ctx.brackets).toHaveLength(16)
    for (const b of ctx.brackets) {
      expect(b.ranks).toEqual([])
      expect(b.completions).toEqual([])
      expect(b.eliminated).toBe(false)
    }
  })

  it('assigns bonus points from leaderboard', async () => {
    const ctx = await buildLiveEventData('lcq', 11, OPTS)
    const byUuid = new Map(ctx.brackets.map((b) => [b.uuid, b]))
    // player-00 and player-01: phasePoint 3860/3800, min is 2800 → bonus 6
    expect(byUuid.get('player-00')!.bonus).toBe(6)
    expect(byUuid.get('player-01')!.bonus).toBe(6)
    // player-12 through player-15: phasePoint 2800 = min → bonus 0
    expect(byUuid.get('player-12')!.bonus).toBe(0)
    expect(byUuid.get('player-15')!.bonus).toBe(0)
  })
})

describe('mid-event (3 seeds complete)', () => {
  beforeEach(() => {
    // Return only the first 3 valid matches in the batch; terminate on second call
    const batch = [...VALID_MATCHES_3, ...FORFEITED_MATCHES, ...LADDER_MATCHES, DECAYED_MATCH]
      .filter((m) => m.id > OPTS.after)
      .sort((a, b) => b.id - a.id)
    let batchCalled = false
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.includes('/phase-leaderboard')) return jsonOk(WORLDS_LEADERBOARD)
      if (url.endsWith('/matches?'))
        return jsonOk([{ ...VALID_MATCHES_3[VALID_MATCHES_3.length - 1], id: LATEST_MATCH_ID }])
      const detailMatch = url.match(/\/matches\/(\d+)$/)
      if (detailMatch) {
        const id = Number(detailMatch[1])
        const match = VALID_MATCHES_3.find((m) => m.id === id)
        if (!match) throw new Error(`fixture: no match ${id}`)
        return jsonOk(match)
      }
      if (url.includes('/matches?before=')) {
        if (batchCalled) return jsonOk([])
        batchCalled = true
        return jsonOk(batch)
      }
      throw new Error(`fixture: unhandled: ${url}`)
    })
  })

  it('returns currentRound 4', async () => {
    const ctx = await buildLiveEventData('lcq', 11, OPTS)
    expect(ctx.currentRound).toBe(4)
  })

  it('has 4-element ranks arrays (initial + 3 seeds)', async () => {
    const ctx = await buildLiveEventData('lcq', 11, OPTS)
    for (const b of ctx.brackets) {
      expect(b.ranks).toHaveLength(4)
    }
  })

  it('filters out forfeited and non-event matches', async () => {
    const ctx = await buildLiveEventData('lcq', 11, OPTS)
    // Only 3 event matches → 3 match IDs
    expect(ctx.matches).toHaveLength(3)
    expect(ctx.matches).toEqual(EVENT_MATCH_IDS.slice(0, 3))
  })

  it('applies zero_out elimination after seed 3', async () => {
    const ctx = await buildLiveEventData('lcq', 11, OPTS)
    // player-15 scored nothing in seeds 1-3 → eliminated
    const p15 = ctx.brackets.find((b) => b.uuid === 'player-15')!
    expect(p15.eliminated).toBe(true)
    // player-00 finished in seeds 1-3 → not eliminated
    const p00 = ctx.brackets.find((b) => b.uuid === 'player-00')!
    expect(p00.eliminated).toBe(false)
  })
})

describe('full event (all 10 seeds)', () => {
  beforeEach(() => {
    let batchCalled = false
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.includes('/phase-leaderboard')) return jsonOk(WORLDS_LEADERBOARD)
      if (url.endsWith('/matches?'))
        return jsonOk([{ ...VALID_MATCHES[VALID_MATCHES.length - 1], id: LATEST_MATCH_ID }])
      const detailMatch = url.match(/\/matches\/(\d+)$/)
      if (detailMatch) {
        const id = Number(detailMatch[1])
        const match = VALID_MATCHES.find((m) => m.id === id)
        if (!match) throw new Error(`fixture: no match ${id}`)
        return jsonOk(match)
      }
      if (url.includes('/matches?before=')) {
        if (batchCalled) return jsonOk([])
        batchCalled = true
        return jsonOk(ALL_RAW_MATCHES)
      }
      throw new Error(`fixture: unhandled: ${url}`)
    })
  })

  it('returns currentRound 11', async () => {
    const ctx = await buildLiveEventData('lcq', 11, OPTS)
    expect(ctx.currentRound).toBe(11)
  })

  it('includes exactly the 10 valid event matches', async () => {
    const ctx = await buildLiveEventData('lcq', 11, OPTS)
    expect(ctx.matches).toHaveLength(10)
    expect(ctx.matches).toEqual(EVENT_MATCH_IDS)
  })

  it('ranks arrays have 11 elements (initial + 10 seeds)', async () => {
    const ctx = await buildLiveEventData('lcq', 11, OPTS)
    for (const b of ctx.brackets) {
      expect(b.ranks).toHaveLength(11)
    }
  })

  it('top 2 by points survive all cuts', async () => {
    const ctx = await buildLiveEventData('lcq', 11, OPTS)
    const sorted = [...ctx.brackets].sort((a, b) => b.point - a.point)
    expect(sorted[0].eliminated).toBe(false)
    expect(sorted[1].eliminated).toBe(false)
  })

  it('eliminates the right number of players', async () => {
    const ctx = await buildLiveEventData('lcq', 11, OPTS)
    // Final cut keepTop:4 → 4 survive, 12 eliminated
    const alive = ctx.brackets.filter((b) => !b.eliminated)
    expect(alive).toHaveLength(4)
  })

  it('qualifyCount propagated', async () => {
    const ctx = await buildLiveEventData('lcq', 11, OPTS)
    expect(ctx.qualifyCount).toBe(2)
  })
})

describe('multi-batch pagination', () => {
  beforeEach(() => {
    // Split ALL_RAW_MATCHES across two pages at a midpoint ID.
    // The cursor starts at LATEST_MATCH_ID and advances to the last item in each batch.
    // Batch 1: IDs >= midpoint (highest IDs, returned first)
    // Batch 2: IDs < midpoint, > OPTS.after (lower IDs)
    // Batch 3: [] to terminate the loop
    const sorted = [...ALL_RAW_MATCHES].sort((a, b) => b.id - a.id)
    const midIdx = Math.floor(sorted.length / 2)
    const midId = sorted[midIdx].id
    const batch1 = sorted.filter((m) => m.id >= midId)
    const batch2 = sorted.filter((m) => m.id < midId && m.id > OPTS.after)
    let callCount = 0

    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.includes('/phase-leaderboard')) return jsonOk(WORLDS_LEADERBOARD)
      if (url.endsWith('/matches?'))
        return jsonOk([{ ...VALID_MATCHES[VALID_MATCHES.length - 1], id: LATEST_MATCH_ID }])
      const detailMatch = url.match(/\/matches\/(\d+)$/)
      if (detailMatch) {
        const id = Number(detailMatch[1])
        const match = VALID_MATCHES.find((m) => m.id === id)
        if (!match) throw new Error(`fixture: no match ${id}`)
        return jsonOk(match)
      }
      if (url.includes('/matches?before=')) {
        const page = callCount++
        if (page === 0) return jsonOk(batch1)
        if (page === 1) return jsonOk(batch2)
        return jsonOk([])
      }
      throw new Error(`fixture: unhandled: ${url}`)
    })
  })

  it('discovers all 10 event matches across two pages', async () => {
    const ctx = await buildLiveEventData('lcq', 11, OPTS)
    expect(ctx.matches).toHaveLength(10)
    expect(ctx.matches).toEqual(EVENT_MATCH_IDS)
  })

  it('produces the same currentRound as single-batch', async () => {
    const ctx = await buildLiveEventData('lcq', 11, OPTS)
    expect(ctx.currentRound).toBe(11)
  })
})

describe('player resolution from match field', () => {
  // Variant of OPTS where player-14 and player-15 are NOT pre-seeded —
  // simulates those two not being in WORLDS_2026_PLAYERS (e.g. late addition or seeding gap)
  const OPTS_PARTIAL = {
    ...OPTS,
    players: OPTS.players.filter((p) => p.uuid !== 'player-14' && p.uuid !== 'player-15'),
  }

  beforeEach(() => {
    let batchCalled = false
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.includes('/phase-leaderboard')) return jsonOk(WORLDS_LEADERBOARD)
      if (url.endsWith('/matches?'))
        return jsonOk([{ ...VALID_MATCHES[VALID_MATCHES.length - 1], id: LATEST_MATCH_ID }])
      const detailMatch = url.match(/\/matches\/(\d+)$/)
      if (detailMatch) {
        const id = Number(detailMatch[1])
        const match = VALID_MATCHES.find((m) => m.id === id)
        if (!match) throw new Error(`fixture: no match ${id}`)
        return jsonOk(match)
      }
      if (url.includes('/matches?before=')) {
        if (batchCalled) return jsonOk([])
        batchCalled = true
        return jsonOk(ALL_RAW_MATCHES)
      }
      throw new Error(`fixture: unhandled: ${url}`)
    })
  })

  it('players array matches the match field exactly', async () => {
    const ctx = await buildLiveEventData('lcq', 11, OPTS_PARTIAL)
    // All 16 match participants should appear — not just the 14 pre-seeded ones
    expect(ctx.players).toHaveLength(16)
    expect(ctx.players.map((p) => p.uuid)).toEqual(
      expect.arrayContaining(['player-14', 'player-15']),
    )
  })

  it('pre-seeded players keep their enriched stats', async () => {
    const ctx = await buildLiveEventData('lcq', 11, OPTS_PARTIAL)
    const p00 = ctx.players.find((p) => p.uuid === 'player-00')!
    // OPTS.players has bestTimeMs: 280_000 for player-00
    expect(p00.bestTimeMs).toBe(280_000)
    expect(p00.wins).toBe(100)
  })

  it('non-pre-seeded players fall back to basic profile data', async () => {
    const ctx = await buildLiveEventData('lcq', 11, OPTS_PARTIAL)
    const p14 = ctx.players.find((p) => p.uuid === 'player-14')!
    const p15 = ctx.players.find((p) => p.uuid === 'player-15')!
    // Basic fallback: nickname and eloRate from match UserProfile, stats zeroed
    expect(p14.nickname).toBe('Salmoni')
    expect(p14.bestTimeMs).toBe(0)
    expect(p15.nickname).toBe('Rayoh')
    expect(p15.bestTimeMs).toBe(0)
  })
})
