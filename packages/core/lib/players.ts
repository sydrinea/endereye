import { fetchUser } from './api/fetch'
import { Event, EventKind } from './api/types'
import { EventPlayer } from './context/event'
import { FetchError } from './errors'

const PHASE_INDEX: Record<EventKind, number> = {
  mss: 1,
  lcq: 3,
  worlds: 0,
}

export async function enrichEventPlayers(
  raw: Event,
  kind: EventKind,
  season: number,
): Promise<EventPlayer[]> {
  const phaseIndex = PHASE_INDEX[kind]
  const userData = await Promise.all(raw.players.map((p) => fetchUser(p.uuid, season)))

  return raw.players.map((p, i) => {
    const u = userData[i]
    const phase = u.seasonResult?.phases[phaseIndex] ?? u.seasonResult?.last
    if (!phase) throw new FetchError(`Cannot find phase Elo results for ${u.nickname}`)
    const played = u.statistics.season.playedMatches.ranked
    const completions = u.statistics.season.completions.ranked!
    const completionTime = u.statistics.season.completionTime.ranked!

    return {
      uuid: p.uuid,
      nickname: u.nickname,
      country: p.country,
      eloRate: phase.eloRate,
      eloRank: phase.eloRank,
      bestTimeMs: u.statistics.season.bestTime.ranked ?? 0,
      avgTimeMs: completions > 0 ? completionTime / completions : 0,
      wins: u.statistics.season.wins.ranked!,
      losses: u.statistics.season.loses.ranked!,
      playedMatches: played!,
      forfeits: u.statistics.season.forfeits.ranked!,
    }
  })
}
