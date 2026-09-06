import { getKeepCount, type EliminationCut } from './config'
import {
  type SimPlayer,
  type SimPool,
  calculateLobbyStats,
  createSimPool,
  randomGaussian,
} from './player-model'
import { getAvailableScores } from './scoring'

export interface MCResult {
  winProbability: number
  survivalProbability: number
}

// ─── SimPool primitives (used by runMonteCarlo / runBatchSimulation) ─────────

// Insertion sort on [0, count) entries of rankIdx by rankVals descending.
// Fast for n ≤ 24.
function sortRankArrays(rankIdx: Int32Array, rankVals: Float64Array, count: number): void {
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
export function rankPool(pool: SimPool, round: number): number {
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
  sortRankArrays(pool.rankIdx, pool.rankVals, count)
  return count
}

// Simulates one round in-place: updates pool.points[i] with earned scores.
export function simulateRound(pool: SimPool, round: number): void {
  const count = rankPool(pool, round)
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
export function applyPoolElimination(pool: SimPool, cut: EliminationCut): void {
  if ('rule' in cut && cut.rule === 'zero_out') {
    for (let i = 0; i < pool.n; i++) {
      if (pool.alive[i] && pool.points[i] === 0) pool.alive[i] = 0
    }
    return
  }

  // Count alive and collect points to find threshold
  let aliveCount = 0
  for (let i = 0; i < pool.n; i++) if (pool.alive[i]) aliveCount++

  const keepCount = Math.min(getKeepCount(cut, aliveCount), aliveCount)
  if (keepCount >= aliveCount) return

  // Find the kth-largest point value (threshold) using a partial selection
  // on the alive indices already in pool.rankIdx from the last rankPool call.
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
  const sorted = new Float64Array(k)
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

// Calls `cb(i)` once for every currently-alive player at rank <= targetRank,
// where rank is 1 + #{alive players with strictly more points}. Ties at the
// qualifying boundary all get the same rank and are all included — matching
// applyElimination's own `>= threshold` tie handling — rather than an
// order-dependent early cutoff, which could previously both over-count (every
// tied player incrementing at once) and arbitrarily truncate (whichever tied
// player came first in array order) in the same pass. Shared by all three
// simulation entry points below so the fix only has to live in one place.
function forEachTopByPoints(pool: SimPool, targetRank: number, cb: (i: number) => void): void {
  for (let i = 0; i < pool.n; i++) {
    if (!pool.alive[i]) continue
    let rank = 1
    for (let j = 0; j < pool.n; j++) {
      if (pool.alive[j] && j !== i && pool.points[j] > pool.points[i]) rank++
    }
    if (rank <= targetRank) cb(i)
  }
}

// Runs one full simulated iteration in-place: resets the pool, plays every
// round from currentRound..lastSeed (via the supplied `simulateRound`, so
// callers can pin a hypothetical first round), applies each cut as it's
// reached, and tallies `surviveCount` at whichever cut is `nextCut` (or at
// the very end, if there is none). Used by runMonteCarlo for both its plain
// and fixed-placement paths — previously two separate functions that
// copy-pasted this loop.
function runMCIteration(
  pool: SimPool,
  currentRound: number,
  lastSeed: number,
  cuts: EliminationCut[],
  nextCut: EliminationCut | undefined,
  surviveCount: Int32Array,
  simulateRound: (pool: SimPool, round: number) => void,
): void {
  pool.points.set(pool.basePoints)
  pool.alive.fill(1)

  for (let r = currentRound; r <= lastSeed; r++) {
    simulateRound(pool, r)
    const cut = cuts.find((c) => c.afterSeed === r)
    if (cut) {
      applyPoolElimination(pool, cut)
      if (cut === nextCut) {
        for (let i = 0; i < pool.n; i++) if (pool.alive[i]) surviveCount[i]++
      }
    }
  }

  if (!nextCut) {
    for (let i = 0; i < pool.n; i++) if (pool.alive[i]) surviveCount[i]++
  }
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

// Simulates the current round with some players pinned to a fixed finishing place.
// `fixedByIdx[i]` is the 1-based place player i must finish in, or -1 if free.
// No DNFs are modelled for this hypothetical round. `order` / `queue` are scratch
// Int32Arrays of length ≥ pool.n, supplied by the caller to avoid per-iteration allocation.
function simulateFixedRound(
  pool: SimPool,
  round: number,
  fixedByIdx: Int32Array,
  order: Int32Array,
  queue: Int32Array,
): void {
  let count = 0
  for (let i = 0; i < pool.n; i++) {
    if (!pool.alive[i]) continue
    pool.rankVals[count] =
      pool.powerByRound[i * 11 + round] + (randomGaussian() * pool.variance[i]) / 3
    pool.rankIdx[count] = i
    count++
  }
  sortRankArrays(pool.rankIdx, pool.rankVals, count)

  for (let k = 0; k < count; k++) order[k] = -1
  let queueLen = 0
  for (let k = 0; k < count; k++) {
    const idx = pool.rankIdx[k]
    const place = fixedByIdx[idx]
    if (place >= 1 && place <= count && order[place - 1] === -1) {
      order[place - 1] = idx
    } else {
      queue[queueLen++] = idx
    }
  }
  let q = 0
  for (let slot = 0; slot < count; slot++) {
    if (order[slot] === -1) order[slot] = queue[q++]
  }

  const scores = getAvailableScores(count)
  for (let slot = 0; slot < count; slot++) {
    pool.points[order[slot]] += scores[slot] ?? 0
  }
}

// `opts.fixed`, if given, pins those players to a known finishing place in the
// current round (a "what-if the seed finished like this" hypothetical) — uuid
// → 1-based place. An empty/absent map runs the normal simulation. Default
// iterations is lower (5000) when `fixed` is present, matching the historical
// default for hypothetical recomputes, which run more often and more cheaply.
export function runMonteCarlo(
  players: SimPlayer[],
  currentRound: number,
  cuts: EliminationCut[],
  targetRank: number,
  opts?: { iterations?: number; fixed?: Record<string, number> },
): Record<string, MCResult> {
  const fixed = opts?.fixed && Object.keys(opts.fixed).length > 0 ? opts.fixed : undefined
  const iterations = opts?.iterations ?? (fixed ? 5000 : 20000)

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
    return toMCResults(
      players.map((p) => p.uuid),
      winCount,
      surviveCount,
      iterations,
    )
  }

  const pool = createSimPool(players, stats)
  const winCount = new Int32Array(n)
  const surviveCount = new Int32Array(n)
  const nextCut = cuts.find((c) => c.afterSeed >= currentRound)

  let simulateCurrentRound = simulateRound
  if (fixed) {
    const fixedByIdx = new Int32Array(n).fill(-1)
    for (const [uuid, place] of Object.entries(fixed)) {
      const idx = pool.uuidToIdx.get(uuid)
      if (idx !== undefined) fixedByIdx[idx] = place
    }
    const order = new Int32Array(n)
    const queue = new Int32Array(n)
    simulateCurrentRound = (p, r) =>
      r === currentRound ? simulateFixedRound(p, r, fixedByIdx, order, queue) : simulateRound(p, r)
  }

  for (let iter = 0; iter < iterations; iter++) {
    runMCIteration(pool, currentRound, lastSeed, cuts, nextCut, surviveCount, simulateCurrentRound)
    forEachTopByPoints(pool, targetRank, (i) => winCount[i]++)
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
  const survivalCounts: Int32Array[] = Array.from(
    { length: n },
    () => new Int32Array(cutSeeds.length + 1),
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
        simulateRound(pool, r)
        const cutIdx = cutSeeds.indexOf(r)
        if (cutIdx !== -1) {
          applyPoolElimination(pool, remainingCuts[cutIdx])
          for (let i = 0; i < n; i++) if (pool.alive[i]) survivalCounts[i][cutIdx]++
        }
        if (r === lastSeed) {
          forEachTopByPoints(pool, qualifyCount, (i) => survivalCounts[i][cutSeeds.length]++)
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
