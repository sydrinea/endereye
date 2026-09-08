// Event selection tests.
//
// The window logic (`selectActiveEvent` / `selectStrictlyActiveEvent`) is pure
// and tested directly on EventConfig fixtures. The async wrappers + `getEventBySlug`
// go through `loadOfficialRows`, which — with no `official` user id — falls back
// to the R2 `config/events.json` blob; we mock `@/lib/auth` to force that path
// and feed fixtures through the R2 mock.
//
// System time is pinned to 2026-09-15T18:00:00Z; fixture start dates are spaced
// so the local-midnight cutoff can't flip a boundary in any real timezone.
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { EventConfig, EventKind } from '@/lib/events-config'
import {
  selectActiveEvent,
  selectStrictlyActiveEvent,
  officialEventId,
  buildOfficialPath,
} from '@/lib/events-config'

vi.mock('@/lib/auth', () => ({ getOwnerUserId: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/r2', () => ({ getR2Object: vi.fn(), putR2Object: vi.fn() }))

import { getR2Object } from '@/lib/r2'
import { getStrictlyActiveEvent, getActiveEvent, getEventBySlug } from '@/lib/events-config'

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

/** R2 `config/events.json` fixture for the async wrappers' fallback path. */
function r2(f: Fixture) {
  const kind = f.kind ?? 'lcq'
  return {
    slug: f.slug,
    label: f.slug,
    kind,
    season: f.season ?? 11,
    prefix: `x/${f.slug}`,
    path: `/x/${f.slug}`,
    startDate: f.startDate,
    ...(f.published !== undefined ? { published: f.published } : {}),
  }
}

const IN_WINDOW_EARLY: Fixture = { slug: 'today-early', startDate: '2026-09-15T12:00:00Z' }
const IN_WINDOW_LATE: Fixture = { slug: 'today-late', startDate: '2026-09-15T16:00:00Z' }
const FUTURE: Fixture = { slug: 'future', startDate: '2026-09-16T12:00:00Z' }
const RECENT_PAST: Fixture = { slug: 'recent-past', startDate: '2026-09-13T00:00:00Z' }
const OLD: Fixture = { slug: 'old', startDate: '2026-08-01T00:00:00Z' }

const setConfig = (events: Fixture[] | null) =>
  vi.mocked(getR2Object).mockResolvedValue((events ? events.map(r2) : null) as never)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
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

describe('async wrappers (R2 fallback path)', () => {
  it('getStrictlyActiveEvent returns null when the config is missing or empty', async () => {
    setConfig(null)
    expect(await getStrictlyActiveEvent()).toBeNull()
    setConfig([])
    expect(await getStrictlyActiveEvent()).toBeNull()
  })

  it('getStrictlyActiveEvent hydrates startDate to a Date', async () => {
    setConfig([IN_WINDOW_EARLY, IN_WINDOW_LATE, FUTURE, RECENT_PAST])
    const active = await getStrictlyActiveEvent()
    expect(active?.slug).toBe('today-late')
    expect(active?.startDate).toBeInstanceOf(Date)
  })

  it('getActiveEvent applies the 7-day window', async () => {
    setConfig([RECENT_PAST, FUTURE])
    expect((await getActiveEvent())?.slug).toBe('recent-past')
    setConfig([OLD])
    expect(await getActiveEvent()).toBeNull()
  })

  it('getEventBySlug resolves an event and bypasses the visibility filter', async () => {
    setConfig([
      IN_WINDOW_EARLY,
      { slug: 'hidden', startDate: '2020-01-01T00:00:00Z', published: false },
    ])
    expect((await getEventBySlug('today-early'))?.startDate).toEqual(
      new Date('2026-09-15T12:00:00Z'),
    )
    expect((await getEventBySlug('hidden'))?.slug).toBe('hidden')
    expect(await getEventBySlug('nope')).toBeNull()
  })
})

describe('published filter in production', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VERCEL_ENV', 'production')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('hides published:false from getStrictlyActiveEvent but not from getEventBySlug', async () => {
    vi.doMock('@/lib/auth', () => ({ getOwnerUserId: vi.fn().mockResolvedValue(null) }))
    vi.doMock('@/lib/r2', () => ({
      getR2Object: vi.fn().mockResolvedValue([
        r2({ slug: 'hidden-live', startDate: '2026-09-15T12:00:00Z', published: false }),
      ]),
      putR2Object: vi.fn(),
    }))
    const mod = await import('@/lib/events-config')
    expect(await mod.getStrictlyActiveEvent()).toBeNull()
    expect((await mod.getEventBySlug('hidden-live'))?.slug).toBe('hidden-live')
  })
})

describe('official id / path mapping', () => {
  it('keys lcq/mss by season', () => {
    const e = cfg({ slug: 'lcq-s11', startDate: '2026-08-01T00:00:00Z', kind: 'lcq', season: 11 })
    expect(officialEventId(e)).toBe(11)
    expect(buildOfficialPath(e)).toBe('/lcq/11')
  })

  it('keys worlds by start-date year, not season', () => {
    const e = cfg({ slug: 'worlds-2026', startDate: '2026-11-10T16:00:00Z', kind: 'worlds', season: 11 })
    expect(officialEventId(e)).toBe(2026)
    expect(buildOfficialPath(e)).toBe('/worlds/2026')
  })
})
