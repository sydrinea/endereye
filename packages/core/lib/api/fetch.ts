/* eslint-disable @typescript-eslint/no-explicit-any */
import { FetchError } from '../errors'
import {
  Match,
  MatchFilter,
  MatchList,
  MatchListSchema,
  MatchSchema,
  PhaseLeaderboard,
  PhaseLeaderboardSchema,
  User,
  UserSchema,
} from './types'

export const API_BASE = {
  MCSR_PUBLIC: 'https://api.mcsrranked.com',
  MCSR_WEB_API: 'https://mcsrranked.com/api',
} as const

const OLDEST_MATCH_ID = 100876

export const ROUTES = {
  MATCHES: (filter?: MatchFilter) => {
    const queryString = filter
      ? new URLSearchParams(
          Object.entries(filter).map(([key, value]) => [key, String(value)]),
        ).toString()
      : ''
    return `${API_BASE.MCSR_PUBLIC}/matches?${queryString}`
  },
  MATCH_INFO: (id: number) => `${API_BASE.MCSR_PUBLIC}/matches/${id}`,
  PHASE_LEADERBOARD: (season: number, predicted?: boolean) =>
    `${API_BASE.MCSR_PUBLIC}/phase-leaderboard?season=${season}&predicted=${predicted || 'false'}`,
  USER_SEASON_STATS: (uuid: string, season: number) =>
    `${API_BASE.MCSR_PUBLIC}/users/${uuid}?season=${season}`,
} as const

export async function fetchUser(uuid: string, season: number): Promise<User> {
  const res = await fetch(ROUTES.USER_SEASON_STATS(uuid, season))
  if (!res.ok)
    throw new FetchError(
      `[${ROUTES.USER_SEASON_STATS(uuid, season)}] Failed to fetch: ${res.status}`,
    )
  const json = (await res.json()) as any
  const data = UserSchema.parse(json.data)
  return data
}

export async function fetchMatch(id: number): Promise<Match> {
  const res = await fetch(ROUTES.MATCH_INFO(id))
  if (!res.ok) throw new FetchError(`[${ROUTES.MATCH_INFO(id)}] Failed to fetch: ${res.status}`)
  const json = (await res.json()) as any
  const data = MatchSchema.parse(json.data)
  return data
}

export async function fetchPhaseLeaderboard(
  season: number,
  predicted?: boolean,
): Promise<PhaseLeaderboard> {
  const res = await fetch(ROUTES.PHASE_LEADERBOARD(season, predicted))
  if (!res.ok)
    throw new FetchError(
      `[${ROUTES.PHASE_LEADERBOARD(season, predicted)}] Failed to fetch: ${res.status}`,
    )
  const json = (await res.json()) as any
  const data = PhaseLeaderboardSchema.parse(json.data)
  return data
}

export async function fetchLatestMatchId(): Promise<number> {
  const res = await fetch(ROUTES.MATCHES())
  if (!res.ok) throw new FetchError(`[${ROUTES.MATCHES()}] Failed to fetch: ${res.status}`)
  const json = (await res.json()) as any
  const data = MatchListSchema.parse(json.data)
  return data[0].id
}

async function fetchMatches(filter: MatchFilter): Promise<MatchList> {
  const res = await fetch(ROUTES.MATCHES(filter))
  if (!res.ok) throw new FetchError(`[${ROUTES.MATCHES(filter)}] Failed to fetch: ${res.status}`)
  const json = (await res.json()) as any
  const data = MatchListSchema.parse(json.data)
  return data
}

export async function findMatchIdForDate(targetDate: Date): Promise<number> {
  let hi = await fetchLatestMatchId()
  let lo = OLDEST_MATCH_ID

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    console.log(`Checking range [${lo}, ${hi}] (midpoint=${mid})`)
    const match = await fetchMatch(mid)
    if (!match.date) throw new Error(`Match ${mid} has no associated date field`)
    if (match.date < targetDate.getTime() / 1000) lo = mid + 1
    else hi = mid
  }
  return lo
}

export async function fetchEventMatches(
  bounds: Required<Pick<MatchFilter, 'before' | 'after'>>,
): Promise<Match[]> {
  const results: Match[] = []
  let cursor = bounds.before

  while (cursor > bounds.after) {
    const batch = await fetchMatches({ before: cursor, after: bounds.after, count: 100 })
    if (batch.length === 0) break
    console.log(
      `batch[${bounds.after}, ${cursor}]: ${batch.length} (discovered ${results.length} matches)`,
    )

    for (const match of batch) {
      if (
        !match.forfeited &&
        match.spectators.length > 0 &&
        match.spectators.map((s) => s.nickname).includes('RED_LIME')
      ) {
        console.log(`fetch[${match.id}]: detailed match info`)
        results.unshift(await fetchMatch(match.id))
      }
    }

    cursor = batch[batch.length - 1].id
  }

  return results
}
