import {
  fetchEventMatches,
  fetchLatestMatchId,
  fetchPhaseLeaderboard,
  buildEvent,
  computeBonusMap,
  createEventDataFromParts,
} from '@endereye/core'
import type { EventData, EventKind, EventPlayer } from '@endereye/core'
import worlds2026PlayersJson from '../data/lcq/2026.worlds.players.json'

export const WORLDS_2026_PLAYERS = worlds2026PlayersJson as EventPlayer[]

export async function buildLiveEventData(
  kind: EventKind,
  season: number,
  opts: { after: number; players: EventPlayer[]; qualifyCount?: number },
): Promise<EventData | null> {
  const before = await fetchLatestMatchId()
  const matches = await fetchEventMatches({ after: opts.after, before })

  if (matches.length === 0) return null

  const leaderboard = await fetchPhaseLeaderboard(season)
  const bonusMap = computeBonusMap(matches, leaderboard)
  const event = buildEvent(matches, bonusMap)
  return createEventDataFromParts(event, opts.players, kind, season, { qualifyCount: opts.qualifyCount })
}
