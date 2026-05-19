import { FetchError } from '../errors'
import { Event, EventKind, EventSchema, User, UserSchema } from './types'

export const API_BASE = {
  MCSR_PUBLIC: 'https://api.mcsrranked.com',
  MCSR_WEB_API: 'https://mcsrranked.com/api',
} as const

export const ROUTES = {
  USER_SEASON_STATS: (uuid: string, season: number) =>
    `${API_BASE.MCSR_PUBLIC}/users/${uuid}?season=${season}`,
  EVENT_DATA: (kind: EventKind, season: number) => {
    const prefix = kind === 'lcq' ? 'qualifiers' : 'showdown'
    return `${API_BASE.MCSR_WEB_API}/tourneys/${prefix}_s${season}`
  },
} as const

export async function fetchEvent(kind: EventKind, season: number): Promise<Event> {
  const res = await fetch(ROUTES.EVENT_DATA(kind, season))
  if (!res.ok)
    throw new FetchError(`[${ROUTES.EVENT_DATA(kind, season)}] Failed to fetch: ${res.status}`)
  const json = await res.json()
  return EventSchema.parse(json.data)
}

export async function fetchUser(uuid: string, season: number): Promise<User> {
  const res = await fetch(ROUTES.USER_SEASON_STATS(uuid, season))
  if (!res.ok)
    throw new FetchError(
      `[${ROUTES.USER_SEASON_STATS(uuid, season)}] Failed to fetch: ${res.status}`,
    )
  const json = await res.json()
  const data = UserSchema.parse(json.data)
  return data
}
