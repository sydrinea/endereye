import type { Match } from '@endereye/core'

const FIELD_UUIDS = [
  'player-00', 'player-01', 'player-02', 'player-03',
  'player-04', 'player-05', 'player-06', 'player-07',
  'player-08', 'player-09', 'player-10', 'player-11',
  'player-12', 'player-13', 'player-14', 'player-15',
]

const FIELD_PLAYERS = FIELD_UUIDS.map((uuid, i) => ({
  uuid,
  nickname: ['Feinberg','Couriway','Brentilda','Elysaku','Doogile','k4yfour','Kenadian','Shylie','Cojiro','TheeSizzler','Lycan','Coolboyra','nEmerald','Dreams','Salmoni','Rayoh'][i],
  eloRate: 2200 - i * 50,
  eloRank: i + 1,
  country: ['us','us','gb','jp','ca','au','de','fr','kr','us','gb','jp','ca','au','de','fr'][i],
  roleType: 1 as const,
}))

const RED_LIME = { uuid: 'spectator-rl', nickname: 'RED_LIME', eloRate: null, eloRank: null, country: null, roleType: 3 as const }

// Completion orders per seed — each row is [uuid, ...] in finish order (8 finishers out of 16)
// Stronger players tend to finish earlier. Player-15 finishes nothing in seeds 0-2 (zero_out bait).
const FINISH_ORDERS: string[][] = [
  // seed 1
  ['player-00','player-01','player-02','player-03','player-04','player-05','player-06','player-07'],
  // seed 2
  ['player-01','player-00','player-03','player-02','player-05','player-04','player-07','player-06'],
  // seed 3
  ['player-00','player-02','player-01','player-04','player-03','player-06','player-05','player-08'],
  // seed 4
  ['player-00','player-01','player-02','player-03','player-04','player-05','player-08','player-09'],
  // seed 5
  ['player-01','player-00','player-02','player-03','player-05','player-04','player-06','player-09'],
  // seed 6
  ['player-00','player-01','player-02','player-04','player-03','player-05','player-07','player-08'],
  // seed 7
  ['player-00','player-01','player-02','player-03','player-04','player-05','player-06','player-07'],
  // seed 8
  ['player-01','player-00','player-02','player-03','player-05','player-04','player-06','player-07'],
  // seed 9
  ['player-00','player-02','player-01','player-03','player-04','player-05','player-06','player-07'],
  // seed 10
  ['player-00','player-01','player-02','player-03','player-04','player-05','player-06','player-07'],
]

const BASE_TIME = 280_000 // ms

function makeEventMatch(id: number, seedIdx: number): Match {
  const order = FINISH_ORDERS[seedIdx]
  return {
    id,
    date: 1_748_000_000 + seedIdx * 3600,
    players: FIELD_PLAYERS,
    result: { uuid: order[0], time: BASE_TIME },
    completions: order.map((uuid, i) => ({ uuid, time: BASE_TIME + i * 5_000 })),
    spectators: [RED_LIME],
    forfeited: false,
    decayed: false,
    botSource: null,
    tag: null,
    seedType: null,
  }
}

// 10 valid event matches, IDs ascending
export const EVENT_MATCH_IDS = [
  10_400_100, 10_400_200, 10_400_350,
  10_400_500, 10_400_650, 10_400_800,
  10_400_950, 10_401_100, 10_401_250, 10_401_400,
]

export const VALID_MATCHES: Match[] = EVENT_MATCH_IDS.map((id, i) => makeEventMatch(id, i))

// 3 forfeited event matches — RED_LIME present but forfeited:true (wrong seed set up)
export const FORFEITED_MATCHES: Match[] = [
  { ...makeEventMatch(10_400_090, 0), id: 10_400_090, forfeited: true },
  { ...makeEventMatch(10_400_320, 2), id: 10_400_320, forfeited: true },
  { ...makeEventMatch(10_400_480, 3), id: 10_400_480, forfeited: true },
]

// 3 regular ladder matches — no RED_LIME spectator
const LADDER_PLAYER = (i: number) => ({
  uuid: `ladder-${i}`, nickname: `LadderPlayer${i}`, eloRate: 1600, eloRank: 50, country: 'us', roleType: 1 as const,
})
export const LADDER_MATCHES: Match[] = [10_399_900, 10_400_050, 10_400_150].map((id, i) => ({
  id,
  date: 1_747_990_000 + i * 600,
  players: [LADDER_PLAYER(i * 2), LADDER_PLAYER(i * 2 + 1)],
  result: { uuid: `ladder-${i * 2}`, time: 310_000 },
  completions: [{ uuid: `ladder-${i * 2}`, time: 310_000 }],
  spectators: [],
  forfeited: false,
  decayed: false,
  botSource: null,
  tag: null,
  seedType: null,
}))

// 1 decayed match
export const DECAYED_MATCH: Match = {
  id: 10_400_120,
  date: 1_747_995_000,
  players: [LADDER_PLAYER(10), LADDER_PLAYER(11)],
  result: null,
  completions: [],
  spectators: [],
  forfeited: false,
  decayed: true,
  botSource: null,
  tag: null,
  seedType: null,
}

// Strip completions to mimic real /matches?before=X batch responses — the API omits completions
// from list endpoints; only the detail /matches/{id} endpoint includes them.
function stripCompletions(m: Match): Match {
  const { completions: _c, ...rest } = m
  return rest
}

// All matches as they'd appear in a paginated /matches?before=X response — descending by ID
export const ALL_RAW_MATCHES: Match[] = [
  ...VALID_MATCHES,
  ...FORFEITED_MATCHES,
  ...LADDER_MATCHES,
  DECAYED_MATCH,
].sort((a, b) => b.id - a.id).map(stripCompletions)

export const LATEST_MATCH_ID = 10_401_500

// First 3 valid seeds for mid-event tests
export const VALID_MATCHES_3 = VALID_MATCHES.slice(0, 3)
