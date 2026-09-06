/**
 * View-model assembly: turn an `EventContext` plus computed odds into the
 * `PlayerView[]` the standings table renders, and provide the historical
 * "rewind the event to seed N" transform behind the seed scrubber.
 */
import type { PlayerOdds } from './odds'
import { EventContext, EventPlayer } from '../context/event'
import { applyElimination, runFullHeatmapSimulation, toSimPlayer } from './simulation'
import { BracketEntry } from '../api/types'
import { getEffectiveSchedule } from './config'

/** A player row: their profile, bracket state, odds, and current/previous rank merged. */
export type PlayerView = EventPlayer &
  BracketEntry &
  PlayerOdds & { rank: number; prevRank: number | null }

/** Points after `seed` seeds: carry-in bonus plus the scored completions so far (capped at 10 seeds). */
export function calculatePoints(b: BracketEntry, seed: number): number {
  return (
    b.bonus +
    b.completions.slice(0, Math.min(seed, 10)).reduce((sum, c) => sum + (c?.score ?? 0), 0)
  )
}

/**
 * Rewinds an event to the state right after `viewSeed` seeds: replays each cut
 * whose seed is `<= viewSeed` to re-derive who was eliminated by then,
 * recomputes every bracket's points at that seed, truncates `completions` and
 * `ranks`, and sets `currentRound` to `viewSeed + 1`. Cut eliminations are
 * replayed rather than read from the live data because a player eliminated
 * later shouldn't show as eliminated at an earlier seed.
 */
export function computeHistoricalData(data: EventContext, viewSeed: number): EventContext {
  const bracketMap = new Map(data.brackets.map((b) => [b.uuid, b]))
  const playerLookup = new Map(data.players.map((p) => [p.uuid, p]))

  const { effectiveSchedule } = getEffectiveSchedule(data)

  let surviving = new Set(data.brackets.map((b) => b.uuid))

  for (const cut of effectiveSchedule) {
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

/**
 * Joins brackets, player profiles, and odds into sorted `PlayerView` rows.
 * Rank is the sorted position (points desc, then bonus), computed here rather
 * than read from stored data so it stays consistent with the live point totals
 * after score overrides. Throws if a bracket has no matching player or odds.
 */
export function buildPlayerViews(
  data: EventContext,
  playerOdds: Record<string, PlayerOdds>,
): PlayerView[] {
  const playerLookup = new Map(data.players.map((p) => [p.uuid, p]))

  const sorted = [...data.brackets].sort((a, b) => b.point - a.point || b.bonus - a.bonus)

  return sorted.map((b, i) => {
    const rank = i + 1
    // Second-to-last entry in the rank history = rank as of the previous seed.
    const prevRank = b.ranks.length >= 2 ? b.ranks[b.ranks.length - 2] : null
    const player = playerLookup.get(b.uuid)
    if (!player) throw new Error(`Player ${b.uuid} not found in players list`)
    const odds = playerOdds[b.uuid]
    if (!odds) throw new Error(`No odds computed for player ${b.uuid}`)
    return { ...player, ...b, ...odds, rank, prevRank } as PlayerView
  })
}

/**
 * `EventContext` wrapper around `runFullHeatmapSimulation`: builds `SimPlayer`s
 * for the alive brackets and returns each player's survival probability past
 * every remaining cut seed (plus key 999 = final qualifier).
 */
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
  const { effectiveSchedule, qualifyCount } = getEffectiveSchedule(data)
  return runFullHeatmapSimulation(alivePlayers, currentRound, effectiveSchedule, iterations, qualifyCount)
}
