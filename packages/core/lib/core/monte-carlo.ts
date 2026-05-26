import type { EliminationCut } from './config'
import {
  type SimPlayer,
  type LobbyStats,
  calculateLobbyStats,
  getDNFProbability,
  getPlayerPower,
  getPlayerVariance,
  randomGaussian,
} from './player-model'
import { getAvailableScores, applyElimination } from './scoring'

export interface MCResult {
  winProbability: number
  survivalProbability: number
}

export function rankPlayers(alive: SimPlayer[], round: number, stats: LobbyStats) {
  return alive
    .map((p, idx) => ({
      idx,
      val:
        Math.random() < getDNFProbability(p, stats)
          ? -Infinity
          : getPlayerPower(p, round, stats) + (randomGaussian() * getPlayerVariance(p, stats)) / 3,
    }))
    .sort((a, b) => b.val - a.val)
}

export function simulateRound(alive: SimPlayer[], round: number, stats: LobbyStats): SimPlayer[] {
  const ranked = rankPlayers(alive, round, stats)
  const completers = ranked.filter((r) => r.val !== -Infinity)
  const scores = getAvailableScores(completers.length)

  let completerRank = 0
  const earned = new Map<number, number>()
  for (const entry of ranked) {
    earned.set(entry.idx, entry.val === -Infinity ? 0 : (scores[completerRank++] ?? 0))
  }

  return alive.map((p, i) => ({ ...p, point: p.point + (earned.get(i) ?? 0) }))
}

function toMCResults(
  ids: string[],
  winCount: Map<string, number>,
  surviveCount: Map<string, number>,
  iterations: number,
): Record<string, MCResult> {
  return Object.fromEntries(
    ids.map((id) => [
      id,
      {
        winProbability: (winCount.get(id) ?? 0) / iterations,
        survivalProbability: (surviveCount.get(id) ?? 0) / iterations,
      },
    ]),
  )
}

export function runMonteCarlo(
  players: SimPlayer[],
  currentRound: number,
  cuts: EliminationCut[],
  targetRank: number,
  iterations = 20000,
): Record<string, MCResult> {
  const ids = players.map((p) => p.uuid)
  const winCount = new Map(ids.map((id) => [id, 0]))
  const surviveCount = new Map(ids.map((id) => [id, 0]))
  const lastSeed = cuts.length > 0 ? Math.max(...cuts.map((c) => c.afterSeed)) : currentRound - 1

  if (currentRound > lastSeed) {
    const winners = [...players].sort((a, b) => b.point - a.point).slice(0, targetRank)
    for (const id of ids) surviveCount.set(id, iterations)
    for (const p of winners) winCount.set(p.uuid, iterations)
    return toMCResults(ids, winCount, surviveCount, iterations)
  }

  const stats = calculateLobbyStats(players)
  const nextCut = cuts.find((c) => c.afterSeed >= currentRound)

  for (let i = 0; i < iterations; i++) {
    let alive = players.map((p) => ({ ...p }))

    for (let r = currentRound; r <= lastSeed; r++) {
      if (alive.length === 0) break
      alive = simulateRound(alive, r, stats)
      const cut = cuts.find((c) => c.afterSeed === r)
      if (cut) {
        alive = applyElimination(alive, cut)
        if (cut === nextCut)
          for (const p of alive) surviveCount.set(p.uuid, (surviveCount.get(p.uuid) ?? 0) + 1)
      }
    }

    if (!nextCut)
      for (const p of alive) surviveCount.set(p.uuid, (surviveCount.get(p.uuid) ?? 0) + 1)

    for (const p of [...alive].sort((a, b) => b.point - a.point).slice(0, targetRank))
      winCount.set(p.uuid, (winCount.get(p.uuid) ?? 0) + 1)
  }

  return toMCResults(ids, winCount, surviveCount, iterations)
}

export function runFullHeatmapSimulation(
  players: SimPlayer[],
  currentRound: number,
  cuts: EliminationCut[],
  iterations = 10000,
  qualifyCount = 4,
): Record<string, Record<number, number>> {
  const ids = players.map((p) => p.uuid)
  const remainingCuts = cuts.filter((c) => c.afterSeed >= currentRound)
  const lastSeed = cuts.length > 0 ? Math.max(...cuts.map((c) => c.afterSeed)) : currentRound - 1

  const survivalCounts = new Map(
    ids.map((id) => {
      const counts: Record<number, number> = { 999: 0 }
      for (const cut of remainingCuts) counts[cut.afterSeed] = 0
      return [id, counts]
    }),
  )

  if (currentRound > lastSeed) {
    const topN = [...players].sort((a, b) => b.point - a.point).slice(0, qualifyCount)
    for (const p of topN) survivalCounts.get(p.uuid)![999] = iterations
  } else {
    const stats = calculateLobbyStats(players)

    for (let i = 0; i < iterations; i++) {
      let alive = players.map((p) => ({ ...p }))

      for (let r = currentRound; r <= lastSeed; r++) {
        if (alive.length === 0) break
        alive = simulateRound(alive, r, stats)

        const cut = remainingCuts.find((c) => c.afterSeed === r)
        if (cut) {
          alive = applyElimination(alive, cut)
          for (const p of alive) survivalCounts.get(p.uuid)![r]++
        }

        if (r === lastSeed) {
          for (const p of [...alive].sort((a, b) => b.point - a.point).slice(0, qualifyCount))
            survivalCounts.get(p.uuid)![999]++
        }
      }
    }
  }

  return Object.fromEntries(
    Array.from(survivalCounts.entries()).map(([uuid, counts]) => [
      uuid,
      Object.fromEntries(
        Object.entries(counts).map(([seed, count]) => [Number.parseInt(seed), count / iterations]),
      ),
    ]),
  )
}
