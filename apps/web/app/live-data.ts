import { cacheLife } from 'next/cache'
import { buildLiveEventData, WORLDS_2026_PLAYERS } from '@endereye/discovery'
import { buildMockEventData } from './mock-live-data'
import { fetchUser } from '@endereye/core'
import type { EventContext, EventPlayer } from '@endereye/core'
import { ACTIVE_EVENT } from './events.config'

export const IS_MOCK = process.env.MOCK_LIVE === 'true'

// LCQ uses phase 3 of the season for Elo stats
const LCQ_PHASE_INDEX = 3

// Cached forever — once we know a player's stats they don't change meaningfully mid-event
async function getEnrichedPlayer(uuid: string, season: number): Promise<EventPlayer | null> {
  'use cache'
  cacheLife('max')
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
}

async function fetchLiveEventData(): Promise<EventContext> {
  'use cache'
  cacheLife({ revalidate: 120 })

  const eventData = await buildLiveEventData(ACTIVE_EVENT.kind, ACTIVE_EVENT.season, {
    after: ACTIVE_EVENT.matchBoundsAfter ?? 0,
    players: WORLDS_2026_PLAYERS,
    qualifyCount: ACTIVE_EVENT.qualifyCount,
  })

  // Enrich any players that only have basic profile data (bestTimeMs === 0 means not pre-seeded)
  const enriched = await Promise.all(
    eventData.players.map((p) =>
      p.bestTimeMs > 0 ? p : getEnrichedPlayer(p.uuid, ACTIVE_EVENT.season).then((r) => r ?? p),
    ),
  )

  return { ...eventData, players: enriched }
}

export async function getLiveEventData(): Promise<EventContext> {
  if (IS_MOCK) return buildMockEventData()
  return fetchLiveEventData()
}
