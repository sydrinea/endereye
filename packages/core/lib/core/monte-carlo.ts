/**
 * The Monte Carlo engine: play the rest of an event thousands of times on a
 * `SimPool` and count how often each player wins (finishes in the top
 * `targetRank`) and survives the next cut.
 *
 * Everything here works directly on the pool's typed arrays and does no
 * per-iteration allocation. `scenarios.ts` reuses the same round primitives
 * (`rankPool`, `simulateRound`, `applyPoolElimination`) to record placements.
 */
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
  /** Fraction of iterations the player finished in the top `targetRank`. */
  winProbability: number
  /** Fraction of iterations the player was still alive at the next cut (or at the end). */
  survivalProbability: number
}

// ─── SimPool primitives ─────────────────────────────────────────────────────

/**
 * Insertion sort of `rankIdx[0..count)` by `rankVals` descending, keys moved in
 * lockstep. Insertion sort because `count` is a lobby (≤ 24) and it's the
 * fastest option at that size, run once per simulated round.
 */
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

/**
 * Rolls a DNF for each alive player, computes everyone else's noisy power for
 * the round (`power + gaussian * variance / 3`; a DNF gets `-Infinity` so it
 * sorts last), writes the alive indices into `pool.rankIdx` sorted best-first,
 * and returns the alive count. The `/ 3` scales the stored SD down to a
 * per-round shock.
 */
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

/**
 * One round in place: rank the field, then award `getAvailableScores(completerCount)`
 * to the completers in finishing order. DNFs (rank value `-Infinity`) score nothing.
 */
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

/**
 * Typed-array equivalent of `scoring.ts`'s `applyElimination`: clears
 * `pool.alive[i]` for eliminated players. `zero_out` drops players on 0 points;
 * otherwise it finds the keep-count-th largest point total and eliminates
 * everyone strictly below it (so cutline ties are kept, matching the array path).
 */
export function applyPoolElimination(pool: SimPool, cut: EliminationCut): void {
  if ('rule' in cut && cut.rule === 'zero_out') {
    for (let i = 0; i < pool.n; i++) {
      if (pool.alive[i] && pool.points[i] === 0) pool.alive[i] = 0
    }
    return
  }

  let aliveCount = 0
  for (let i = 0; i < pool.n; i++) if (pool.alive[i]) aliveCount++

  const keepCount = Math.min(getKeepCount(cut, aliveCount), aliveCount)
  if (keepCount >= aliveCount) return

  // Threshold = the keepCount-th largest point total among the alive. Collect
  // alive points into the rankVals scratch array (rankIdx from the last
  // rankPool is ordered by power, not points, so it can't be reused here).
  let k = 0
  for (let i = 0; i < pool.n; i++) {
    if (pool.alive[i]) pool.rankVals[k++] = pool.points[i]
  }
  const threshold = kthLargest(pool.rankVals, aliveCount, keepCount)

  for (let i = 0; i < pool.n; i++) {
    if (pool.alive[i] && pool.points[i] < threshold) pool.alive[i] = 0
  }
}

/**
 * The k-th largest value (1-indexed) in `vals[0..n)`. Keeps a sorted buffer of
 * the top `k` seen so far and slots each later value in; O(n·k), which is
 * nothing at lobby size. `k` is tiny so the initial `.sort().reverse()` is fine.
 */
function kthLargest(vals: Float64Array, n: number, k: number): number {
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

/**
 * Calls `cb(i)` for every alive player whose points-rank is `<= targetRank`,
 * where rank is `1 + #{alive players with strictly more points}`. Ties on the
 * boundary all share a rank and are all included, matching the `>= threshold`
 * tie handling in elimination — a 3-way tie for 4th with `targetRank` 4 fires
 * `cb` three times. O(n²), negligible at lobby size.
 */
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

/**
 * One full simulated event in place: reset the pool, play seeds
 * `currentRound..lastSeed` through the supplied `simulateRound` (so a caller
 * can pin the first round), apply each cut as its seed is reached, and
 * increment `surviveCount[i]` for everyone alive at `nextCut` — or at the end
 * if there is no upcoming cut.
 */
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

/** Turns the raw per-index win/survive counts into a uuid-keyed `MCResult` map. */
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

/**
 * The current round with some players pinned to a finishing place
 * (`fixedByIdx[i]` = 1-based place, or -1 if free). Free players fill the
 * leftover slots in power order. No DNFs — this is a "what if the seed finished
 * like this" round. `order` and `queue` are caller-owned scratch arrays
 * (length ≥ `pool.n`) so the per-iteration path stays allocation-free.
 */
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

/**
 * Runs the Monte Carlo for a live event and returns each player's win and
 * survival probability.
 *
 * If the event is already past its last cut, results are exact (the current top
 * `targetRank` win with probability 1) and no simulation runs.
 *
 * @param targetRank "win" means finishing this rank or better (usually the
 *   qualify count).
 * @param opts.fixed uuid → 1-based place, pins those players in `currentRound`
 *   for a hypothetical recompute. Defaults to 5000 iterations in that mode
 *   (hypotheticals rerun on every client interaction) vs 20000 normally.
 */
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

/**
 * Like `runMonteCarlo` but records, per player, the probability of surviving
 * *past each remaining cut seed* — the data behind the standings heatmap.
 *
 * @returns uuid → { cutSeed → survival probability, 999 → probability of being
 *   a final qualifier }.
 */
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
