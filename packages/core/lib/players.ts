/**
 * Hydrates an `Event`'s bare player list into `EventPlayer[]` by fetching each
 * player's season stats — the step that turns API data into something the
 * engine can simulate.
 */
import { fetchUser } from './api/fetch'
import { Event, EventKind } from './api/types'
import { EventPlayer } from './context/event'

/** Which `seasonResult.phases[]` index holds the relevant Elo/points for each event kind. */
const PHASE_INDEX: Record<EventKind, number> = {
  mss: 1,
  lcq: 3,
  worlds: 0,
}

/**
 * Fetches every player's stats in parallel (season-scoped, falling back to
 * season-agnostic for accounts with no season data) and maps each to an
 * `EventPlayer`: phase Elo, best/avg completion times, and ranked W–L.
 * `avgTimeMs` is total completion time over completion count (0 if none).
 */
export async function enrichEventPlayers(
  raw: Event,
  kind: EventKind,
  season: number,
): Promise<EventPlayer[]> {
  const phaseIndex = PHASE_INDEX[kind]
  const results = await Promise.allSettled(raw.players.map((p) => fetchUser(p.uuid, season)))

  return Promise.all(
    raw.players.map(async (p, i) => {
      let u: Awaited<ReturnType<typeof fetchUser>>
      if (results[i].status === 'fulfilled') {
        u = results[i].value
      } else {
        // Season-specific fetch failed (e.g. retired account with no season stats); fall back to season-agnostic
        u = await fetchUser(p.uuid)
      }

      const phase = u.seasonResult?.phases[phaseIndex] ?? u.seasonResult?.last
      const played = u.statistics.season.playedMatches.ranked
      const completions = u.statistics.season.completions.ranked!
      const completionTime = u.statistics.season.completionTime.ranked!

      return {
        uuid: p.uuid,
        nickname: u.nickname,
        country: p.country,
        eloRate: phase?.eloRate ?? 0,
        eloRank: phase?.eloRank ?? null,
        bestTimeMs: u.statistics.season.bestTime.ranked ?? 0,
        avgTimeMs: completions > 0 ? completionTime / completions : 0,
        wins: u.statistics.season.wins.ranked!,
        losses: u.statistics.season.loses.ranked!,
        playedMatches: played!,
        forfeits: u.statistics.season.forfeits.ranked!,
      }
    }),
  )
}
