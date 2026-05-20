import type { EventContext, EventPlayer } from '@endereye/core'

const NAMES = [
  'Feinberg',
  'Couriway',
  'Brentilda',
  'Elysaku',
  'Doogile',
  'k4yfour',
  'Kenadian',
  'Shylie',
  'Cojiro',
  'TheeSizzler',
  'Lycan',
  'Coolboyra',
  'nEmerald',
  'Minecraftdreams',
  'Salmoni',
  'Rayoh',
]

const MOCK_PLAYERS: EventPlayer[] = NAMES.map((nickname, i) => ({
  uuid: `mock-${i}`,
  nickname,
  country: ['US', 'GB', 'JP', 'CA', 'AU', 'DE', 'FR', 'KR'][i % 8],
  eloRate: 2000 - i * 40,
  eloRank: i + 1,
  bestTimeMs: 280_000 + i * 8_000,
  avgTimeMs: 370_000 + i * 12_000,
  wins: 120 - i * 6,
  losses: 40 + i * 4,
  playedMatches: 160 - i * 2,
  forfeits: Math.floor(i / 4),
}))

const BONUSES = [6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0, 0, 0, 0, 0]

// Score per player per seed [player][seed 0-9]
// Stronger players (lower index) consistently score higher.
// Player 15 scores 0 in seeds 0-2 so they get zero_out'd after seed 3.
const SCORES: number[][] = [
  [18, 21, 15, 22, 19, 20, 16, 23, 18, 21],
  [20, 16, 22, 18, 21, 17, 24, 19, 22, 18],
  [15, 19, 20, 16, 18, 22, 17, 20, 21, 19],
  [17, 14, 18, 20, 16, 19, 21, 18, 17, 20],
  [12, 16, 14, 17, 15, 13, 16, 14, 18, 15],
  [14, 11, 16, 13, 17, 15, 12, 16, 13, 17],
  [10, 13, 12, 14, 11, 16, 13, 11, 15, 12],
  [11, 9, 13, 11, 14, 12, 10, 13, 11, 14],
  [8, 11, 9, 12, 10, 8, 11, 9, 13, 10],
  [6, 9, 7, 10, 8, 11, 9, 7, 10, 8],
  [7, 5, 8, 6, 9, 7, 5, 8, 6, 9],
  [4, 7, 5, 8, 6, 4, 7, 5, 8, 6],
  [5, 3, 6, 4, 7, 5, 3, 6, 4, 7],
  [2, 5, 3, 6, 4, 2, 5, 3, 6, 4],
  [3, 1, 4, 2, 5, 3, 1, 4, 2, 5],
  [0, 0, 0, 3, 1, 2, 0, 2, 1, 3],
]

// Pre-compute ranks per player: ranks[playerIdx] = [initialRank, rankAfterSeed1, ..., rankAfterSeed10]
function buildMockRanks(): number[][] {
  const n = MOCK_PLAYERS.length
  const ranks: number[][] = Array.from({ length: n }, () => [])

  // Seed 0: initial rank by bonus desc, eloRate desc as tiebreaker
  const initialOrder = [...MOCK_PLAYERS.keys()].sort((a, b) => {
    if (BONUSES[b] !== BONUSES[a]) return BONUSES[b] - BONUSES[a]
    return (MOCK_PLAYERS[b].eloRate ?? 0) - (MOCK_PLAYERS[a].eloRate ?? 0)
  })
  const initialRankMap = new Array(n)
  let ir = 1
  for (let i = 0; i < initialOrder.length; i++) {
    if (i > 0 && BONUSES[initialOrder[i]] < BONUSES[initialOrder[i - 1]]) ir = i + 1
    initialRankMap[initialOrder[i]] = ir
  }
  for (let i = 0; i < n; i++) ranks[i].push(initialRankMap[i])

  // Seeds 1-10: rank after each seed
  for (let s = 0; s < 10; s++) {
    const points = MOCK_PLAYERS.map(
      (_, i) => BONUSES[i] + SCORES[i].slice(0, s + 1).reduce((a, b) => a + b, 0),
    )
    const order = [...points.keys()].sort((a, b) =>
      points[b] !== points[a] ? points[b] - points[a] : a - b,
    )
    const rankMap = new Array(n)
    let rank = 1
    for (let i = 0; i < order.length; i++) {
      if (i > 0 && points[order[i]] < points[order[i - 1]]) rank = i + 1
      rankMap[order[i]] = rank
    }
    for (let i = 0; i < n; i++) ranks[i].push(rankMap[i])
  }

  return ranks
}

const MOCK_RANKS = buildMockRanks()

// Full event with all 10 seeds' completions. The server returns a slice of this
// (currentRound = mockRound + 1) and the client computes historical state.
const FULL_MOCK_EVENT: EventContext = {
  kind: 'lcq',
  season: 10,
  qualifyCount: 2,
  players: MOCK_PLAYERS,
  matches: Array.from({ length: 10 }, (_, i) => 9766177 + (i + 1) * 1000),
  currentRound: 11,
  brackets: MOCK_PLAYERS.map((p, i) => ({
    uuid: p.uuid,
    ranks: MOCK_RANKS[i],
    completions: SCORES[i].map((score) => ({ place: 1, score })),
    point: BONUSES[i] + SCORES[i].reduce((a, b) => a + b, 0),
    bonus: BONUSES[i],
    eliminated: false,
  })),
}

const TICK_MS = 10_000
let mockRound = 0
let mockTimerStarted = false

function startMockTimer() {
  if (mockTimerStarted) return
  mockTimerStarted = true
  const interval = setInterval(() => {
    mockRound = Math.min(mockRound + 1, 10)
    if (mockRound >= 10) clearInterval(interval)
  }, TICK_MS)
}

export function buildMockEventData(): EventContext {
  startMockTimer()
  return { ...FULL_MOCK_EVENT, currentRound: mockRound + 1 }
}
