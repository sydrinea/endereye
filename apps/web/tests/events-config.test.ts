// Event selection tests.
//
// The window logic (`selectActiveEvent` / `selectStrictlyActiveEvent`) is pure and
// tested directly on EventConfig fixtures. The async wrappers + `getEventBySlug`
// go through `loadOfficialRows`; we mock `@/lib/db` to return fake `events` rows
// from its joined query, so these exercise the real D1 code path.
//
// System time is pinned to 2026-09-15T18:00:00Z; fixture start dates are spaced so
// the local-midnight cutoff can't flip a boundary in any real timezone.
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { EventConfig, EventKind } from '@/lib/events-config'

const { rows } = vi.hoisted(() => ({ rows: { current: [] as Record<string, unknown>[] } }))

vi.mock('@/lib/db', () => ({
  schema: { events: {}, user: {} },
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => Promise.resolve(rows.current.map((events) => ({ events }))),
        }),
      }),
    }),
  },
}))

import {
  selectActiveEvent,
  selectStrictlyActiveEvent,
  officialEventId,
  buildOfficialPath,
  getStrictlyActiveEvent,
  getActiveEvent,
  getEventBySlug,
} from '@/lib/events-config'

const NOW = new Date('2026-09-15T18:00:00Z')

type Fixture = {
  slug: string
  startDate: string
  kind?: EventKind
  season?: number
  published?: boolean
}

/** EventConfig fixture for the pure selectors. */
function cfg(f: Fixture): EventConfig {
  const kind = f.kind ?? 'lcq'
  return {
    slug: f.slug,
    label: f.slug,
    kind,
    season: f.season ?? 11,
    prefix: `x/${f.slug}`,
    startDate: new Date(f.startDate),
    path: `/x/${f.slug}`,
    published: f.published,
    handle: 'official',
  }
}

/** D1 `events` row fixture (what the joined query returns as `{ events }`). */
function row(f: Fixture): Record<string, unknown> {
  return {
    id: f.slug,
    hostId: 'owner',
    slug: f.slug,
    label: f.slug,
    kind: f.kind ?? 'lcq',
    season: f.season ?? 11,
    prefix: `x/${f.slug}`,
    startDate: f.startDate,
    qualifyCount: null,
    noBonus: false,
    published: f.published ?? true,
    endpoint: null,
  }
}

const setOfficial = (events: Fixture[]) => {
  rows.current = events.map(row)
}

const IN_WINDOW_EARLY: Fixture = { slug: 'today-early', startDate: '2026-09-15T12:00:00Z' }
const IN_WINDOW_LATE: Fixture = { slug: 'today-late', startDate: '2026-09-15T16:00:00Z' }
const FUTURE: Fixture = { slug: 'future', startDate: '2026-09-16T12:00:00Z' }
const RECENT_PAST: Fixture = { slug: 'recent-past', startDate: '2026-09-13T00:00:00Z' }
const OLD: Fixture = { slug: 'old', startDate: '2026-08-01T00:00:00Z' }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  rows.current = []
})
afterEach(() => {
  vi.useRealTimers()
})

describe('selectStrictlyActiveEvent (pure)', () => {
  it('returns null for an empty list', () => {
    expect(selectStrictlyActiveEvent([], NOW)).toBeNull()
  })

  it('excludes events that have not started yet', () => {
    expect(selectStrictlyActiveEvent([cfg(FUTURE)], NOW)).toBeNull()
  })

  it('excludes events that started before today', () => {
    expect(selectStrictlyActiveEvent([cfg(RECENT_PAST), cfg(OLD)], NOW)).toBeNull()
  })

  it('returns the most-recently-started event that is under way', () => {
    const active = selectStrictlyActiveEvent(
      [cfg(IN_WINDOW_EARLY), cfg(IN_WINDOW_LATE), cfg(FUTURE), cfg(RECENT_PAST)],
      NOW,
    )
    expect(active?.slug).toBe('today-late')
  })
})

describe('selectActiveEvent (pure)', () => {
  it('keeps the most recent event visible for 7 days, earliest-in-window first', () => {
    expect(selectActiveEvent([cfg(RECENT_PAST), cfg(FUTURE)], NOW)?.slug).toBe('recent-past')
  })

  it('drops events older than 7 days', () => {
    expect(selectActiveEvent([cfg(OLD)], NOW)).toBeNull()
  })
})

describe('async wrappers (D1)', () => {
  it('getStrictlyActiveEvent returns null when there are no events', async () => {
    setOfficial([])
    expect(await getStrictlyActiveEvent()).toBeNull()
  })

  it('getStrictlyActiveEvent hydrates startDate to a Date', async () => {
    setOfficial([IN_WINDOW_EARLY, IN_WINDOW_LATE, FUTURE, RECENT_PAST])
    const active = await getStrictlyActiveEvent()
    expect(active?.slug).toBe('today-late')
    expect(active?.startDate).toBeInstanceOf(Date)
  })

  it('getActiveEvent applies the 7-day window', async () => {
    setOfficial([RECENT_PAST, FUTURE])
    expect((await getActiveEvent())?.slug).toBe('recent-past')
  })

  it('getActiveEvent returns null when everything is older than 7 days', async () => {
    setOfficial([OLD])
    expect(await getActiveEvent()).toBeNull()
  })

  it('unlisted events are hidden from the active window but resolvable by slug', async () => {
    setOfficial([
      IN_WINDOW_EARLY,
      { slug: 'hidden-live', startDate: '2026-09-15T12:00:00Z', published: false },
    ])
    expect((await getStrictlyActiveEvent())?.slug).toBe('today-early')
    expect((await getEventBySlug('hidden-live'))?.slug).toBe('hidden-live')
  })

  it('getEventBySlug resolves an event, hydrates its date, and returns null for unknown slugs', async () => {
    setOfficial([IN_WINDOW_EARLY])
    expect((await getEventBySlug('today-early'))?.startDate).toEqual(
      new Date('2026-09-15T12:00:00Z'),
    )
    expect(await getEventBySlug('nope')).toBeNull()
  })
})

describe('official id / path mapping', () => {
  it('keys lcq/mss by season', () => {
    const e = cfg({ slug: 'lcq-s11', startDate: '2026-08-01T00:00:00Z', kind: 'lcq', season: 11 })
    expect(officialEventId(e)).toBe(11)
    expect(buildOfficialPath(e)).toBe('/lcq/11')
  })

  it('keys worlds by start-date year, not season', () => {
    const e = cfg({
      slug: 'worlds-2026',
      startDate: '2026-11-10T16:00:00Z',
      kind: 'worlds',
      season: 11,
    })
    expect(officialEventId(e)).toBe(2026)
    expect(buildOfficialPath(e)).toBe('/worlds/2026')
  })
})
