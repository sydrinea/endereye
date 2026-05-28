'use server'

import { cookies } from 'next/headers'
import { revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  fetchMatch,
  fetchPhaseLeaderboard,
  fetchCurrentSeason,
  buildEvent,
  computeBonusMap,
  enrichEventPlayers,
} from '@endereye/core'
import type { EventKind, Match, EventPlayer, RawOverrides } from '@endereye/core'
import { getR2Object, putR2Object, deleteR2Object } from '../../lib/r2'
import { putR2EventsConfig, type R2EventConfig } from '../../lib/events-config'

export async function loginAction(_prevState: unknown, formData: FormData) {
  const secret = formData.get('secret') as string
  if (!process.env.DASHBOARD_SECRET) throw new Error('DASHBOARD_SECRET not configured')
  if (secret !== process.env.DASHBOARD_SECRET) {
    return { error: 'Invalid secret' }
  }
  const cookieStore = await cookies()
  cookieStore.set('dashboard_auth', secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  redirect('/dashboard')
}

export async function uploadMatchesAction(
  season: number,
  prefix: string,
  matchIds: number[],
  noBonus: boolean,
  kind: EventKind,
  qualifyCount?: number,
): Promise<{ ok: true; matchCount: number; newCount: number } | { ok: false; error: string }> {
  if (matchIds.length === 0) return { ok: false, error: 'No match IDs provided' }

  let newMatches: Match[]
  try {
    newMatches = await Promise.all(matchIds.map((id) => fetchMatch(id)))
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to fetch matches' }
  }

  const existing = (await getR2Object<Match[]>(`${prefix}.raw.json`)) ?? []

  // Merge + deduplicate by id, sort ascending (ID order = chronological)
  const byId = new Map([...existing, ...newMatches].map((m) => [m.id, m]))
  const allMatches = [...byId.values()].sort((a, b) => a.id - b.id)

  const bonusMap = noBonus
    ? new Map(allMatches[0].players.map((p) => [p.uuid, 0]))
    : computeBonusMap(
        allMatches,
        await fetchPhaseLeaderboard(season, season === (await fetchCurrentSeason())),
      )

  const event = buildEvent(allMatches, bonusMap)

  const existingPlayers = await getR2Object<EventPlayer[]>(`${prefix}.players.json`)

  const updatedPlayers = await (async () => {
    if (existingPlayers === null) {
      return enrichEventPlayers(event, kind, season)
    }
    const knownUuids = new Set(existingPlayers.map((p) => p.uuid))
    const newUuids = event.players.filter((p) => !knownUuids.has(p.uuid))
    if (newUuids.length === 0) return existingPlayers
    const enriched = await enrichEventPlayers({ ...event, players: newUuids }, kind, season)
    return [...existingPlayers, ...enriched]
  })()

  await Promise.all([
    putR2Object(`${prefix}.raw.json`, allMatches),
    putR2Object(`${prefix}.event.json`, { ...event, qualifyCount }),
    putR2Object(`${prefix}.players.json`, updatedPlayers),
  ])

  revalidateTag(`event:${prefix}`, 'max')

  return { ok: true, matchCount: allMatches.length, newCount: newMatches.length }
}

export async function getEventMatchIdsAction(prefix: string): Promise<number[]> {
  const raw = await getR2Object<Match[]>(`${prefix}.raw.json`)
  if (!raw) return []
  return raw.map((m) => m.id).sort((a, b) => a - b)
}

export async function deleteMatchAction(
  season: number,
  prefix: string,
  matchId: number,
  noBonus: boolean,
  qualifyCount?: number,
): Promise<{ ok: true; matchCount: number } | { ok: false; error: string }> {
  const existing = await getR2Object<Match[]>(`${prefix}.raw.json`)
  if (!existing) return { ok: false, error: 'No match data found in R2' }

  const remaining = existing.filter((m) => m.id !== matchId)

  if (remaining.length === 0) {
    await Promise.all([
      putR2Object(`${prefix}.raw.json`, []),
      deleteR2Object(`${prefix}.event.json`),
    ])
  } else {
    const bonusMap = noBonus
      ? new Map(remaining[0].players.map((p) => [p.uuid, 0]))
      : computeBonusMap(remaining, await fetchPhaseLeaderboard(season, season >= 11))
    const event = buildEvent(remaining, bonusMap)
    await Promise.all([
      putR2Object(`${prefix}.raw.json`, remaining),
      putR2Object(`${prefix}.event.json`, { ...event, qualifyCount }),
    ])
  }

  revalidateTag(`event:${prefix}`, 'max')

  return { ok: true, matchCount: remaining.length }
}

export async function updateEventsConfigAction(
  configJson: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let parsed: R2EventConfig[]
  try {
    parsed = JSON.parse(configJson) as R2EventConfig[]
    if (!Array.isArray(parsed)) throw new Error('Config must be a JSON array')
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' }
  }
  await putR2EventsConfig(parsed)
  revalidateTag('events-config', 'max')
  return { ok: true }
}

export async function deleteEventAction(
  slug: string,
): Promise<{ ok: true; configJson: string } | { ok: false; error: string }> {
  const { getR2EventsConfig } = await import('../../lib/events-config')
  const configs = await getR2EventsConfig()
  if (!configs) return { ok: false, error: 'No events config found in R2' }
  const updated = configs.filter((e) => e.slug !== slug)
  await putR2EventsConfig(updated)
  revalidateTag('events-config', 'max')
  return { ok: true, configJson: JSON.stringify(updated, null, 2) }
}

export interface EventOverrideData {
  players: Array<{ uuid: string; nickname: string; seedScores: Array<number | null> }>
  overrides: RawOverrides
}

export async function getEventDataForOverridesAction(
  prefix: string,
): Promise<EventOverrideData | { error: string }> {
  interface StoredEvent {
    brackets: Array<{ uuid: string; completions: Array<{ place: number; score: number } | null> }>
  }
  const [eventData, playersData, rawOverrides] = await Promise.all([
    getR2Object<StoredEvent>(`${prefix}.event.json`),
    getR2Object<EventPlayer[]>(`${prefix}.players.json`),
    getR2Object<RawOverrides>(`${prefix}.overrides.json`),
  ])
  if (!eventData) return { error: 'No event data found' }

  const playerMap = new Map((playersData ?? []).map((p) => [p.uuid, p.nickname]))

  const players = eventData.brackets.map((b) => ({
    uuid: b.uuid,
    nickname: playerMap.get(b.uuid) ?? b.uuid,
    seedScores: b.completions.map((c) => (c ? c.score : null)),
  }))

  return { players, overrides: rawOverrides ?? {} }
}

export async function saveOverridesAction(
  prefix: string,
  overrides: RawOverrides,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await putR2Object(`${prefix}.overrides.json`, overrides)
  revalidateTag(`event:${prefix}`, 'max')
  return { ok: true }
}
