import type { EliminationCut } from './config'
import {
  type SimPlayer,
  type LobbyStats,
  type SimPool,
  calculateLobbyStats,
  createSimPool,
  getDNFProbability,
  getPlayerPower,
  getPlayerVariance,
  randomGaussian,
} from './player-model'
import { getAvailableScores } from './scoring'

export interface MCResult {
  winProbability: number
  survivalProbability: number
}

// ─── Legacy exports (kept for test compatibility) ────────────────────────────

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

// ─── Inplace SimPool variants (used by runMonteCarlo / runBatchSimulation) ───

// Insertion sort on [0, count) entries of rankIdx by rankVals descending.
// Fast for n ≤ 24.
function sortRankInplace(rankIdx: Int32Array, rankVals: Float64Array, count: number): void {
  for (let i = 1; i < count; i++) {
    const keyIdx = rankIdx[i]
    const keyVal = rankVals[i]
    let j = i - 1
    while (j >= 0 && rankVals[j] < keyVal) {
      rankIdx[j + 1] = rankIdx[j]
      rankVals[j + 1] = rankVals[j]
      j--
    }
    rankIdx[j + 1] = keyIdx
    rankVals[j + 1] = keyVal
  }
}

// Fills pool.rankIdx[0..aliveCount) with sorted alive player indices (descending by rank value).
// Returns the number of alive players written.
export function rankInplace(pool: SimPool, round: number): number {
  let count = 0
  for (let i = 0; i < pool.n; i++) {
    if (!pool.alive[i]) continue
    const isDNF = Math.random() < pool.dnfProb[i]
    pool.rankVals[count] = isDNF
      ? -Infinity
      : pool.powerByRound[i * 11 + round] + (randomGaussian() * pool.variance[i]) / 3
    pool.rankIdx[count] = i
    count++
  }
  sortRankInplace(pool.rankIdx, pool.rankVals, count)
  return count
}

// Simulates one round in-place: updates pool.points[i] with earned scores.
export function simulateRoundInplace(pool: SimPool, round: number): void {
  const count = rankInplace(pool, round)
  let completerCount = 0
  for (let k = 0; k < count; k++) {
    if (pool.rankVals[k] !== -Infinity) completerCount++
  }
  const scores = getAvailableScores(completerCount)
  let scoreIdx = 0
  for (let k = 0; k < count; k++) {
    const idx = pool.rankIdx[k]
    pool.points[idx] += pool.rankVals[k] !== -Infinity ? (scores[scoreIdx++] ?? 0) : 0
  }
}

// Eliminates players in-place by zeroing pool.alive[i].
export function applyEliminationInplace(pool: SimPool, cut: EliminationCut): void {
  if ('rule' in cut && cut.rule === 'zero_out') {
    for (let i = 0; i < pool.n; i++) {
      if (pool.alive[i] && pool.points[i] === 0) pool.alive[i] = 0
    }
    return
  }

  // Count alive and collect points to find threshold
  let aliveCount = 0
  for (let i = 0; i < pool.n; i++) if (pool.alive[i]) aliveCount++

  const keepCount =
    'rule' in cut ? Math.ceil(aliveCount / 2) : Math.min(cut.keepTop, aliveCount)
  if (keepCount >= aliveCount) return

  // Find the kth-largest point value (threshold) using a partial selection
  // on the alive indices already in pool.rankIdx from the last rankInplace call.
  // pool.rankIdx[0..aliveCount) is sorted descending by rank value (not points),
  // so we need to find threshold by point value instead.
  // Simple approach: collect alive points, sort descending, take index keepCount-1.
  let k = 0
  for (let i = 0; i < pool.n; i++) {
    if (pool.alive[i]) pool.rankVals[k++] = pool.points[i]
  }
  // Partial sort: find the keepCount-th largest (0-indexed: keepCount-1)
  // Use a simple selection for small n
  const threshold = kthLargest(pool.rankVals, aliveCount, keepCount)

  for (let i = 0; i < pool.n; i++) {
    if (pool.alive[i] && pool.points[i] < threshold) pool.alive[i] = 0
  }
}

// Returns the kth-largest value (1-indexed) in vals[0..n) without allocating.
function kthLargest(vals: Float64Array, n: number, k: number): number {
  // Insertion sort the first k elements, then scan the rest
  // For tiny n (≤24) this is fine
  let sorted = new Float64Array(k)
  for (let i = 0; i < k; i++) sorted[i] = vals[i]
  sorted.sort().reverse() // ascending → reverse for descending; k is tiny
  for (let i = k; i < n; i++) {
    if (vals[i] > sorted[k - 1]) {
      sorted[k - 1] = vals[i]
      // bubble up
      let j = k - 1
      while (j > 0 && sorted[j] > sorted[j - 1]) {
        const tmp = sorted[j]
        sorted[j] = sorted[j - 1]
        sorted[j - 1] = tmp
        j--
      }
    }
  }
  return sorted[k - 1]
}

// ─── Public simulation functions ─────────────────────────────────────────────

function toMCResults(
  uuids: string[],
  winCount: Int32Array,
  surviveCount: Int32Array,
  iterations: number,
): Record<string, MCResult> {
  return Object.fromEntries(
    uuids.map((id, i) => [
      id,
      {
        winProbability: winCount[i] / iterations,
        survivalProbability: surviveCount[i] / iterations,
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
  const n = players.length
  const stats = calculateLobbyStats(players)
  const lastSeed = cuts.length > 0 ? Math.max(...cuts.map((c) => c.afterSeed)) : currentRound - 1

  if (currentRound > lastSeed) {
    const winCount = new Int32Array(n)
    const surviveCount = new Int32Array(n).fill(iterations)
    const sorted = [...players].sort((a, b) => b.point - a.point)
    for (let r = 0; r < Math.min(targetRank, n); r++) {
      const idx = players.indexOf(sorted[r])
      winCount[idx] = iterations
    }
    return toMCResults(players.map((p) => p.uuid), winCount, surviveCount, iterations)
  }

  const pool = createSimPool(players, stats)
  const winCount = new Int32Array(n)
  const surviveCount = new Int32Array(n)
  const nextCut = cuts.find((c) => c.afterSeed >= currentRound)

  for (let iter = 0; iter < iterations; iter++) {
    pool.points.set(pool.basePoints)
    pool.alive.fill(1)

    for (let r = currentRound; r <= lastSeed; r++) {
      simulateRoundInplace(pool, r)
      const cut = cuts.find((c) => c.afterSeed === r)
      if (cut) {
        applyEliminationInplace(pool, cut)
        if (cut === nextCut) {
          for (let i = 0; i < n; i++) if (pool.alive[i]) surviveCount[i]++
        }
      }
    }

    if (!nextCut) {
      for (let i = 0; i < n; i++) if (pool.alive[i]) surviveCount[i]++
    }

    // Top targetRank alive players by points win
    let topCount = 0
    for (let i = 0; i < n; i++) {
      if (!pool.alive[i]) continue
      // Check if this player is in the top targetRank by point
      let rank = 1
      for (let j = 0; j < n; j++) {
        if (pool.alive[j] && j !== i && pool.points[j] > pool.points[i]) rank++
      }
      if (rank <= targetRank) { winCount[i]++; topCount++ }
      if (topCount >= targetRank) break
    }
  }

  return toMCResults(pool.uuids, winCount, surviveCount, iterations)
}

export function runFullHeatmapSimulation(
  players: SimPlayer[],
  currentRound: number,
  cuts: EliminationCut[],
  iterations = 10000,
  qualifyCount = 4,
): Record<string, Record<number, number>> {
  const n = players.length
  const remainingCuts = cuts.filter((c) => c.afterSeed >= currentRound)
  const lastSeed = cuts.length > 0 ? Math.max(...cuts.map((c) => c.afterSeed)) : currentRound - 1

  // survivalCounts[i][cutSeed] = number of times player i survived past cutSeed
  // key 999 = final winner
  const cutSeeds = remainingCuts.map((c) => c.afterSeed)
  const survivalCounts: Int32Array[] = Array.from({ length: n }, () =>
    new Int32Array(cutSeeds.length + 1),
  )

  if (currentRound > lastSeed) {
    const sorted = [...players].sort((a, b) => b.point - a.point)
    for (let r = 0; r < Math.min(qualifyCount, n); r++) {
      const idx = players.indexOf(sorted[r])
      survivalCounts[idx][cutSeeds.length] = iterations
    }
  } else {
    const stats = calculateLobbyStats(players)
    const pool = createSimPool(players, stats)

    for (let iter = 0; iter < iterations; iter++) {
      pool.points.set(pool.basePoints)
      pool.alive.fill(1)

      for (let r = currentRound; r <= lastSeed; r++) {
        simulateRoundInplace(pool, r)
        const cutIdx = cutSeeds.indexOf(r)
        if (cutIdx !== -1) {
          applyEliminationInplace(pool, remainingCuts[cutIdx])
          for (let i = 0; i < n; i++) if (pool.alive[i]) survivalCounts[i][cutIdx]++
        }
        if (r === lastSeed) {
          // top qualifyCount by points
          let counted = 0
          for (let rank = 0; rank < n && counted < qualifyCount; rank++) {
            // find the (rank+1)th best alive player
            let best = -1
            let bestPts = -Infinity
            for (let i = 0; i < n; i++) {
              if (pool.alive[i] && pool.points[i] > bestPts) {
                // make sure not already counted — track with a flag
                bestPts = pool.points[i]
                best = i
              }
            }
            if (best !== -1) {
              survivalCounts[best][cutSeeds.length]++
              pool.alive[best] = 0 // mark as "counted" for this iteration
              counted++
            }
          }
        }
      }
    }
  }

  return Object.fromEntries(
    players.map((p, i) => [
      p.uuid,
      Object.fromEntries([
        ...cutSeeds.map((seed, k) => [seed, survivalCounts[i][k] / iterations]),
        [999, survivalCounts[i][cutSeeds.length] / iterations],
      ]),
    ]),
  )
}
