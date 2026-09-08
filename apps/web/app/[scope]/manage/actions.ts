'use server'

import {
  fetchMatch,
  fetchPhaseLeaderboard,
  fetchCurrentSeason,
  buildEvent,
  computeBonusMap,
  enrichEventPlayers,
} from '@endereye/core'
import type { Match, EventPlayer, RawOverrides } from '@endereye/core'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { getR2Object, putR2Object, deleteR2Object, deleteR2CachedViews } from '@/lib/r2'
import {
  getHostEventBySlug,
  VALID_KINDS,
  type EventConfig,
  type EventKind,
} from '@/lib/events-config'
import { db, schema } from '@/lib/db'
import { getSessionUser, type SessionUser } from '@/lib/auth'

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/
const RESERVED_SLUGS = new Set(['manage', 'seed', 'new', 'edit'])

/** Session user iff they own `handle`, else null. */
async function authHost(handle: string): Promise<SessionUser | null> {
  const user = await getSessionUser()
  return user && user.handle === handle ? user : null
}

/** Session user + the named event, iff the user owns the handle and the event exists. */
async function ownEvent(
  handle: string,
  slug: string,
): Promise<{ user: SessionUser; event: EventConfig } | { error: string }> {
  const user = await authHost(handle)
  if (!user) return { error: 'Forbidden' }
  const event = await getHostEventBySlug(handle, slug)
  if (!event) return { error: 'Event not found' }
  return { user, event }
}

function revalidateEvent(event: EventConfig) {
  revalidatePath('/', 'layout')
  revalidatePath(event.path)
}

// ---------------------------------------------------------------------------
// Event CRUD (D1 rows)
// ---------------------------------------------------------------------------

export interface EventInput {
  slug: string
  label: string
  season: number
  startDate: string
  qualifyCount?: number | null
  noBonus?: boolean
  published?: boolean
  /** lcq | mss for any host; worlds is official-only. Create-only (not editable). */
  kind?: EventKind
  /** official only */
  endpoint?: string | null
}

export async function createEventAction(handle: string, input: EventInput): Promise<Result> {
  const user = await authHost(handle)
  if (!user) return { ok: false, error: 'Forbidden' }

  const slug = input.slug.trim().toLowerCase()
  if (!SLUG_RE.test(slug) || RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: 'Slug must be 3–50 chars: lowercase letters, digits, hyphens.' }
  }
  if (!input.label.trim()) return { ok: false, error: 'Label is required.' }
  if (await getHostEventBySlug(handle, slug)) {
    return { ok: false, error: `You already have an event "${slug}".` }
  }

  const isOfficial = handle === 'official'
  // Custom hosts choose lcq or mss (both drive a valid PHASE_INDEX); worlds is official-only.
  const allowedKinds: EventKind[] = isOfficial ? [...VALID_KINDS] : ['lcq', 'mss']
  const kind: EventKind = input.kind ?? 'mss'
  if (!allowedKinds.includes(kind)) {
    return { ok: false, error: `Invalid kind "${kind}".` }
  }
  const prefix = isOfficial ? `${kind}/${input.season}` : `hosts/${handle}/${slug}`

  await db.insert(schema.events).values({
    id: crypto.randomUUID(),
    hostId: user.id,
    slug,
    label: input.label.trim(),
    kind,
    season: input.season,
    prefix,
    qualifyCount: input.qualifyCount ?? null,
    noBonus: input.noBonus ?? false,
    startDate: new Date(input.startDate).toISOString(),
    published: input.published ?? true,
    endpoint: isOfficial ? (input.endpoint ?? null) : null,
  })

  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function updateEventAction(
  handle: string,
  slug: string,
  patch: Partial<Omit<EventInput, 'slug' | 'kind'>>,
): Promise<Result> {
  const owned = await ownEvent(handle, slug)
  if ('error' in owned) return { ok: false, error: owned.error }

  const isOfficial = handle === 'official'
  const set: Record<string, unknown> = {}
  if (patch.label !== undefined) {
    if (!patch.label.trim()) return { ok: false, error: 'Label is required.' }
    set.label = patch.label.trim()
  }
  if (patch.season !== undefined) set.season = patch.season
  if (patch.startDate !== undefined) set.startDate = new Date(patch.startDate).toISOString()
  if (patch.qualifyCount !== undefined) set.qualifyCount = patch.qualifyCount ?? null
  if (patch.noBonus !== undefined) set.noBonus = patch.noBonus
  if (patch.published !== undefined) set.published = patch.published
  if (isOfficial && patch.endpoint !== undefined) set.endpoint = patch.endpoint ?? null

  if (Object.keys(set).length === 0) return { ok: true }

  await db.update(schema.events).set(set).where(eq(schema.events.prefix, owned.event.prefix))
  revalidateEvent(owned.event)
  return { ok: true }
}

export async function deleteEventAction(handle: string, slug: string): Promise<Result> {
  const owned = await ownEvent(handle, slug)
  if ('error' in owned) return { ok: false, error: owned.error }

  await db
    .delete(schema.events)
    .where(and(eq(schema.events.hostId, owned.user.id), eq(schema.events.slug, slug)))
  revalidateEvent(owned.event)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Match upload (R2 blobs) — event identified by handle + slug, config read from D1
// ---------------------------------------------------------------------------

export async function getEventMatchIdsAction(handle: string, slug: string): Promise<number[]> {
  const owned = await ownEvent(handle, slug)
  if ('error' in owned) return []
  const raw = await getR2Object<Match[]>(`${owned.event.prefix}.raw.json`)
  return raw ? raw.map((m) => m.id).sort((a, b) => a - b) : []
}

export async function uploadMatchesAction(
  handle: string,
  slug: string,
  matchIds: number[],
): Promise<Result<{ matchCount: number; newCount: number }>> {
  const owned = await ownEvent(handle, slug)
  if ('error' in owned) return { ok: false, error: owned.error }
  const { prefix, season, noBonus, kind, qualifyCount } = owned.event
  if (matchIds.length === 0) return { ok: false, error: 'No match IDs provided' }

  let newMatches: Match[]
  try {
    newMatches = await Promise.all(matchIds.map((id) => fetchMatch(id)))
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to fetch matches' }
  }

  const existing = (await getR2Object<Match[]>(`${prefix}.raw.json`)) ?? []
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
    if (existingPlayers === null) return enrichEventPlayers(event, kind, season)
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
  await deleteR2CachedViews(prefix)
  revalidateEvent(owned.event)

  return { ok: true, matchCount: allMatches.length, newCount: newMatches.length }
}

export async function deleteMatchAction(
  handle: string,
  slug: string,
  matchId: number,
): Promise<Result<{ matchCount: number }>> {
  const owned = await ownEvent(handle, slug)
  if ('error' in owned) return { ok: false, error: owned.error }
  const { prefix, season, noBonus, qualifyCount } = owned.event

  const existing = await getR2Object<Match[]>(`${prefix}.raw.json`)
  if (!existing) return { ok: false, error: 'No match data found in R2' }
  const remaining = existing.filter((m) => m.id !== matchId)

  if (remaining.length === 0) {
    await Promise.all([putR2Object(`${prefix}.raw.json`, []), deleteR2Object(`${prefix}.event.json`)])
  } else {
    const bonusMap = noBonus
      ? new Map(remaining[0].players.map((p) => [p.uuid, 0]))
      : computeBonusMap(
          remaining,
          await fetchPhaseLeaderboard(season, season === (await fetchCurrentSeason())),
        )
    const event = buildEvent(remaining, bonusMap)
    await Promise.all([
      putR2Object(`${prefix}.raw.json`, remaining),
      putR2Object(`${prefix}.event.json`, { ...event, qualifyCount }),
    ])
  }

  await deleteR2CachedViews(prefix)
  revalidateEvent(owned.event)
  return { ok: true, matchCount: remaining.length }
}

// ---------------------------------------------------------------------------
// Overrides (R2 blob)
// ---------------------------------------------------------------------------

export interface EventOverrideData {
  players: Array<{ uuid: string; nickname: string; seedScores: Array<number | null> }>
  overrides: RawOverrides
}

export async function getEventDataForOverridesAction(
  handle: string,
  slug: string,
): Promise<EventOverrideData | { error: string }> {
  const owned = await ownEvent(handle, slug)
  if ('error' in owned) return { error: owned.error }
  const { prefix } = owned.event

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
  handle: string,
  slug: string,
  overrides: RawOverrides,
): Promise<Result> {
  const owned = await ownEvent(handle, slug)
  if ('error' in owned) return { ok: false, error: owned.error }

  await putR2Object(`${owned.event.prefix}.overrides.json`, overrides)
  await deleteR2CachedViews(owned.event.prefix)
  revalidateEvent(owned.event)
  return { ok: true }
}
