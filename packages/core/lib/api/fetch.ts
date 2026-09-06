/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Thin wrappers over the two MCSR Ranked API hosts. Each fetches one endpoint
 * through `getParsed`, which throws `FetchError` on a non-2xx response and
 * validates the `data` field against its Zod schema — so callers get a
 * fully-typed, known-shaped result or an exception, never a partial object.
 *
 * `api.mcsrranked.com` is the public API; `mcsrranked.com/api` is the web API
 * (currently unused here but kept for the base map).
 */
import type { ZodType } from 'zod'
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

const ROUTES = {
  MATCH_INFO: (id: number) => `${API_BASE.MCSR_PUBLIC}/matches/${id}`,
  PHASE_LEADERBOARD: (season: number, predicted?: boolean) =>
    `${API_BASE.MCSR_PUBLIC}/phase-leaderboard?season=${season}&predicted=${predicted || 'false'}`,
  USER_SEASON_STATS: (uuid: string, season?: number) =>
    season != null
      ? `${API_BASE.MCSR_PUBLIC}/users/${uuid}?season=${season}`
      : `${API_BASE.MCSR_PUBLIC}/users/${uuid}`,
} as const

/** GET `url`, throw `FetchError` on a bad status, and parse the response's `data` field with `schema`. */
async function getParsed<T>(url: string, schema: ZodType<T>): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new FetchError(`[${url}] Failed to fetch: ${res.status}`)
  const json = (await res.json()) as any
  return schema.parse(json.data)
}

/** The number of the ranked season currently in progress. */
export async function fetchCurrentSeason(): Promise<number> {
  const data = await getParsed(LEADERBOARD_ROUTE, LeaderboardSchema)
  return data.season.number
}

/** A user's stats, scoped to `season` when given, otherwise all-time/current. */
export function fetchUser(uuid: string, season?: number): Promise<User> {
  return getParsed(ROUTES.USER_SEASON_STATS(uuid, season), UserSchema)
}

/** One match by numeric id, including its per-player completions and timeline. */
export function fetchMatch(id: number): Promise<Match> {
  return getParsed(ROUTES.MATCH_INFO(id), MatchSchema)
}

/**
 * The season-phase leaderboard, used to derive carry-in bonus points.
 * @param predicted request the projected end-of-phase standings rather than current.
 */
export function fetchPhaseLeaderboard(
  season: number,
  predicted?: boolean,
): Promise<PhaseLeaderboard> {
  return getParsed(ROUTES.PHASE_LEADERBOARD(season, predicted), PhaseLeaderboardSchema)
}
