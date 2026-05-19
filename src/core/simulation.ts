import { EventPlayer } from '../context/event'
import type { EliminationCut } from './config'

export interface SimPlayer {
  uuid: string
  nickname: string
  country: string | null
  eloRate: number
  eloRank: number | null
  point: number
  winRate: number
  playedMatches: number
  bestTimeMs: number
  avgTimeMs: number
  historicalPowerScore: number
}

export function makeSimPlayer(
  player: EventPlayer,
  point: number,
  historicalPowerScore = 0,
): SimPlayer {
  const decisiveMatches = player.wins + player.losses
  const winRate = decisiveMatches > 0 ? player.wins / decisiveMatches : 0.5
  return {
    uuid: player.uuid,
    nickname: player.nickname,
    country: player.country,
    eloRate: player.eloRate ?? 0,
    eloRank: player.eloRank,
    point,
    winRate,
    playedMatches: player.playedMatches,
    bestTimeMs: player.bestTimeMs,
    avgTimeMs: player.avgTimeMs,
    historicalPowerScore,
  }
}

export function defaultSimPlayer(uuid: string, point: number): SimPlayer {
  return {
    uuid,
    nickname: uuid,
    country: null,
    eloRate: 0,
    eloRank: null,
    point,
    winRate: 0.5,
    playedMatches: 0,
    bestTimeMs: 0,
    avgTimeMs: 0,
    historicalPowerScore: 0,
  }
}

export interface LobbyStats {
  meanBest: number
  stdDevBest: number
  meanAvg: number
  meanGap: number
}

export function calculateLobbyStats(players: SimPlayer[]): LobbyStats {
  const bestTimes = players.map((p) => p.bestTimeMs).filter((t) => t > 0)
  const avgTimes = players.map((p) => p.avgTimeMs).filter((t) => t > 0)
  const gaps = players
    .filter((p) => p.bestTimeMs > 0 && p.avgTimeMs > 0)
    .map((p) => Math.max(0, p.avgTimeMs - p.bestTimeMs))

  if (bestTimes.length === 0 || avgTimes.length === 0) {
    return {
      meanBest: 300000,
      stdDevBest: 60000,
      meanAvg: 450000,
      meanGap: 150000,
    }
  }

  const meanBest = bestTimes.reduce((a, b) => a + b, 0) / bestTimes.length
  const meanAvg = avgTimes.reduce((a, b) => a + b, 0) / avgTimes.length
  const meanGap = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 300000

  const varianceBest = bestTimes.reduce((a, b) => a + (b - meanBest) ** 2, 0) / bestTimes.length
  const stdDevBest = Math.sqrt(varianceBest)

  return { meanBest, stdDevBest, meanAvg, meanGap }
}

export interface MCResult {
  winProbability: number
  survivalProbability: number
}

function randomGaussian(): number {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

function getAvailableScores(aliveCount: number): number[] {
  const scores: number[] = []
  const N = Math.min(aliveCount, 24)
  for (let p = 1; p <= aliveCount; p++) {
    scores.push(p > 24 ? 0 : Math.round((24 * (N - p + 1)) / N))
  }
  return scores
}

export function applyElimination(players: SimPlayer[], cut: EliminationCut): SimPlayer[] {
  if (players.length === 0) return []
  const sorted = [...players].sort((a, b) => b.point - a.point)

  let keepCount
  if ('rule' in cut) {
    if (cut.rule === 'zero_out') return players.filter((p) => p.point > 0)
    keepCount = Math.ceil(players.length / 2)
  } else {
    keepCount = cut.keepTop
  }

  if (keepCount >= sorted.length) return sorted

  const threshold = sorted[keepCount - 1].point
  let finalCount = keepCount
  while (finalCount < sorted.length && sorted[finalCount].point === threshold) {
    finalCount++
  }
  return sorted.slice(0, finalCount)
}

function applyBestCaseSegment(
  targetUuid: string,
  players: SimPlayer[],
  seeds: number,
): SimPlayer[] {
  if (seeds <= 0) return players
  const scores = getAvailableScores(players.length)
  const result = players.map((p) => ({ ...p }))
  const tIdx = result.findIndex((p) => p.uuid === targetUuid)
  if (tIdx === -1) return players

  for (let s = 0; s < seeds; s++) {
    result[tIdx].point += scores[0]
    const others = result.filter((p) => p.uuid !== targetUuid).sort((a, b) => b.point - a.point)
    const otherScores = scores.slice(1)
    for (let i = 0; i < others.length; i++) {
      others[i].point += otherScores[i] || 0
    }
  }
  return result
}

export function canStillWinDeterministic(
  targetUuid: string,
  players: SimPlayer[],
  currentRound: number,
  cuts: EliminationCut[],
  targetRank: number,
): boolean {
  let alive = players.map((p) => ({ ...p }))
  let sDone = currentRound - 1
  for (const cut of cuts) {
    if (cut.afterSeed < currentRound) continue
    alive = applyBestCaseSegment(targetUuid, alive, cut.afterSeed - sDone)
    alive = applyElimination(alive, cut)
    if (!alive.some((p) => p.uuid === targetUuid)) return false
    sDone = cut.afterSeed
  }
  if (sDone < 10) alive = applyBestCaseSegment(targetUuid, alive, 10 - sDone)
  const sorted = [...alive].sort((a, b) => b.point - a.point)
  const rank = sorted.findIndex((p) => p.uuid === targetUuid) + 1
  return rank > 0 && rank <= targetRank
}

export function isSafeAtNextCutDeterministic(
  targetUuid: string,
  players: SimPlayer[],
  currentRound: number,
  cuts: EliminationCut[],
  fixedNextScore: number | null = null,
): boolean {
  if (currentRound > 10) return true
  const nextCut = cuts.find((c) => c.afterSeed >= currentRound)
  if (!nextCut) return true

  const state = players.map((p) => ({ ...p }))
  const tIdx = state.findIndex((p) => p.uuid === targetUuid)
  if (tIdx === -1) return false

  let sDone = currentRound - 1

  const scores = getAvailableScores(state.length)
  const targetScore = fixedNextScore !== null ? fixedNextScore : scores[scores.length - 1]

  state[tIdx].point += targetScore

  const otherScores = [...scores]
  const fIdx = otherScores.indexOf(targetScore)
  if (fIdx !== -1) otherScores.splice(fIdx, 1)

  const targetPts = state[tIdx].point
  const others = state.filter((p) => p.uuid !== targetUuid)

  const unassigned = [...others]
  const avail = [...otherScores].sort((a, b) => a - b)

  const toElevate = unassigned.filter((p) => p.point <= targetPts).sort((a, b) => b.point - a.point)

  for (const p of toElevate) {
    const needed = targetPts + 1 - p.point
    const scoreIdx = avail.findIndex((s) => s >= needed)
    if (scoreIdx !== -1) {
      p.point += avail[scoreIdx]
      avail.splice(scoreIdx, 1)
      const uIdx = unassigned.indexOf(p)
      unassigned.splice(uIdx, 1)
    }
  }

  for (const p of unassigned) {
    p.point += avail.pop() || 0
  }

  sDone++

  if (nextCut.afterSeed > sDone) {
    for (let s = sDone; s < nextCut.afterSeed; s++) {
      const segScores = getAvailableScores(state.length)
      const targetSegIdx = state.findIndex((p) => p.uuid === targetUuid)
      state[targetSegIdx].point += segScores[segScores.length - 1]

      const tPts = state[targetSegIdx].point
      const segOthers = state.filter((p) => p.uuid !== targetUuid)

      const segUnassigned = [...segOthers]
      const segAvail = segScores.slice(0, -1).sort((a, b) => a - b)

      const segToElevate = segUnassigned
        .filter((p) => p.point <= tPts)
        .sort((a, b) => b.point - a.point)

      for (const p of segToElevate) {
        const needed = tPts + 1 - p.point
        const scoreIdx = segAvail.findIndex((score) => score >= needed)
        if (scoreIdx !== -1) {
          p.point += segAvail[scoreIdx]
          segAvail.splice(scoreIdx, 1)
          const uIdx = segUnassigned.indexOf(p)
          segUnassigned.splice(uIdx, 1)
        }
      }

      for (const p of segUnassigned) {
        p.point += segAvail.pop() || 0
      }
    }
  }

  const survivors = applyElimination(state, nextCut)
  return survivors.some((p) => p.uuid === targetUuid)
}

export function getDNFProbability(p: SimPlayer, stats: LobbyStats): number {
  const gap = Math.max(0, p.avgTimeMs - p.bestTimeMs)
  return Math.min(0.4, 0.12 * (gap / (stats.meanGap || 300000)) ** 1.5)
}

function getPlayerVariance(p: SimPlayer, stats: LobbyStats): number {
  const confidence = Math.min(p.playedMatches, 500) / 500
  const base = 2500 - 1000 * confidence
  const risk = (Math.max(0, p.avgTimeMs - p.bestTimeMs) / (stats.meanGap || 300000) - 1.0) * 800
  return Math.max(400, base + risk)
}

export function getPlayerPower(p: SimPlayer, round: number, stats: LobbyStats): number {
  const elo = 1700 + ((p.eloRate || 1700) - 1700) * 0.2
  let power = elo + (p.winRate - 0.5) * 150 * (Math.min(p.playedMatches, 50) / 50)
  if (p.bestTimeMs > 0)
    power += 100 * Math.exp(((stats.meanBest - p.bestTimeMs) / stats.stdDevBest) * 0.8)
  if (p.avgTimeMs > 0) {
    const avgBonus = Math.max(0, (stats.meanAvg - p.avgTimeMs) / 1000)
    power += round <= 5 ? avgBonus * 0.75 : avgBonus * 0.25
  }
  return power + p.historicalPowerScore * 150
}

export function runMonteCarlo(
  players: SimPlayer[],
  currentRound: number,
  cuts: EliminationCut[],
  targetRank: number,
  iterations = 10000,
): Record<string, MCResult> {
  const winCount = new Map<string, number>()
  const surviveCount = new Map<string, number>()
  const ids = players.map((p) => p.uuid)
  ids.forEach((id) => {
    winCount.set(id, 0)
    surviveCount.set(id, 0)
  })

  if (currentRound > 10) {
    const sorted = [...players].sort((a, b) => b.point - a.point)
    ids.forEach((id) => surviveCount.set(id, iterations))
    sorted.slice(0, targetRank).forEach((p) => winCount.set(p.uuid, iterations))
    return Object.fromEntries(
      ids.map((id) => [
        id,
        {
          winProbability: winCount.get(id)! / iterations,
          survivalProbability: surviveCount.get(id)! / iterations,
        },
      ]),
    )
  }

  const lobbyStats = calculateLobbyStats(players)
  const nextCut = cuts.find((c) => c.afterSeed >= currentRound)

  for (let i = 0; i < iterations; i++) {
    let alive = players.map((p) => ({ ...p }))
    for (let r = currentRound; r <= 10; r++) {
      if (alive.length === 0) break
      const scores = getAvailableScores(alive.length)
      const perfs = alive
        .map((p, idx) => ({
          idx,
          val:
            Math.random() < getDNFProbability(p, lobbyStats)
              ? -Infinity
              : getPlayerPower(p, r, lobbyStats) +
                (randomGaussian() * getPlayerVariance(p, lobbyStats)) / 3,
        }))
        .sort((a, b) => b.val - a.val)
      for (let j = 0; j < alive.length; j++) alive[perfs[j].idx].point += scores[j]
      const cut = cuts.find((c) => c.afterSeed === r)
      if (cut) {
        alive = applyElimination(alive, cut)
        if (cut === nextCut)
          alive.forEach((p) => surviveCount.set(p.uuid, (surviveCount.get(p.uuid) || 0) + 1))
      }
    }
    if (!nextCut)
      alive.forEach((p) => surviveCount.set(p.uuid, (surviveCount.get(p.uuid) || 0) + 1))
    const winners = [...alive].sort((a, b) => b.point - a.point).slice(0, targetRank)
    winners.forEach((p) => winCount.set(p.uuid, (winCount.get(p.uuid) || 0) + 1))
  }
  return Object.fromEntries(
    ids.map((id) => [
      id,
      {
        winProbability: winCount.get(id)! / iterations,
        survivalProbability: surviveCount.get(id)! / iterations,
      },
    ]),
  )
}

export function getClinchScore(
  targetUuid: string,
  players: SimPlayer[],
  currentRound: number,
  cuts: EliminationCut[],
): { score: number; place: number | 'DNF' } | null {
  const nextCut = cuts.find((c) => c.afterSeed >= currentRound)
  if (!nextCut || nextCut.afterSeed !== currentRound) return null
  if (isSafeAtNextCutDeterministic(targetUuid, players, currentRound, cuts, 0))
    return { score: 0, place: 'DNF' }
  const scores = getAvailableScores(players.length)
  for (let i = scores.length - 1; i >= 0; i--) {
    if (isSafeAtNextCutDeterministic(targetUuid, players, currentRound, cuts, scores[i]))
      return { score: scores[i], place: i + 1 }
  }
  return null
}

export function runFullHeatmapSimulation(
  players: SimPlayer[],
  currentRound: number,
  cuts: EliminationCut[],
  type?: string,
  iterations = 10000,
): Record<string, Record<number, number>> {
  const survivalCounts = new Map<string, Record<number, number>>()
  const ids = players.map((p) => p.uuid)
  const remainingCuts = cuts.filter((c) => c.afterSeed >= currentRound)

  for (const id of ids) {
    const counts: Record<number, number> = {}
    for (const cut of remainingCuts) counts[cut.afterSeed] = 0
    counts[999] = 0
    survivalCounts.set(id, counts)
  }

  const lobbyStats = calculateLobbyStats(players)

  if (currentRound > 10) {
    const sorted = [...players].sort((a, b) => b.point - a.point)
    for (let k = 0; k < Math.min(4, sorted.length); k++) {
      const counts = survivalCounts.get(sorted[k].uuid)
      if (counts) counts[999] = iterations
    }
  } else {
    for (let i = 0; i < iterations; i++) {
      let alive = players.map((p) => ({ ...p }))

      for (let r = currentRound; r <= 10; r++) {
        if (alive.length === 0) break

        const scores = getAvailableScores(alive.length)
        const perfs = alive
          .map((p, idx) => ({
            idx,
            val:
              Math.random() < getDNFProbability(p, lobbyStats)
                ? -Infinity
                : getPlayerPower(p, r, lobbyStats) +
                  (randomGaussian() * getPlayerVariance(p, lobbyStats)) / 3,
          }))
          .sort((a, b) => b.val - a.val)

        for (let j = 0; j < alive.length; j++) {
          alive[perfs[j].idx].point += scores[j]
        }

        const cut = remainingCuts.find((c) => c.afterSeed === r)
        if (cut) {
          alive = applyElimination(alive, cut)
          for (const survivor of alive) {
            survivalCounts.get(survivor.uuid)![r]++
          }
        }

        if (r === 10) {
          const sorted = [...alive].sort((a, b) => b.point - a.point)
          for (let k = 0; k < Math.min(4, sorted.length); k++) {
            survivalCounts.get(sorted[k].uuid)![999]++
          }
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
