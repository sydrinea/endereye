import { EventPlayer } from '../context/event'
import type { EliminationCut } from './config'

export type SimPlayer = EventPlayer & {
  point: number
  winRate: number
}

export interface LobbyStats {
  meanBest: number
  stdDevBest: number
  meanAvg: number
  meanGap: number
}

export interface MCResult {
  winProbability: number
  survivalProbability: number
}

export function toSimPlayer(player: EventPlayer, point: number): SimPlayer {
  const decisive = player.wins + player.losses
  return {
    ...player,
    eloRate: player.eloRate ?? 0,
    point,
    winRate: decisive > 0 ? player.wins / decisive : 0.5,
  }
}

const DEFAULT_LOBBY_STATS: LobbyStats = {
  meanBest: 300000,
  stdDevBest: 60000,
  meanAvg: 450000,
  meanGap: 150000,
}

export const EMPTY_PLAYER: EventPlayer = {
  uuid: '',
  nickname: '',
  country: null,
  eloRate: null,
  eloRank: null,
  bestTimeMs: 0,
  avgTimeMs: 0,
  wins: 0,
  losses: 0,
  playedMatches: 0,
  forfeits: 0,
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function calculateLobbyStats(players: SimPlayer[]): LobbyStats {
  const bestTimes = players.map((p) => p.bestTimeMs).filter((t) => t > 0)
  const avgTimes = players.map((p) => p.avgTimeMs).filter((t) => t > 0)

  if (bestTimes.length === 0 || avgTimes.length === 0) return DEFAULT_LOBBY_STATS

  const meanBest = mean(bestTimes)
  const meanAvg = mean(avgTimes)
  const gaps = players
    .filter((p) => p.bestTimeMs > 0 && p.avgTimeMs > 0)
    .map((p) => Math.max(0, p.avgTimeMs - p.bestTimeMs))
  const meanGap = gaps.length > 0 ? mean(gaps) : DEFAULT_LOBBY_STATS.meanGap
  const stdDevBest = Math.sqrt(mean(bestTimes.map((t) => (t - meanBest) ** 2)))

  return { meanBest, stdDevBest, meanAvg, meanGap }
}

function getAvailableScores(aliveCount: number): number[] {
  const N = Math.min(aliveCount, 24)
  return Array.from({ length: aliveCount }, (_, i) => {
    const p = i + 1
    return p > 24 ? 0 : Math.round((24 * (N - p + 1)) / N)
  })
}

export function applyElimination(players: SimPlayer[], cut: EliminationCut): SimPlayer[] {
  if (players.length === 0) return []
  if ('rule' in cut && cut.rule === 'zero_out') return players.filter((p) => p.point > 0)

  const sorted = [...players].sort((a, b) => b.point - a.point)
  const keepCount = 'rule' in cut ? Math.ceil(players.length / 2) : cut.keepTop
  if (keepCount >= sorted.length) return sorted

  const threshold = sorted[keepCount - 1].point
  return sorted.filter((p) => p.point >= threshold)
}

/**
 * Assigns scores for one seed in worst-case fashion:
 * target gets the minimum score, opponents are elevated as needed to push
 * target to exactly the cut boundary.
 */
function applyWorstCaseSeed(state: SimPlayer[], targetUuid: string): void {
  const scores = getAvailableScores(state.length)
  const tIdx = state.findIndex((p) => p.uuid === targetUuid)
  state[tIdx].point += scores[scores.length - 1]

  const targetPts = state[tIdx].point
  const avail = scores.slice(0, -1).sort((a, b) => a - b)
  const others = state.filter((p) => p.uuid !== targetUuid)
  const unassigned = [...others]

  // elevate players who are at or below target to push them above
  for (const p of [...unassigned]
    .filter((p) => p.point <= targetPts)
    .sort((a, b) => b.point - a.point)) {
    const needed = targetPts + 1 - p.point
    const idx = avail.findIndex((s) => s >= needed)
    if (idx === -1) continue
    p.point += avail.splice(idx, 1)[0]
    unassigned.splice(unassigned.indexOf(p), 1)
  }

  // distribute remaining scores to unassigned players
  for (const p of unassigned) p.point += avail.pop() ?? 0
}

/**
 * Best-case segment: target gets max score every seed,
 * opponents share remaining scores evenly.
 */
function applyBestCaseSegment(
  targetUuid: string,
  players: SimPlayer[],
  seeds: number,
): SimPlayer[] {
  if (seeds <= 0) return players
  const result = players.map((p) => ({ ...p }))
  const tIdx = result.findIndex((p) => p.uuid === targetUuid)
  if (tIdx === -1) return players

  for (let s = 0; s < seeds; s++) {
    const scores = getAvailableScores(result.length)
    result[tIdx].point += scores[0]
    const others = result.filter((p) => p.uuid !== targetUuid).sort((a, b) => b.point - a.point)
    for (let i = 0; i < others.length; i++) others[i].point += scores[i + 1] ?? 0
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

  const rank =
    [...alive].sort((a, b) => b.point - a.point).findIndex((p) => p.uuid === targetUuid) + 1
  return rank > 0 && rank <= targetRank
}

export function isSafeAtNextCutDeterministic(
  targetUuid: string,
  players: SimPlayer[],
  currentRound: number,
  cuts: EliminationCut[],
  fixedNextScore: number | null = null,
): boolean {
  const lastSeed = Math.max(...cuts.map((c) => c.afterSeed), currentRound)
  if (currentRound > lastSeed) return true
  const nextCut = cuts.find((c) => c.afterSeed >= currentRound)
  if (!nextCut) return true

  const state = players.map((p) => ({ ...p }))
  const tIdx = state.findIndex((p) => p.uuid === targetUuid)
  if (tIdx === -1) return false

  // apply fixed score for next seed, or worst case if not specified
  if (fixedNextScore !== null) {
    const scores = getAvailableScores(state.length)
    state[tIdx].point += fixedNextScore
    const otherScores = [...scores]
    const fIdx = otherScores.indexOf(fixedNextScore)
    if (fIdx !== -1) otherScores.splice(fIdx, 1)
    const targetPts = state[tIdx].point
    const avail = [...otherScores].sort((a, b) => a - b)
    const unassigned = state.filter((p) => p.uuid !== targetUuid)
    for (const p of [...unassigned]
      .filter((p) => p.point <= targetPts)
      .sort((a, b) => b.point - a.point)) {
      const needed = targetPts + 1 - p.point
      const idx = avail.findIndex((s) => s >= needed)
      if (idx === -1) continue
      p.point += avail.splice(idx, 1)[0]
      unassigned.splice(unassigned.indexOf(p), 1)
    }
    for (const p of unassigned) p.point += avail.pop() ?? 0
  } else {
    applyWorstCaseSeed(state, targetUuid)
  }

  // apply worst case for any remaining seeds before the cut
  for (let s = currentRound + 1; s < nextCut.afterSeed; s++) applyWorstCaseSeed(state, targetUuid)

  return applyElimination(state, nextCut).some((p) => p.uuid === targetUuid)
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

export function getDNFProbability(p: SimPlayer, stats: LobbyStats): number {
  const gap = Math.max(0, p.avgTimeMs - p.bestTimeMs)
  return Math.min(0.4, 0.12 * (gap / (stats.meanGap || DEFAULT_LOBBY_STATS.meanGap)) ** 1.5)
}

function getPlayerVariance(p: SimPlayer, stats: LobbyStats): number {
  const confidence = Math.min(p.playedMatches, 500) / 500
  const base = 2500 - 1000 * confidence
  const risk =
    (Math.max(0, p.avgTimeMs - p.bestTimeMs) / (stats.meanGap || DEFAULT_LOBBY_STATS.meanGap) -
      1.0) *
    800
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
  return power
}

function randomGaussian(): number {
  let u = 0,
    v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

function rankPlayers(alive: SimPlayer[], round: number, stats: LobbyStats) {
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

function simulateRound(alive: SimPlayer[], round: number, stats: LobbyStats): SimPlayer[] {
  const scores = getAvailableScores(alive.length)
  const ranked = rankPlayers(alive, round, stats)

  return alive.map((p, i) => {
    const rankIndex = ranked.findIndex((r) => r.idx === i)
    const earnedPoints = ranked[rankIndex].val === -Infinity ? 0 : (scores[rankIndex] ?? 0)
    return {
      ...p,
      point: p.point + earnedPoints,
    }
  })
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
  iterations = 10000,
): Record<string, MCResult> {
  const ids = players.map((p) => p.uuid)
  const winCount = new Map(ids.map((id) => [id, 0]))
  const surviveCount = new Map(ids.map((id) => [id, 0]))
  const lastSeed = Math.max(...cuts.map((c) => c.afterSeed), currentRound)

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
  const lastSeed = Math.max(...cuts.map((c) => c.afterSeed), currentRound)

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

export interface PlacementConstraint {
  uuid: string
  minPlace: number
}

export interface SurvivalScenario {
  constraints: PlacementConstraint[]
  survivalProbability: number
  frequency: number
}

export function runScenarioAnalysis(
  targetUuid: string,
  players: SimPlayer[],
  currentRound: number,
  cuts: EliminationCut[],
  qualifyCount: number,
  iterations = 20000,
  fixedTargetLast = false,
): SurvivalScenario[] {
  const nextCutEntry = cuts.find((c) => c.afterSeed >= currentRound)
  if (!nextCutEntry) return []

  const stats = calculateLobbyStats(players)
  const scores = getAvailableScores(players.length)
  const n = players.length

  type SimRecord = { placements: Record<string, number>; survived: boolean }
  const records: SimRecord[] = []

  for (let i = 0; i < iterations; i++) {
    let alive = players.map((p) => ({ ...p }))
    const placements: Record<string, number> = {}

    for (let r = currentRound; r <= nextCutEntry.afterSeed; r++) {
      if (alive.length === 0) break
      if (r === currentRound) {
        if (fixedTargetLast) {
          // Pin target to last place; randomly rank everyone else for the remaining slots
          const tIdx = alive.findIndex((p) => p.uuid === targetUuid)
          const others = alive.filter((_, i) => i !== tIdx)
          const otherRanked = rankPlayers(others, r, stats)
          const otherScores = scores.slice(0, n - 1)
          placements[targetUuid] = n
          otherRanked.forEach((entry, place) => {
            placements[others[entry.idx].uuid] = place + 1
          })
          alive = alive.map((p) => {
            if (p.uuid === targetUuid) return { ...p, point: p.point }
            const oIdx = others.findIndex((o) => o.uuid === p.uuid)
            const rank = otherRanked.findIndex((e) => e.idx === oIdx)
            return { ...p, point: p.point + (otherScores[rank] ?? 0) }
          })
        } else {
          const ranked = rankPlayers(alive, r, stats)
          ranked.forEach((entry, place) => {
            placements[alive[entry.idx].uuid] = place + 1
          })
          alive = alive.map((p, i) => ({
            ...p,
            point: p.point + scores[ranked.findIndex((entry) => entry.idx === i)],
          }))
        }
      } else {
        alive = simulateRound(alive, r, stats)
      }
      const cut = cuts.find((c) => c.afterSeed === r)
      if (cut) alive = applyElimination(alive, cut)
    }

    records.push({ placements, survived: alive.some((p) => p.uuid === targetUuid) })
  }

  const naturalSurvived = records.filter((r) => r.survived).length
  if (naturalSurvived === 0) return []

  const baseP = naturalSurvived / iterations
  const thresholds = [...new Set([3, 5, 7, n].filter((t) => t <= n && t > 1))]
  const MIN_FREQ = 0.05

  const opponents = players.filter((p) => p.uuid !== targetUuid)

  // Score each opponent by how much their placement correlates with target survival
  const dangerScores = opponents.map((opp) => {
    let score = 0
    for (const t of thresholds) {
      const matching = records.filter((rec) => rec.placements[opp.uuid] >= t)
      if (matching.length < iterations * MIN_FREQ) continue
      const condP = matching.filter((rec) => rec.survived).length / matching.length
      score += Math.abs(condP - baseP)
    }
    return { uuid: opp.uuid, score }
  })
  dangerScores.sort((a, b) => b.score - a.score)
  const dangerous = dangerScores.slice(0, 3).map((d) => d.uuid)

  const candidates: SurvivalScenario[] = []

  // Single-opponent scenarios
  for (const uuid of dangerous) {
    for (const t of thresholds) {
      const matching = records.filter((rec) => rec.placements[uuid] >= t)
      const frequency = matching.length / iterations
      if (frequency < MIN_FREQ) continue
      candidates.push({
        constraints: [{ uuid, minPlace: t }],
        survivalProbability: matching.filter((rec) => rec.survived).length / matching.length,
        frequency,
      })
    }
  }

  // Two-opponent scenarios
  for (let a = 0; a < dangerous.length; a++) {
    for (let b = a + 1; b < dangerous.length; b++) {
      for (const tA of thresholds) {
        for (const tB of thresholds) {
          const matching = records.filter(
            (rec) => rec.placements[dangerous[a]] >= tA && rec.placements[dangerous[b]] >= tB,
          )
          const frequency = matching.length / iterations
          if (frequency < MIN_FREQ) continue
          candidates.push({
            constraints: [
              { uuid: dangerous[a], minPlace: tA },
              { uuid: dangerous[b], minPlace: tB },
            ],
            survivalProbability: matching.filter((rec) => rec.survived).length / matching.length,
            frequency,
          })
        }
      }
    }
  }

  candidates.sort((a, b) => b.survivalProbability - a.survivalProbability)

  // Prune: remove scenarios dominated by a scenario with looser constraints + equal/better survival
  const pruned: SurvivalScenario[] = []
  for (const s of candidates) {
    const dominated = pruned.some(
      (existing) =>
        existing.survivalProbability >= s.survivalProbability &&
        existing.constraints.every((ec) => {
          const sc = s.constraints.find((c) => c.uuid === ec.uuid)
          return !sc || ec.minPlace <= sc.minPlace
        }),
    )
    if (!dominated) pruned.push(s)
  }

  return pruned.slice(0, 8)
}
