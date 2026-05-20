import type { PlayerOdds } from './odds'
import { createEventContext, EventContext, EventPlayer } from '../context/event'
import { computePlayerOdds } from './odds'
import { applyElimination, runFullHeatmapSimulation, toSimPlayer } from './simulation'
import { BracketEntry, EventKind } from '../api/types'
import { ELIMINATION_SCHEDULE } from './config'

export interface EventData extends EventContext {
  readonly playerOdds: Record<string, PlayerOdds>
}

export type PlayerView = EventPlayer & BracketEntry & PlayerOdds

export async function createEventData(
  kind: EventKind,
  season: number,
  opts: { skipOdds?: boolean } = {},
): Promise<EventData> {
  const ctx = await createEventContext(kind, season)
  return { ...ctx, playerOdds: opts.skipOdds ? {} : computePlayerOdds(ctx) }
}

export function createEventDataFromParts(
  event: { currentRound: number; matches: number[]; brackets: BracketEntry[] },
  players: EventPlayer[],
  kind: EventKind,
  season: number,
  opts: { skipOdds?: boolean } = {},
): EventData {
  const ctx: EventContext = { kind, season, players, brackets: event.brackets, matches: event.matches, currentRound: event.currentRound }
  return { ...ctx, playerOdds: opts.skipOdds ? {} : computePlayerOdds(ctx) }
}

export function calculatePoints(b: BracketEntry, seed: number): number {
  return (
    b.bonus +
    b.completions.slice(0, Math.min(seed, 10)).reduce((sum, c) => sum + (c?.score ?? 0), 0)
  )
}

export function computeHistoricalData(data: EventData, viewSeed: number): EventData {
  const bracketMap = new Map(data.brackets.map((b) => [b.uuid, b]))
  const playerLookup = new Map(data.players.map((p) => [p.uuid, p]))

  let surviving = new Set(data.brackets.map((b) => b.uuid))

  for (const cut of ELIMINATION_SCHEDULE) {
    if (cut.afterSeed > viewSeed) break
    const simPlayers = [...surviving].map((uuid) => {
      const p = playerLookup.get(uuid)
      if (!p) throw new Error(`Player ${uuid} missing from players list`)
      return toSimPlayer(p, calculatePoints(bracketMap.get(uuid)!, cut.afterSeed))
    })
    surviving = new Set(applyElimination(simPlayers, cut).map((p) => p.uuid))
  }

  const modified = data.brackets.map((b) => ({
    ...b,
    point: calculatePoints(b, viewSeed),
    eliminated: !surviving.has(b.uuid),
    completions: b.completions.map((c, i) =>
      i < viewSeed ? c : null,
    ) as BracketEntry['completions'],
    prevRank: b.rank,
  }))

  const sorted = [...modified].sort((a, b) =>
    b.point !== a.point ? b.point - a.point : a.uuid.localeCompare(b.uuid),
  )

  let rank = 1
  const rankMap = new Map<string, number>()
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].point < sorted[i - 1].point) rank = i + 1
    rankMap.set(sorted[i].uuid, rank)
  }

  const newBrackets = modified.map((b) => ({ ...b, rank: rankMap.get(b.uuid)! }))
  const ctx: EventContext = { ...data, brackets: newBrackets, currentRound: viewSeed + 1 }
  return { ...ctx, playerOdds: computePlayerOdds(ctx) }
}

export function buildPlayerViews(data: EventData): PlayerView[] {
  const playerLookup = new Map(data.players.map((p) => [p.uuid, p]))
  return data.brackets
    .sort((a, b) => a.rank - b.rank)
    .map((b) => {
      const player = playerLookup.get(b.uuid)
      if (!player) throw new Error(`Player ${b.uuid} not found in players list`)
      const odds = data.playerOdds[b.uuid]
      if (!odds) throw new Error(`No odds computed for player ${b.uuid}`)
      return { ...player, ...b, ...odds } as PlayerView
    })
}

export function runHeatmapSimulation(
  data: EventData,
  currentRound: number,
  iterations = 10000,
): Record<string, Record<number, number>> {
  const playerLookup = new Map(data.players.map((p) => [p.uuid, p]))
  const alivePlayers = data.brackets
    .filter((b) => !b.eliminated)
    .map((b) => {
      const p = playerLookup.get(b.uuid)
      if (!p) throw new Error(`Player ${b.uuid} not found in players list`)
      return toSimPlayer(p, b.point)
    })
  return runFullHeatmapSimulation(alivePlayers, currentRound, ELIMINATION_SCHEDULE, iterations)
}
