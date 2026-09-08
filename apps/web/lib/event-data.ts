import { cache } from 'react'
import {
  computeHistoricalData,
  computeMCResults,
  computePlayerOdds,
  buildPlayerViews,
} from '@endereye/core'
import { getR2Object, getR2CachedViews, putR2Object } from './r2'
import type {
  EventContext,
  EventKind,
  EventPlayer,
  PlayerView,
  BracketEntry,
  OverrideMap,
  RawOverrides,
} from '@endereye/core'

interface StoredEvent {
  currentRound: number
  matches: number[]
  brackets: BracketEntry[]
  players: { uuid: string; country: string | null }[]
  qualifyCount?: number
}

function applyRawOverrides(
  brackets: BracketEntry[],
  raw: RawOverrides,
): { brackets: BracketEntry[]; overrides: OverrideMap } {
  const overrides: OverrideMap = {}
  const patched = brackets.map((b) => {
    const playerOverrides = raw[b.uuid]
    if (!playerOverrides) return b
    const completions = [...b.completions]
    for (const [seedIndexStr, overrideScore] of Object.entries(playerOverrides)) {
      const seedIndex = Number(seedIndexStr)
      const existing = completions[seedIndex]
      if (!existing) continue
      const original = existing.score
      completions[seedIndex] = { ...existing, score: overrideScore }
      if (!overrides[b.uuid]) overrides[b.uuid] = {}
      overrides[b.uuid][seedIndex] = { original, override: overrideScore }
    }
    return { ...b, completions }
  })
  return { brackets: patched, overrides }
}

/**
 * `React.cache`d — the event page calls this directly *and* `getEventViews` calls
 * it again with the same args; dedup halves the R2 reads for one render.
 */
export const getEventContext = cache(async function getEventContext(
  kind: EventKind,
  season: number,
  prefix: string,
  qualifyCount?: number,
): Promise<EventContext | null> {
  const [eventData, playersData, rawOverrides] = await Promise.all([
    getR2Object<StoredEvent>(`${prefix}.event.json`),
    getR2Object<EventPlayer[]>(`${prefix}.players.json`),
    getR2Object<RawOverrides>(`${prefix}.overrides.json`),
  ])

  if (!eventData) {
    const defaultPlayers = await getR2Object<EventPlayer[]>(`${prefix}.players.default.json`)
    if (!defaultPlayers) return null
    return {
      kind,
      season,
      players: defaultPlayers,
      brackets: defaultPlayers.map((p, i) => ({
        uuid: p.uuid,
        ranks: [i + 1],
        completions: [],
        point: 0,
        bonus: 0,
        eliminated: false,
      })),
      matches: [],
      currentRound: 1,
      qualifyCount,
    }
  }

  const { brackets, overrides } = rawOverrides
    ? applyRawOverrides(eventData.brackets, rawOverrides)
    : { brackets: eventData.brackets, overrides: undefined }

  return {
    kind,
    season,
    players: playersData ?? [],
    brackets,
    matches: eventData.matches,
    currentRound: eventData.currentRound,
    qualifyCount: eventData.qualifyCount ?? qualifyCount,
    overrides: overrides && Object.keys(overrides).length > 0 ? overrides : undefined,
  }
})

/**
 * Assemble an `EventContext` from an already-in-hand event blob + player list,
 * without re-reading R2. Mirrors the transform `getEventContext` applies to the
 * stored shape; used by the sync path to warm the view cache before publishing.
 */
export function buildEventContext(
  kind: EventKind,
  season: number,
  event: { currentRound: number; matches: number[]; brackets: BracketEntry[]; qualifyCount?: number },
  players: EventPlayer[],
  rawOverrides: RawOverrides | null,
  qualifyCount?: number,
): EventContext {
  const { brackets, overrides } = rawOverrides
    ? applyRawOverrides(event.brackets, rawOverrides)
    : { brackets: event.brackets, overrides: undefined }

  return {
    kind,
    season,
    players,
    brackets,
    matches: event.matches,
    currentRound: event.currentRound,
    qualifyCount: event.qualifyCount ?? qualifyCount,
    overrides: overrides && Object.keys(overrides).length > 0 ? overrides : undefined,
  }
}

/** The Monte-Carlo standings computation for one seed — the CPU-heavy step. */
function computeSeedViews(eventData: EventContext, seed: number): PlayerView[] {
  const ctx = computeHistoricalData(eventData, seed)
  const mcResults = computeMCResults(ctx, 20000)
  const odds = computePlayerOdds(ctx, { externalMCResults: mcResults })
  return buildPlayerViews(ctx, odds)
}

/**
 * Precompute and store the standings views for the newest playable seed. Called
 * by every write path (autofetch sync, manual match upload/delete) *before* the
 * new `currentRound` is published, so the first viewer after a seed drop hits a
 * warm cache instead of running the sim on the request path (and the client's
 * "new seed" nudge only fires once the standings are ready). Earlier seeds
 * recompute lazily on first visit.
 */
export async function warmEventViews(prefix: string, eventData: EventContext): Promise<void> {
  const seed = eventData.currentRound - 1
  if (seed < 1) return
  await putR2Object(`cache/views/${prefix}/${seed}.json`, computeSeedViews(eventData, seed))
}

/**
 * `warmEventViews` given a freshly-built event blob + player list (rather than a
 * ready `EventContext`): pulls the prefix's overrides and assembles the context
 * in-memory. The shared entry point for the sync route and the manage actions.
 */
export async function warmLatestSeedViews(
  prefix: string,
  kind: EventKind,
  season: number,
  event: { currentRound: number; matches: number[]; brackets: BracketEntry[]; qualifyCount?: number },
  players: EventPlayer[],
  qualifyCount?: number,
): Promise<void> {
  const rawOverrides = await getR2Object<RawOverrides>(`${prefix}.overrides.json`)
  await warmEventViews(
    prefix,
    buildEventContext(kind, season, event, players, rawOverrides, qualifyCount),
  )
}

export async function getEventViews(
  kind: EventKind,
  season: number,
  prefix: string,
  seed: number,
  qualifyCount?: number,
): Promise<{ eventData: EventContext; views: PlayerView[] } | null> {
  const eventData = await getEventContext(kind, season, prefix, qualifyCount)
  if (!eventData) return null

  const cached = await getR2CachedViews(prefix, seed)
  if (cached) return { eventData, views: cached }

  const views = computeSeedViews(eventData, seed)
  await putR2Object(`cache/views/${prefix}/${seed}.json`, views)

  return { eventData, views }
}
