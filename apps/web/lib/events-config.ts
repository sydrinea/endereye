/**
 * The event index — one row per event (official or host-run) in the D1 `events`
 * table. Event *data* (brackets, players, overrides, cached views) lives in R2,
 * keyed by `prefix`.
 *
 * Official events are the `events` rows whose owner has `handle = 'official'`;
 * host events are scoped by handle. Row loaders are `React.cache`d — one D1 fetch
 * per render no matter how many callers ask, no cross-request cache (so
 * `selectActiveEvent` always sees the current index the moment a row changes).
 */
import { eq } from 'drizzle-orm'
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { fetchCurrentSeason } from '@endereye/core'
import { db, schema } from './db'
import type { EventRow } from './schema'

/**
 * The current MCSR Ranked season number, cached 6h (it changes ~every 2 months).
 * Used only for form defaults — callers should `.catch()` with a local fallback.
 */
export const getCurrentSeason = unstable_cache(fetchCurrentSeason, ['mcsr-current-season'], {
  revalidate: 21_600,
})

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

/** Official event rows in one D1 round-trip (join on `user.handle = 'official'`). */
const loadOfficialRows = cache(async (): Promise<EventConfig[]> => {
  const rows = await db
    .select()
    .from(schema.events)
    .innerJoin(schema.user, eq(schema.events.hostId, schema.user.id))
    .where(eq(schema.user.handle, 'official'))
  return rows.map((r) => rowToConfig(r.events, 'official'))
})

const hostIdByHandle = cache(async (handle: string): Promise<string | null> => {
  const rows = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.handle, handle))
    .limit(1)
  return rows[0]?.id ?? null
})

const loadHostRowsById = cache(
  async (hostId: string, handle: string): Promise<EventConfig[]> => {
    const rows = await db.select().from(schema.events).where(eq(schema.events.hostId, hostId))
    return rows.map((r) => rowToConfig(r, handle))
  },
)

async function loadHostRows(handle: string): Promise<EventConfig[]> {
  const id = await hostIdByHandle(handle)
  return id ? loadHostRowsById(id, handle) : []
}

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

export const getHostByHandle = cache(async (handle: string): Promise<Host | null> => {
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
})

function filterHostEvents(events: EventConfig[], includeUnpublished: boolean): EventConfig[] {
  return includeUnpublished ? events : events.filter(isVisible)
}

/** All of a host's events. `includeUnpublished` for the host's own manage view. */
export async function getHostEvents(
  handle: string,
  includeUnpublished = false,
): Promise<EventConfig[]> {
  return filterHostEvents(await loadHostRows(handle), includeUnpublished)
}

/** Same as `getHostEvents`, but skips the handle→id lookup — pass a resolved `Host`. */
export async function getHostEventsFor(
  host: Host,
  includeUnpublished = false,
): Promise<EventConfig[]> {
  return filterHostEvents(await loadHostRowsById(host.id, host.handle), includeUnpublished)
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
