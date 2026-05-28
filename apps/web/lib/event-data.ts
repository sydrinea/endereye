import { cacheLife, cacheTag } from 'next/cache'
import {
  computeHistoricalData,
  computeMCResults,
  computePlayerOdds,
  buildPlayerViews,
} from '@endereye/core'
import { getR2Object } from './r2'
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

export async function getEventContext(
  kind: EventKind,
  season: number,
  prefix: string,
  qualifyCount?: number,
): Promise<EventContext | null> {
  'use cache'
  cacheLife('minutes')
  cacheTag(`event:${prefix}`)
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
}

export async function getEventViews(
  kind: EventKind,
  season: number,
  prefix: string,
  seed: number,
  qualifyCount?: number,
): Promise<{ eventData: EventContext; views: PlayerView[] } | null> {
  'use cache'
  cacheLife('minutes')
  cacheTag(`event:${prefix}`)

  const eventData = await getEventContext(kind, season, prefix, qualifyCount)
  if (!eventData) return null

  const ctx = computeHistoricalData(eventData, seed)
  const mcResults = computeMCResults(ctx, 20000)
  const odds = computePlayerOdds(ctx, mcResults)
  const views = buildPlayerViews(ctx, odds)

  return { eventData, views }
}
