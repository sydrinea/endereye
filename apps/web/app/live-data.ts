import { unstable_cache } from 'next/cache'
import { buildLiveEventData, WORLDS_2026_PLAYERS } from '@endereye/discovery'
import { buildMockEventData } from './mock-live-data'
import { fetchUser, fetchPhaseLeaderboard, computeBonusMapForPlayers } from '@endereye/core'
import type { EventContext, EventPlayer } from '@endereye/core'
import { ACTIVE_EVENT } from './events.config'

export const IS_MOCK = process.env.MOCK_LIVE === 'true'

// LCQ uses phase 3 of the season for Elo stats
const LCQ_PHASE_INDEX = 3

// Cached forever — once we know a player's stats they don't change meaningfully mid-event
const getEnrichedPlayer = unstable_cache(
  async (uuid: string, season: number): Promise<EventPlayer | null> => {
    try {
      const u = await fetchUser(uuid, season)
      const phase = u.seasonResult?.phases[LCQ_PHASE_INDEX] ?? u.seasonResult?.last
      if (!phase) return null
      const completions = u.statistics.season.completions.ranked ?? 0
      const completionTime = u.statistics.season.completionTime.ranked ?? 0
      return {
        uuid,
        nickname: u.nickname,
        country: u.country,
        eloRate: phase.eloRate,
        eloRank: phase.eloRank,
        bestTimeMs: u.statistics.season.bestTime.ranked ?? 0,
        avgTimeMs: completions > 0 ? completionTime / completions : 0,
        wins: u.statistics.season.wins.ranked ?? 0,
        losses: u.statistics.season.loses.ranked ?? 0,
        playedMatches: u.statistics.season.playedMatches.ranked ?? 0,
        forfeits: u.statistics.season.forfeits.ranked ?? 0,
      }
    } catch {
      return null
    }
  },
  ['player-enrichment'],
  { revalidate: false },
)

async function buildEventData(): Promise<EventContext> {
  if (new Date() < ACTIVE_EVENT.startDate) {
    const leaderboard = await fetchPhaseLeaderboard(ACTIVE_EVENT.season, true)
    const field = new Set(WORLDS_2026_PLAYERS.map((p) => p.uuid))
    const bonusMap = computeBonusMapForPlayers(field, leaderboard)

    const sorted = [...WORLDS_2026_PLAYERS].sort((a, b) => {
      const bonusDiff = (bonusMap.get(b.uuid) ?? 0) - (bonusMap.get(a.uuid) ?? 0)
      if (bonusDiff !== 0) return bonusDiff
      return (a.eloRank ?? Infinity) - (b.eloRank ?? Infinity)
    })
    const rankMap = new Map<string, number>()
    let rank = 1
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && (bonusMap.get(sorted[i].uuid) ?? 0) < (bonusMap.get(sorted[i - 1].uuid) ?? 0)) {
        rank = i + 1
      }
      rankMap.set(sorted[i].uuid, rank)
    }

    return {
      kind: ACTIVE_EVENT.kind,
      season: ACTIVE_EVENT.season,
      players: WORLDS_2026_PLAYERS,
      brackets: WORLDS_2026_PLAYERS.map((p) => ({
        uuid: p.uuid,
        ranks: [rankMap.get(p.uuid) ?? 1],
        completions: [],
        point: bonusMap.get(p.uuid) ?? 0,
        bonus: bonusMap.get(p.uuid) ?? 0,
        eliminated: false,
      })),
      matches: [],
      currentRound: 1,
      qualifyCount: ACTIVE_EVENT.qualifyCount,
    }
  }

  const eventData = await buildLiveEventData(ACTIVE_EVENT.kind, ACTIVE_EVENT.season, {
    after: ACTIVE_EVENT.matchBoundsAfter ?? 0,
    players: WORLDS_2026_PLAYERS,
    qualifyCount: ACTIVE_EVENT.qualifyCount,
  })

  const enriched = await Promise.all(
    eventData.players.map((p) =>
      p.bestTimeMs > 0 ? p : getEnrichedPlayer(p.uuid, ACTIVE_EVENT.season).then((r) => r ?? p),
    ),
  )

  return { ...eventData, players: enriched }
}

const getCachedEventData = unstable_cache(buildEventData, ['worlds-lcq-live'], { revalidate: 60 })

export async function getLiveEventData(): Promise<EventContext> {
  if (IS_MOCK) return buildMockEventData()
  return getCachedEventData()
}
