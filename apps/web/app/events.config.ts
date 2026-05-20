export interface EventConfig {
  slug: string
  label: string
  kind: 'lcq' | 'mss'
  season: number
  startDate: Date
  path: string
  cacheKey: string
  matchBoundsAfter?: number
  isSpecial?: boolean
  qualifyCount?: number
}

export const EVENTS: EventConfig[] = [
  {
    slug: 'lcq-s10',
    label: 'Season 10 LCQ',
    kind: 'lcq',
    season: 10,
    startDate: new Date('2026-05-02'),
    path: '/lcq/10',
    cacheKey: 'lcq:10',
  },
  {
    slug: 'worlds-2026',
    label: 'World Championships LCQ',
    kind: 'lcq',
    season: 11,
    startDate: new Date('2026-05-24T15:00:00Z'),
    path: '/special/2026/worlds',
    cacheKey: 'lcq:2026.worlds',
    matchBoundsAfter: 10343309, // set ~1h before event via scripts/get-latest-match-id.ts
    isSpecial: true,
    qualifyCount: 2,
  },
]

export const ACTIVE_EVENT = EVENTS[EVENTS.length - 1]
