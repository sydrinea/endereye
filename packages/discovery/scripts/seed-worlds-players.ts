/**
 * Fetches the predicted phase leaderboard for season 11 and writes the top players
 * to data/lcq/2026.worlds.players.json. Run this before the event once standings stabilize.
 *
 * Usage: npm run seed-worlds-players --workspace=packages/discovery
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fetchPhaseLeaderboard, fetchUser } from '@endereye/core'
import type { EventPlayer } from '@endereye/core'

const SEASON = 11
const PHASE_INDEX = 3 // LCQ uses phase 3

// Players who have already qualified for Worlds or declined to attend — exclude from LCQ field
const EXCLUDED_NICKNAMES = new Set([
  'bing_pigs',
  'hackingnoises',
  'Infume',
  'Pinne',
  'doogile',
  'Feinberg',
  'Aquacorde',
  'edcr',
])

const OUT_PATH = join(__dirname, '../data/lcq/2026.worlds.players.json')

async function main() {
  console.log(`Fetching predicted leaderboard for season ${SEASON}...`)
  const leaderboard = await fetchPhaseLeaderboard(SEASON, true)

  // Take all players with predPhasePoint > 0, excluding already-qualified/declined players
  const candidates = [...leaderboard.users]
    .filter((u) => u.predPhasePoint > 0 && !EXCLUDED_NICKNAMES.has(u.nickname))
    .sort((a, b) => {
      if (b.predPhasePoint !== a.predPhasePoint) return b.predPhasePoint - a.predPhasePoint
      return (a.eloRank ?? Infinity) - (b.eloRank ?? Infinity)
    })

  console.log(`Found ${candidates.length} candidates — fetching user stats...`)

  const players: EventPlayer[] = []
  for (const candidate of candidates) {
    try {
      const u = await fetchUser(candidate.uuid, SEASON)
      const phase = u.seasonResult?.phases[PHASE_INDEX] ?? u.seasonResult?.last
      if (!phase) {
        console.warn(`No phase data for ${candidate.nickname}, skipping`)
        continue
      }
      const completions = u.statistics.season.completions.ranked ?? 0
      const completionTime = u.statistics.season.completionTime.ranked ?? 0
      players.push({
        uuid: candidate.uuid,
        nickname: u.nickname,
        country: candidate.country,
        eloRate: phase.eloRate,
        eloRank: phase.eloRank,
        bestTimeMs: u.statistics.season.bestTime.ranked ?? 0,
        avgTimeMs: completions > 0 ? completionTime / completions : 0,
        wins: u.statistics.season.wins.ranked ?? 0,
        losses: u.statistics.season.loses.ranked ?? 0,
        playedMatches: u.statistics.season.playedMatches.ranked ?? 0,
        forfeits: u.statistics.season.forfeits.ranked ?? 0,
      })
    } catch (e) {
      console.warn(`Failed to fetch stats for ${candidate.nickname}: ${e}`)
    }
  }

  await writeFile(OUT_PATH, JSON.stringify(players, null, 2), 'utf-8')
  console.log(`Wrote ${players.length} players to ${OUT_PATH}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
