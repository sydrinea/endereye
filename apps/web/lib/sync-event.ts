import { buildEventFromApiResponse, enrichEventPlayers } from '@endereye/core'
import type { ApiEventData, EventPlayer, RawOverrides } from '@endereye/core'
import type { EventConfig } from './events-config'
import { getR2Object, putR2Object, deleteR2CachedViews } from './r2'
import { buildEventContext, warmEventViews } from './event-data'

/** The subset of an event's config that a sync actually reads. */
type SyncTarget = Pick<EventConfig, 'endpoint' | 'prefix' | 'kind' | 'season' | 'qualifyCount'>

/**
 * Outcome of one `/api/sync-event` run. `error` carries the HTTP status the route
 * should return; the other variants are 200 responses.
 */
export type SyncResult =
  | { synced: true; currentRound: number }
  | { skipped: true; reason: string; currentRound?: number }
  | { error: string; status: number }

/**
 * The autofetch step: pull the latest state of one event from the MCSR Ranked
 * tournament API, and — if a new seed has been played since the last sync —
 * rebuild `${prefix}.event.json`, diff-and-enrich `${prefix}.players.json`, and
 * drop the cached standings views.
 *
 * Framework-agnostic (no `next/server`), so it can be driven directly from tests.
 * The route handler is a thin wrapper that resolves the `EventConfig` and maps
 * the result to a response.
 */
export async function runEventSync(event: SyncTarget): Promise<SyncResult> {
  if (!event.endpoint) return { skipped: true, reason: 'no endpoint configured' }

  const apiRes = await fetch(`https://api.mcsrranked.com/${event.endpoint}`)
  if (!apiRes.ok) return { error: `API fetch failed: ${apiRes.status}`, status: 502 }
  const { data }: { status: string; data: ApiEventData } = await apiRes.json()

  const existing = await getR2Object<{ currentRound: number }>(`${event.prefix}.event.json`)
  if (existing && existing.currentRound === data.currentRound) {
    return { skipped: true, reason: 'no new seed', currentRound: data.currentRound }
  }

  const built = buildEventFromApiResponse(data)

  let updatedPlayers: EventPlayer[]
  try {
    const existingPlayers = await getR2Object<EventPlayer[]>(`${event.prefix}.players.json`)
    if (existingPlayers === null) {
      updatedPlayers = await enrichEventPlayers(built, event.kind, event.season)
    } else {
      const knownUuids = new Set(existingPlayers.map((p) => p.uuid))
      const newPlayers = built.players.filter((p) => !knownUuids.has(p.uuid))
      if (newPlayers.length === 0) {
        updatedPlayers = existingPlayers
      } else {
        const enriched = await enrichEventPlayers(
          { ...built, players: newPlayers },
          event.kind,
          event.season,
        )
        updatedPlayers = [...existingPlayers, ...enriched]
      }
    }
  } catch (e) {
    return {
      error: `player enrichment failed: ${e instanceof Error ? e.message : String(e)}`,
      status: 502,
    }
  }

  const eventBlob = { ...built, qualifyCount: event.qualifyCount }

  // Publish order matters. The API can restate an earlier match, so every cached
  // view for the prefix is purged. We then precompute *only the newest seed*
  // (earlier seeds recompute lazily on first visit) and write event.json last —
  // `currentRound` (what the client polls) flips only once the seed a viewer
  // would land on is already warm, so the "new seed" nudge never points at
  // standings that aren't ready.
  await putR2Object(`${event.prefix}.players.json`, updatedPlayers)
  await deleteR2CachedViews(event.prefix)

  const rawOverrides = await getR2Object<RawOverrides>(`${event.prefix}.overrides.json`)
  const ctx = buildEventContext(
    event.kind,
    event.season,
    eventBlob,
    updatedPlayers,
    rawOverrides,
    event.qualifyCount,
  )
  await warmEventViews(event.prefix, ctx)

  await putR2Object(`${event.prefix}.event.json`, eventBlob)

  return { synced: true, currentRound: data.currentRound }
}
