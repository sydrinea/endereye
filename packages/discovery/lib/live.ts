import {
  fetchEventMatches,
  fetchLatestMatchId,
  fetchPhaseLeaderboard,
  buildEvent,
  computeBonusMap,
  computeBonusMapForPlayers,
} from '@endereye/core'
import type { EventContext, EventKind, EventPlayer } from '@endereye/core'
import worlds2026PlayersJson from '../data/lcq/2026.worlds.players.json'

export const WORLDS_2026_PLAYERS = worlds2026PlayersJson as EventPlayer[]

export async function buildLiveEventData(
  kind: EventKind,
  season: number,
  opts: { after: number; players: EventPlayer[]; qualifyCount?: number },
): Promise<EventContext> {
  const before = await fetchLatestMatchId()
  const matches = await fetchEventMatches({ after: opts.after, before })
  const leaderboard = await fetchPhaseLeaderboard(season, true)

  if (matches.length === 0) {
    const field = new Set(opts.players.map((p) => p.uuid))
    const bonusMap = computeBonusMapForPlayers(field, leaderboard)

    const sorted = [...opts.players].sort((a, b) => {
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
      kind,
      season,
      players: opts.players,
      brackets: opts.players.map((p) => ({
        uuid: p.uuid,
        ranks: [rankMap.get(p.uuid) ?? 1],
        completions: [],
        point: bonusMap.get(p.uuid) ?? 0,
        bonus: bonusMap.get(p.uuid) ?? 0,
        eliminated: false,
      })),
      matches: [],
      currentRound: 1,
      qualifyCount: opts.qualifyCount,
    }
  }

  const bonusMap = computeBonusMap(matches, leaderboard)
  const event = buildEvent(matches, bonusMap)

  // Use the actual match field as ground truth for who's playing.
  // Prefer enriched EventPlayer data from opts.players where available,
  // falling back to basic profile data for anyone not pre-seeded.
  const enrichedByUuid = new Map(opts.players.map((p) => [p.uuid, p]))
  const players: EventPlayer[] = matches[0].players.map(
    (p) =>
      enrichedByUuid.get(p.uuid) ?? {
        uuid: p.uuid,
        nickname: p.nickname,
        country: p.country,
        eloRate: p.eloRate,
        eloRank: p.eloRank,
        bestTimeMs: 0,
        avgTimeMs: 0,
        wins: 0,
        losses: 0,
        playedMatches: 0,
        forfeits: 0,
      },
  )

  return {
    kind,
    season,
    players,
    brackets: event.brackets,
    matches: event.matches,
    currentRound: event.currentRound,
    qualifyCount: opts.qualifyCount,
  }
}
