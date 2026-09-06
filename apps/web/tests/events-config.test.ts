// Unit tests for event selection: getStrictlyActiveEvent (the no-slug path the
// cron uses), getActiveEvent (the 7-day window behind /api/active-event), and
// getEventBySlug (the ?slug override — must ignore the published filter).
//
// System time is pinned to 2026-09-15T18:00:00Z; fixture start dates are spaced
// so the local-midnight cutoff in getStrictlyActiveEvent can't flip a boundary
// in any real timezone.
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { R2EventConfig } from '@/lib/events-config'

vi.mock('@/lib/r2', () => ({ getR2Object: vi.fn(), putR2Object: vi.fn() }))

import { getR2Object } from '@/lib/r2'
import { getStrictlyActiveEvent, getActiveEvent, getEventBySlug } from '@/lib/events-config'

const NOW = new Date('2026-09-15T18:00:00Z')

function ev(over: Partial<R2EventConfig> & { slug: string; startDate: string }): R2EventConfig {
  return {
    label: over.slug,
    kind: 'lcq',
    season: 11,
    prefix: `x/${over.slug}`,
    path: `/x/${over.slug}`,
    ...over,
  }
}

const IN_WINDOW_EARLY = ev({ slug: 'today-early', startDate: '2026-09-15T12:00:00Z' })
const IN_WINDOW_LATE = ev({ slug: 'today-late', startDate: '2026-09-15T16:00:00Z' })
const FUTURE = ev({ slug: 'future', startDate: '2026-09-16T12:00:00Z' })
const RECENT_PAST = ev({ slug: 'recent-past', startDate: '2026-09-13T00:00:00Z' })
const OLD = ev({ slug: 'old', startDate: '2026-08-01T00:00:00Z' })

const setConfig = (events: R2EventConfig[] | null) =>
  vi.mocked(getR2Object).mockResolvedValue(events as never)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('getStrictlyActiveEvent', () => {
  it('returns null when the config is missing or empty', async () => {
    setConfig(null)
    expect(await getStrictlyActiveEvent()).toBeNull()
    setConfig([])
    expect(await getStrictlyActiveEvent()).toBeNull()
  })

  it('excludes events that have not started yet', async () => {
    setConfig([FUTURE])
    expect(await getStrictlyActiveEvent()).toBeNull()
  })

  it('excludes events that started before today', async () => {
    setConfig([RECENT_PAST, OLD])
    expect(await getStrictlyActiveEvent()).toBeNull()
  })

  it('returns the most-recently-started event that is under way', async () => {
    setConfig([IN_WINDOW_EARLY, IN_WINDOW_LATE, FUTURE, RECENT_PAST])
    const active = await getStrictlyActiveEvent()
    expect(active?.slug).toBe('today-late')
    expect(active?.startDate).toBeInstanceOf(Date)
  })
})

describe('getActiveEvent', () => {
  it('keeps the most recent event visible for 7 days, earliest-in-window first', async () => {
    setConfig([RECENT_PAST, FUTURE])
    // both are within [today-7d, ∞): earliest wins
    expect((await getActiveEvent())?.slug).toBe('recent-past')
  })

  it('drops events older than 7 days', async () => {
    setConfig([OLD])
    expect(await getActiveEvent()).toBeNull()
  })
})

describe('getEventBySlug', () => {
  it('resolves a configured event and hydrates startDate to a Date', async () => {
    setConfig([IN_WINDOW_EARLY, IN_WINDOW_LATE])
    const e = await getEventBySlug('today-early')
    expect(e?.slug).toBe('today-early')
    expect(e?.startDate).toEqual(new Date('2026-09-15T12:00:00Z'))
  })

  it('returns null for an unknown slug', async () => {
    setConfig([IN_WINDOW_EARLY])
    expect(await getEventBySlug('nope')).toBeNull()
  })

  it('resolves a published:false event (bypasses the visibility filter)', async () => {
    setConfig([ev({ slug: 'hidden', startDate: '2020-01-01T00:00:00Z', published: false })])
    const e = await getEventBySlug('hidden')
    expect(e?.slug).toBe('hidden')
  })
})

describe('published filter in production', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VERCEL_ENV', 'production')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('hides published:false from getStrictlyActiveEvent but not from getEventBySlug', async () => {
    const hidden = ev({ slug: 'hidden-live', startDate: '2026-09-15T12:00:00Z', published: false })
    vi.doMock('@/lib/r2', () => ({
      getR2Object: vi.fn().mockResolvedValue([hidden]),
      putR2Object: vi.fn(),
    }))
    const mod = await import('@/lib/events-config')

    expect(await mod.getStrictlyActiveEvent()).toBeNull()
    expect((await mod.getEventBySlug('hidden-live'))?.slug).toBe('hidden-live')
  })
})
