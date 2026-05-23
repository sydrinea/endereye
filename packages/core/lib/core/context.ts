import type { PlayerOdds } from './odds'
import { EventContext, EventPlayer } from '../context/event'
import { applyElimination, runFullHeatmapSimulation, toSimPlayer } from './simulation'
import { BracketEntry } from '../api/types'
import { ELIMINATION_SCHEDULE } from './config'

export type PlayerView = EventPlayer & BracketEntry & PlayerOdds & { rank: number; prevRank: number | null }

export function calculatePoints(b: BracketEntry, seed: number): number {
  return (
    b.bonus +
    b.completions.slice(0, Math.min(seed, 10)).reduce((sum, c) => sum + (c?.score ?? 0), 0)
  )
}

export function computeHistoricalData(data: EventContext, viewSeed: number): EventContext {
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

  const newBrackets = data.brackets.map((b) => ({
    ...b,
    point: calculatePoints(b, viewSeed),
    eliminated: !surviving.has(b.uuid),
    completions: b.completions.map((c, i) =>
      i < viewSeed ? c : null,
    ) as BracketEntry['completions'],
    ranks: b.ranks.slice(0, viewSeed + 1),
  }))

  return { ...data, brackets: newBrackets, currentRound: viewSeed + 1 }
}

export function buildPlayerViews(
  data: EventContext,
  playerOdds: Record<string, PlayerOdds>,
): PlayerView[] {
  const playerLookup = new Map(data.players.map((p) => [p.uuid, p]))

  return data.brackets
    .map((b) => {
      const rank = b.ranks[b.ranks.length - 1] ?? null
      const prevRank = b.ranks.length >= 2 ? b.ranks[b.ranks.length - 2] : null
      return { rank, prevRank, b }
    })
    .filter(({ rank }) => rank !== null)
    .sort((a, b) => a.rank! - b.rank!)
    .map(({ rank, prevRank, b }) => {
      const player = playerLookup.get(b.uuid)
      if (!player) throw new Error(`Player ${b.uuid} not found in players list`)
      const odds = playerOdds[b.uuid]
      if (!odds) throw new Error(`No odds computed for player ${b.uuid}`)
      return { ...player, ...b, ...odds, rank: rank!, prevRank } as PlayerView
    })
}

export function runHeatmapSimulation(
  data: EventContext,
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
