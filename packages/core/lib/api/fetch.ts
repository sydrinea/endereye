/* eslint-disable @typescript-eslint/no-explicit-any */
import { FetchError } from '../errors'
import {
  LeaderboardSchema,
  Match,
  MatchSchema,
  PhaseLeaderboard,
  PhaseLeaderboardSchema,
  User,
  UserSchema,
} from './types'

const API_BASE = {
  MCSR_PUBLIC: 'https://api.mcsrranked.com',
  MCSR_WEB_API: 'https://mcsrranked.com/api',
} as const

const LEADERBOARD_ROUTE = `${API_BASE.MCSR_PUBLIC}/leaderboard` as const

export async function fetchCurrentSeason(): Promise<number> {
  const res = await fetch(LEADERBOARD_ROUTE)
  if (!res.ok) throw new FetchError(`[${LEADERBOARD_ROUTE}] Failed to fetch: ${res.status}`)
  const json = (await res.json()) as any
  const data = LeaderboardSchema.parse(json.data)
  return data.season.number
}

const ROUTES = {
  MATCH_INFO: (id: number) => `${API_BASE.MCSR_PUBLIC}/matches/${id}`,
  PHASE_LEADERBOARD: (season: number, predicted?: boolean) =>
    `${API_BASE.MCSR_PUBLIC}/phase-leaderboard?season=${season}&predicted=${predicted || 'false'}`,
  USER_SEASON_STATS: (uuid: string, season?: number) =>
    season != null
      ? `${API_BASE.MCSR_PUBLIC}/users/${uuid}?season=${season}`
      : `${API_BASE.MCSR_PUBLIC}/users/${uuid}`,
} as const

export async function fetchUser(uuid: string, season?: number): Promise<User> {
  const url = ROUTES.USER_SEASON_STATS(uuid, season)
  const res = await fetch(url)
  if (!res.ok) throw new FetchError(`[${url}] Failed to fetch: ${res.status}`)
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
