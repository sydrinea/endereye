import { EventKind } from '../lib/api/types'

interface MatchIdBounds {
  after: number
  before: number
}

interface EventConfig {
  kind: EventKind
  target: string
  season: number
  matchIdBounds: MatchIdBounds
}

export const EVENTS: EventConfig[] = [
  {
    kind: 'lcq',
    target: 'Season 10 Playoffs',
    season: 11,
    matchIdBounds: { after: 9750329, before: 9784987 },
  },
]
