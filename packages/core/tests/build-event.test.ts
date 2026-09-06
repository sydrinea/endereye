// Characterization test for buildEvent — the Match[] -> Event path (dashboard
// "upload matches", CLI). It shares replaySeeds with buildEventFromApiResponse
// (which the web e2e golden-tests), so this pins down the Match[]-specific parts:
// the cross-seed player union, per-place scoring from completion order, points
// accumulation, the zero_out cut, and the rank / completion history.
import { describe, it, expect } from 'vitest'
import { buildEvent } from '../lib/events/build'
import type { Match } from '../lib/api/types'

type PlayerSeed = { uuid: string; elo: number }

const P: PlayerSeed[] = [
  { uuid: 'p1', elo: 2000 },
  { uuid: 'p2', elo: 1900 },
  { uuid: 'p3', elo: 1800 },
  { uuid: 'p4', elo: 1700 },
]

function profile(p: PlayerSeed) {
  return {
    uuid: p.uuid,
    nickname: p.uuid,
    roleType: 0,
    eloRate: p.elo,
    eloRank: null,
    country: null,
  }
}

/** One seed match: `lobby` are present, `finishers` completed in the given order. */
function makeMatch(id: number, lobby: PlayerSeed[], finishers: string[]): Match {
  return {
    id,
    date: 1_700_000_000 + id,
    players: lobby.map(profile),
    result: null,
    completions: finishers.map((uuid, i) => ({ uuid, time: 60_000 + i })),
    spectators: [],
    forfeited: false,
    decayed: false,
    botSource: null,
  }
}

describe('buildEvent', () => {
  // 4 players, 4 seeds. p4 never completes and starts with no bonus, so the
  // seed-3 zero_out cut eliminates them; seeds 1-3 have a 4-player lobby, seed 4
  // only the 3 survivors.
  const matches: Match[] = [
    makeMatch(30, P, ['p1', 'p2', 'p3']),
    makeMatch(10, P, ['p2', 'p1', 'p3']),
    makeMatch(20, P, ['p1', 'p2', 'p3']),
    makeMatch(40, P.slice(0, 3), ['p3', 'p1', 'p2']),
  ]
  const event = buildEvent(matches, new Map())

  it('orders seeds by match id and reports the next round', () => {
    expect(event.matches).toEqual([10, 20, 30, 40])
    expect(event.currentRound).toBe(5)
  })

  it('unions players across all seeds in first-seen lobby order', () => {
    // p4 only appears in seeds 1-3's lobby, but is still in the field
    expect(event.players.map((p) => p.uuid)).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(event.brackets.map((b) => b.uuid)).toEqual(['p1', 'p2', 'p3', 'p4'])
  })

  it('accumulates points from per-place scores (4-player table 24/18/12/6)', () => {
    const pts = Object.fromEntries(event.brackets.map((b) => [b.uuid, b.point]))
    // s1 p2+24 p1+18 p3+12 ; s2 p1+24 p2+18 p3+12 ; s3 p1+24 p2+18 p3+12
    // s4 (3-player table 24/16/8) p3+24 p1+16 p2+8
    expect(pts).toEqual({ p1: 82, p2: 68, p3: 60, p4: 0 })
  })

  it('applies the seed-3 zero_out cut to the pointless player', () => {
    const p4 = event.brackets.find((b) => b.uuid === 'p4')!
    expect(p4.eliminated).toBe(true)
    expect(p4.completions).toEqual([null, null, null, null])
    expect(event.brackets.filter((b) => b.eliminated).map((b) => b.uuid)).toEqual(['p4'])
  })

  it('records completion place/score history per seed', () => {
    const p1 = event.brackets.find((b) => b.uuid === 'p1')!
    expect(p1.completions).toEqual([
      { place: 2, score: 18 },
      { place: 1, score: 24 },
      { place: 1, score: 24 },
      { place: 2, score: 16 },
    ])
  })

  it('tracks a dense rank history of length seedCount + 1', () => {
    const ranks = Object.fromEntries(event.brackets.map((b) => [b.uuid, b.ranks]))
    expect(ranks.p1).toHaveLength(5)
    // initial rank is dense over bonus; all bonuses are 0 -> everyone tied at 1
    expect([ranks.p1[0], ranks.p2[0], ranks.p3[0], ranks.p4[0]]).toEqual([1, 1, 1, 1])
    // p1 and p2 tie on points after seed 2 -> both dense rank 1
    expect(ranks.p1).toEqual([1, 2, 1, 1, 1])
    expect(ranks.p2).toEqual([1, 1, 1, 2, 2])
    // eliminated player is parked at field length for every later seed
    expect(ranks.p4).toEqual([1, 4, 4, 4, 4])
  })

  it('carries bonus points into the starting total', () => {
    const withBonus = buildEvent(matches, new Map([['p3', 50]]))
    const p3 = withBonus.brackets.find((b) => b.uuid === 'p3')!
    expect(p3.bonus).toBe(50)
    expect(p3.point).toBe(50 + 60) // 12+12+12+24 from p3's completions
  })

  it('output shape is stable', () => {
    expect(event).toMatchSnapshot()
  })
})
