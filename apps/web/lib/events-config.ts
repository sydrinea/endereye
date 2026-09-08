/**
 * The event index — one row per event (official or host-run) in the D1 `events`
 * table, replacing the old `config/events.json` R2 blob. Event *data* (brackets,
 * players, overrides, cached views) still lives in R2, keyed by `prefix`.
 *
 * Official events are owned by the `official` user (`getOwnerUserId()`); the
 * "official" queries here filter on that. Host events are scoped by handle.
 *
 * `loadOfficialRows` / `loadHostRows` are `React.cache`d so a single render does
 * one D1 fetch no matter how many callers ask. D1 reads are a ~50–150 ms HTTP
 * hop; if that ever bites we can add fetch-level tag caching in `d1Raw`. On a D1
 * error the official path falls back to the R2 config blob, which is still
 * written for exactly this reason (removed in a later cleanup phase).
 */
import { eq } from 'drizzle-orm'
import { cache } from 'react'
import { getOwnerUserId } from './auth'
import { db, schema } from './db'
import { getR2Object } from './r2'
import type { EventRow } from './schema'

export type EventKind = 'lcq' | 'worlds' | 'mss'
export const VALID_KINDS: readonly EventKind[] = ['lcq', 'worlds', 'mss']

export interface EventConfig {
  slug: string
  label: string
  kind: EventKind
  season: number
  prefix: string
  startDate: Date
  /** Canonical flat path for official events (`/lcq/11`, `/worlds/2026`); host events get `/@handle/slug`. */
  path: string
  endpoint?: string
  qualifyCount?: number
  noBonus?: boolean
  published?: boolean
  /** Owning user id. Absent only for the R2 fallback shape. */
  hostId?: string
  /** Owning user's handle (`official` for official events). */
  handle?: string
}

const CONFIG_KEY = 'config/events.json'

/** Route id for an event: season, except `worlds` which is keyed by start-date year. */
export function officialEventId(e: { kind: EventKind; season: number; startDate: Date }): number {
  return e.kind === 'worlds' ? e.startDate.getUTCFullYear() : e.season
}

export function buildOfficialPath(e: { kind: EventKind; season: number; startDate: Date }): string {
  return `/${e.kind}/${officialEventId(e)}`
}

function rowToConfig(row: EventRow, handle: string): EventConfig {
  const kind = row.kind as EventKind
  const startDate = new Date(row.startDate)
  const base = {
    slug: row.slug,
    label: row.label,
    kind,
    season: row.season,
    prefix: row.prefix,
    startDate,
    endpoint: row.endpoint ?? undefined,
    qualifyCount: row.qualifyCount ?? undefined,
    noBonus: row.noBonus || undefined,
    published: row.published,
    hostId: row.hostId,
    handle,
  }
  return {
    ...base,
    path: handle === 'official' ? buildOfficialPath(base) : `/@${handle}/${row.slug}`,
  }
}

/** R2 fallback: the old `config/events.json` shape → `EventConfig`. */
interface R2EventConfig {
  slug: string
  label: string
  kind: EventKind
  season: number
  prefix: string
  startDate: string
  path: string
  endpoint?: string
  qualifyCount?: number
  noBonus?: boolean
  published?: boolean
}

function r2ToConfig(e: R2EventConfig): EventConfig {
  return {
    slug: e.slug,
    label: e.label,
    kind: e.kind,
    season: e.season,
    prefix: e.prefix,
    startDate: new Date(e.startDate),
    path: e.path,
    endpoint: e.endpoint,
    qualifyCount: e.qualifyCount,
    noBonus: e.noBonus,
    published: e.published,
    handle: 'official',
  }
}

async function fallbackOfficial(): Promise<EventConfig[]> {
  const raw = await getR2Object<R2EventConfig[]>(CONFIG_KEY)
  return (raw ?? []).map(r2ToConfig)
}

const loadOfficialRows = cache(async (): Promise<EventConfig[]> => {
  const ownerId = await getOwnerUserId()
  if (!ownerId) return fallbackOfficial()
  try {
    const rows = await db.select().from(schema.events).where(eq(schema.events.hostId, ownerId))
    return rows.map((r) => rowToConfig(r, 'official'))
  } catch (err) {
    console.error('[events-config] D1 read failed, falling back to R2 config:', err)
    return fallbackOfficial()
  }
})

const loadHostRows = cache(async (handle: string): Promise<EventConfig[]> => {
  const host = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.handle, handle))
    .limit(1)
  if (!host[0]) return []
  const rows = await db.select().from(schema.events).where(eq(schema.events.hostId, host[0].id))
  return rows.map((r) => rowToConfig(r, handle))
})

function isVisible(e: EventConfig): boolean {
  // "Unlisted" (published === false) is kept off every list — home, archive,
  // gen-career, the active-event window, other hosts' public profile grids —
  // but the event page itself is still reachable by direct link. Absent
  // `published` means listed. Same behavior in every environment.
  return e.published !== false
}

// ---------------------------------------------------------------------------
// Official surface — home, archive, gen-career, the autofetch cron
// ---------------------------------------------------------------------------

export async function getAllEvents(): Promise<EventConfig[]> {
  return (await loadOfficialRows()).filter(isVisible)
}

/**
 * The soonest event whose start date is within the last 7 days or still in the
 * future. **Pure window logic — no visibility filter**: it decides the Live/Final
 * status of an event's own page (which stays reachable while unlisted). The
 * public wrappers (`getActiveEvent` for the home page) pre-filter to listed.
 */
export function selectActiveEvent(events: EventConfig[], now = new Date()): EventConfig | null {
  const cutoff = new Date(now)
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - 7)

  return (
    events
      .filter((e) => e.startDate >= cutoff)
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0] ?? null
  )
}

/** The event the cron syncs: started on or before now, no earlier than local midnight today. */
export function selectStrictlyActiveEvent(
  events: EventConfig[],
  now = new Date(),
): EventConfig | null {
  const cutoff = new Date(now)
  cutoff.setHours(0, 0, 0, 0)

  return (
    events
      .filter((e) => e.startDate >= cutoff && e.startDate <= now)
      .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0] ?? null
  )
}

export async function getActiveEvent(): Promise<EventConfig | null> {
  return selectActiveEvent((await loadOfficialRows()).filter(isVisible))
}

export async function getStrictlyActiveEvent(): Promise<EventConfig | null> {
  return selectStrictlyActiveEvent((await loadOfficialRows()).filter(isVisible))
}

/**
 * One official event by slug, bypassing the published/visible filter. Callers
 * own their access control (the sync route gates on `DASHBOARD_SECRET`). Used to
 * trigger a manual / test sync of a named event regardless of visibility.
 */
export async function getEventBySlug(slug: string): Promise<EventConfig | null> {
  const all = await loadOfficialRows()
  return all.find((e) => e.slug === slug) ?? null
}

// ---------------------------------------------------------------------------
// Host surface
// ---------------------------------------------------------------------------

export interface Host {
  id: string
  handle: string
  name: string
  image: string | null
}

export async function getHostByHandle(handle: string): Promise<Host | null> {
  const rows = await db
    .select({
      id: schema.user.id,
      handle: schema.user.handle,
      name: schema.user.name,
      image: schema.user.image,
    })
    .from(schema.user)
    .where(eq(schema.user.handle, handle))
    .limit(1)
  const h = rows[0]
  return h && h.handle ? { id: h.id, handle: h.handle, name: h.name, image: h.image } : null
}

/** All of a host's events. `includeUnpublished` for the host's own manage view. */
export async function getHostEvents(
  handle: string,
  includeUnpublished = false,
): Promise<EventConfig[]> {
  const events = await loadHostRows(handle)
  return includeUnpublished ? events : events.filter(isVisible)
}

export async function getHostEventBySlug(
  handle: string,
  slug: string,
): Promise<EventConfig | null> {
  const events = await loadHostRows(handle)
  return events.find((e) => e.slug === slug) ?? null
}

// ---------------------------------------------------------------------------
// Shared resolver — the single place route params become an event
// ---------------------------------------------------------------------------

export interface EventDescriptor {
  event: EventConfig
  kind: EventKind
  season: number
  prefix: string
  qualifyCount?: number
  label: string
  basePath: string
  /** This event is the currently-active official event (caller ANDs with `currentRound <= 10`). */
  isActive: boolean
}

function defaultLabel(kind: EventKind, id: number): string {
  if (kind === 'worlds') return `${id} World Championships`
  return `${kind.toUpperCase()} Season ${id}`
}

export async function resolveEventDescriptor(
  input: { kind: string; id: number } | { handle: string; slug: string },
): Promise<EventDescriptor | null> {
  let event: EventConfig | null
  let basePath: string
  let labelId: number

  // The "active" event to compare against — official events use the global
  // active-event window; host events use `selectActiveEvent` over that host's
  // own events (custom events never appear in the official window).
  let active: EventConfig | null

  if ('handle' in input) {
    event = await getHostEventBySlug(input.handle, input.slug)
    if (!event) return null
    basePath = `/@${input.handle}/${input.slug}`
    labelId = event.season
    // Unfiltered — Live/Final is about timing, not listing.
    active = selectActiveEvent(await getHostEvents(input.handle, true))
  } else {
    const kind = input.kind
    if (!VALID_KINDS.includes(kind as EventKind)) return null
    const all = await loadOfficialRows()
    // Not visibility-filtered: an unlisted event's own page is still reachable
    // by direct link, it's just kept off the lists.
    event = all.find((e) => e.kind === kind && officialEventId(e) === input.id) ?? null
    if (!event) return null
    basePath = `/${kind}/${input.id}`
    labelId = input.id
    // Unfiltered — an unlisted official event still shows Live while it's running.
    active = selectActiveEvent(all)
  }

  return {
    event,
    kind: event.kind,
    season: event.season,
    prefix: event.prefix,
    qualifyCount: event.qualifyCount,
    label: event.label || defaultLabel(event.kind, labelId),
    basePath,
    isActive: active?.prefix === event.prefix,
  }
}
