import { unstable_cache } from 'next/cache'
import { buildLiveEventData, WORLDS_2026_PLAYERS } from '@endereye/discovery'
import type { EventData } from '@endereye/discovery'
import { ACTIVE_EVENT } from './events.config'

export const getLiveEventData: () => Promise<EventData | null> = unstable_cache(
  () =>
    buildLiveEventData(ACTIVE_EVENT.kind, ACTIVE_EVENT.season, {
      after: ACTIVE_EVENT.matchBoundsAfter ?? 0,
      players: WORLDS_2026_PLAYERS,
      qualifyCount: ACTIVE_EVENT.qualifyCount,
    }),
  ['worlds-lcq-live'],
  { revalidate: 120 },
)
