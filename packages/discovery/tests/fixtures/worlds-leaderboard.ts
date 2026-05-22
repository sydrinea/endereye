import type { PhaseLeaderboard } from '@endereye/core'

// 16 players matching the UUIDs used in worlds-matches.ts.
// predPhasePoint drives leaderboard ordering; seasonResult.phasePoint drives bonuses.
// Bonus = floor((phasePoint - minPhasePoint) / 10), capped at 0 from below.
// With min = 2800 the spread produces bonuses 0–6.
export const WORLDS_LEADERBOARD: PhaseLeaderboard = {
  phase: { endsAt: null, number: 3, season: 11 },
  users: [
    // Bonus formula: floor((phasePoint - min) / 10), min = 2800
    // bonus 6: phasePoint >= 2860
    {
      uuid: 'player-00', nickname: 'edcr',         eloRate: 2200, eloRank: 1,  country: 'us', roleType: 1,
      predPhasePoint: 3400,
      seasonResult: { eloRate: 2200, eloRank: 1,  phasePoint: 2869 },
    },
    {
      uuid: 'player-01', nickname: 'Infume',       eloRate: 2150, eloRank: 2,  country: 'us', roleType: 1,
      predPhasePoint: 3300,
      seasonResult: { eloRate: 2150, eloRank: 2,  phasePoint: 2860 },
    },
    // bonus 5
    {
      uuid: 'player-02', nickname: 'Feinberg',     eloRate: 2100, eloRank: 3,  country: 'gb', roleType: 1,
      predPhasePoint: 3200,
      seasonResult: { eloRate: 2100, eloRank: 3,  phasePoint: 2859 },
    },
    {
      uuid: 'player-03', nickname: 'Aquacorde',    eloRate: 2050, eloRank: 4,  country: 'jp', roleType: 1,
      predPhasePoint: 3100,
      seasonResult: { eloRate: 2050, eloRank: 4,  phasePoint: 2850 },
    },
    // bonus 4
    {
      uuid: 'player-04', nickname: 'lowk3y_',      eloRate: 2000, eloRank: 5,  country: 'ca', roleType: 1,
      predPhasePoint: 3000,
      seasonResult: { eloRate: 2000, eloRank: 5,  phasePoint: 2849 },
    },
    {
      uuid: 'player-05', nickname: 'nahhann',      eloRate: 1950, eloRank: 6,  country: 'au', roleType: 1,
      predPhasePoint: 2950,
      seasonResult: { eloRate: 1950, eloRank: 6,  phasePoint: 2840 },
    },
    // bonus 3
    {
      uuid: 'player-06', nickname: 'steez',        eloRate: 1900, eloRank: 7,  country: 'de', roleType: 1,
      predPhasePoint: 2900,
      seasonResult: { eloRate: 1900, eloRank: 7,  phasePoint: 2839 },
    },
    {
      uuid: 'player-07', nickname: 'silverrruns',  eloRate: 1850, eloRank: 8,  country: 'fr', roleType: 1,
      predPhasePoint: 2850,
      seasonResult: { eloRate: 1850, eloRank: 8,  phasePoint: 2830 },
    },
    // bonus 2
    {
      uuid: 'player-08', nickname: 'woofdoggo_',   eloRate: 1800, eloRank: 9,  country: 'kr', roleType: 1,
      predPhasePoint: 2800,
      seasonResult: { eloRate: 1800, eloRank: 9,  phasePoint: 2829 },
    },
    {
      uuid: 'player-09', nickname: 'priffie',      eloRate: 1750, eloRank: 10, country: 'us', roleType: 1,
      predPhasePoint: 2750,
      seasonResult: { eloRate: 1750, eloRank: 10, phasePoint: 2820 },
    },
    // bonus 1
    {
      uuid: 'player-10', nickname: 'BlazeMind',    eloRate: 1700, eloRank: 11, country: 'gb', roleType: 1,
      predPhasePoint: 2700,
      seasonResult: { eloRate: 1700, eloRank: 11, phasePoint: 2819 },
    },
    {
      uuid: 'player-11', nickname: 'Ancoboyy',     eloRate: 1650, eloRank: 12, country: 'jp', roleType: 1,
      predPhasePoint: 2650,
      seasonResult: { eloRate: 1650, eloRank: 12, phasePoint: 2810 },
    },
    // bonus 0 (bottom 4 — phasePoint == min)
    {
      uuid: 'player-12', nickname: 'subdas',       eloRate: 1600, eloRank: 13, country: 'ca', roleType: 1,
      predPhasePoint: 2600,
      seasonResult: { eloRate: 1600, eloRank: 13, phasePoint: 2800 },
    },
    {
      uuid: 'player-13', nickname: 'nEmerald',     eloRate: 1550, eloRank: 14, country: 'au', roleType: 1,
      predPhasePoint: 2550,
      seasonResult: { eloRate: 1550, eloRank: 14, phasePoint: 2800 },
    },
    {
      uuid: 'player-14', nickname: 'Watermelon1708', eloRate: 1500, eloRank: 15, country: 'de', roleType: 1,
      predPhasePoint: 2500,
      seasonResult: { eloRate: 1500, eloRank: 15, phasePoint: 2800 },
    },
    {
      uuid: 'player-15', nickname: 'amariyy',      eloRate: 1450, eloRank: 16, country: 'fr', roleType: 1,
      predPhasePoint: 2450,
      seasonResult: { eloRate: 1450, eloRank: 16, phasePoint: 2800 },
    },
  ],
}
