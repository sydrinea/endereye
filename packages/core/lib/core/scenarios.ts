/**
 * Scenario mining: run one batch simulation of the current seed, recording
 * every player's finishing place and whether the target survived, then search
 * that record set for small sets of opponent placements that move the target's
 * survival probability the most.
 *
 * A scenario is a human-readable "for you to survive, these players need to
 * finish here" (or, in `threatMode`, "you're in trouble if these players
 * finish here"). Reuses `monte-carlo.ts`'s round primitives.
 */
import type { EliminationCut } from './config'
import { type SimPlayer, calculateLobbyStats, createSimPool } from './player-model'
import { getAvailableScores } from './scoring'
import { rankPool, simulateRound, applyPoolElimination } from './monte-carlo'

/** One clause of a scenario. `minPlace` alone = "finishes Nth or better"; `maxPlace` = "no better than". */
export interface PlacementConstraint {
  uuid: string
  minPlace: number
  maxPlace?: number
}

export interface SurvivalScenario {
  constraints: PlacementConstraint[]
  /** Target's survival probability across the iterations that satisfy `constraints`. */
  survivalProbability: number
  /** Fraction of the focus set (surviving, or in `threatMode` non-surviving) that satisfy `constraints`. */
  frequency: number
}

/** One simulated iteration: where everyone finished and who survived the cut. */
export interface SharedRecord {
  placements: Record<string, number>
  survivedByUuid: Record<string, boolean>
}

/** Do these recorded placements satisfy every constraint? Missing placement fails the clause. */
function constraintsMet(
  placements: Record<string, number>,
  constraints: PlacementConstraint[],
): boolean {
  return constraints.every((c) =>
    c.maxPlace !== undefined
      ? (placements[c.uuid] ?? Infinity) <= c.maxPlace
      : (placements[c.uuid] ?? 0) >= c.minPlace,
  )
}

/**
 * Can several "no better than place N" clauses hold at once? Sorting the bounds
 * ascending, the i-th tightest must allow at least place `i + 1` (Hall's
 * condition) — otherwise two players are fighting for the same top slots.
 */
function isFeasible(constraints: PlacementConstraint[]): boolean {
  const bounds = constraints.map((c) => c.maxPlace ?? Infinity).sort((a, b) => a - b)
  return bounds.every((t, i) => t >= i + 1)
}

/**
 * The miner. For each candidate opponent it picks the placement threshold with
 * the highest "lift" (how much more often that opponent hits the threshold in
 * the target's focus outcomes than overall), keeps the `maxDangerous` highest,
 * then tries every 1-, 2-, and 3-clause combination of them. A combo is kept
 * only if it covers ≥ 5% of the focus set and shifts survival probability by
 * ≥ 5 points; combos that are strictly implied by a shorter kept combo are
 * dropped. Returns up to `maxScenarios`, most frequent first.
 */
function buildScenariosFromRecords(
  records: { placements: Record<string, number>; survived: boolean }[],
  opponents: SimPlayer[],
  n: number,
  baseP: number,
  maxDangerous = 5,
  maxDepth = 3,
  maxScenarios = 8,
  threatMode = false,
): SurvivalScenario[] {
  const thresholds = threatMode
    ? [...new Set([2, 3, 5, 7].filter((t) => t < n))]
    : [...new Set([3, 5, 7].filter((t) => t <= n && t > 1))]

  const focusRecords = records.filter((r) => (threatMode ? !r.survived : r.survived))
  const focusCount = focusRecords.length
  if (focusCount === 0) return []

  const total = records.length

  function matchesThreshold(
    uuid: string,
    t: number,
    rec: { placements: Record<string, number> },
  ): boolean {
    return threatMode ? (rec.placements[uuid] ?? Infinity) <= t : (rec.placements[uuid] ?? 0) >= t
  }

  const oppBest = opponents.map((opp) => {
    let bestLift = 0
    let bestThreshold = thresholds[thresholds.length - 1]
    for (const t of thresholds) {
      const freqInFocus =
        focusRecords.filter((r) => matchesThreshold(opp.uuid, t, r)).length / focusCount
      const freqInAll = records.filter((r) => matchesThreshold(opp.uuid, t, r)).length / total
      if (freqInAll > 0.05) {
        const lift = freqInFocus / freqInAll
        if (lift > bestLift) {
          bestLift = lift
          bestThreshold = t
        }
      }
    }
    return { uuid: opp.uuid, threshold: bestThreshold, lift: bestLift }
  })
  oppBest.sort((a, b) => b.lift - a.lift)
  const dangerous = oppBest.slice(0, maxDangerous)

  const candidates: SurvivalScenario[] = []

  function makeConstraint(uuid: string, t: number): PlacementConstraint {
    return threatMode ? { uuid, minPlace: 1, maxPlace: t } : { uuid, minPlace: t }
  }

  function addCandidate(constraints: PlacementConstraint[]) {
    if (threatMode && !isFeasible(constraints)) return
    const matchingFocus = focusRecords.filter((rec) => constraintsMet(rec.placements, constraints))
    const frequency = matchingFocus.length / focusCount
    if (frequency < 0.05) return
    const matchingAll = records.filter((rec) => constraintsMet(rec.placements, constraints))
    const survivalProbability =
      matchingAll.length > 0
        ? matchingAll.filter((r) => r.survived).length / matchingAll.length
        : baseP
    if (Math.abs(survivalProbability - baseP) < 0.05) return
    candidates.push({ constraints, survivalProbability, frequency })
  }

  for (const opp of dangerous) {
    addCandidate([makeConstraint(opp.uuid, opp.threshold)])
  }

  if (maxDepth >= 2) {
    for (let a = 0; a < dangerous.length; a++) {
      for (let b = a + 1; b < dangerous.length; b++) {
        addCandidate([
          makeConstraint(dangerous[a].uuid, dangerous[a].threshold),
          makeConstraint(dangerous[b].uuid, dangerous[b].threshold),
        ])
      }
    }
  }

  if (maxDepth >= 3) {
    for (let a = 0; a < dangerous.length; a++) {
      for (let b = a + 1; b < dangerous.length; b++) {
        for (let c = b + 1; c < dangerous.length; c++) {
          addCandidate([
            makeConstraint(dangerous[a].uuid, dangerous[a].threshold),
            makeConstraint(dangerous[b].uuid, dangerous[b].threshold),
            makeConstraint(dangerous[c].uuid, dangerous[c].threshold),
          ])
        }
      }
    }
  }

  candidates.sort((a, b) => b.frequency - a.frequency)

  const deduped = candidates.filter((scenario) => {
    if (scenario.constraints.length <= 1) return true
    return !candidates.some(
      (other) =>
        other.constraints.length < scenario.constraints.length &&
        other.constraints.every((oc) =>
          scenario.constraints.some(
            (sc) =>
              sc.uuid === oc.uuid &&
              sc.minPlace === oc.minPlace &&
              sc.maxPlace === oc.maxPlace,
          ),
        ),
    )
  })

  return deduped.slice(0, maxScenarios)
}

/** Simulate the current round and record each alive player's 1-based placement into `placements`. */
function simulateFirstRound(
  pool: ReturnType<typeof createSimPool>,
  round: number,
  placements: Record<string, number>,
): void {
  const count = rankPool(pool, round)
  let completerCount = 0
  for (let k = 0; k < count; k++) if (pool.rankVals[k] !== -Infinity) completerCount++
  const scores = getAvailableScores(completerCount)
  let scoreIdx = 0
  for (let k = 0; k < count; k++) {
    const idx = pool.rankIdx[k]
    pool.points[idx] += pool.rankVals[k] !== -Infinity ? (scores[scoreIdx++] ?? 0) : 0
    placements[pool.uuids[idx]] = k + 1
  }
}

/**
 * Like `simulateFirstRound`, but `targetIdx` sits the round out (DNF, scores
 * nothing, recorded last) and is restored to alive afterwards. Conditions the
 * batch on "the target failed this round," which is what a failure/threat
 * scenario asks about.
 */
function simulateFirstRoundForcedDnf(
  pool: ReturnType<typeof createSimPool>,
  round: number,
  targetIdx: number,
  placements: Record<string, number>,
): void {
  pool.alive[targetIdx] = 0
  const count = rankPool(pool, round)
  let completerCount = 0
  for (let k = 0; k < count; k++) if (pool.rankVals[k] !== -Infinity) completerCount++
  const scores = getAvailableScores(completerCount)
  let scoreIdx = 0
  for (let k = 0; k < count; k++) {
    const idx = pool.rankIdx[k]
    pool.points[idx] += pool.rankVals[k] !== -Infinity ? (scores[scoreIdx++] ?? 0) : 0
    placements[pool.uuids[idx]] = k + 1
  }
  placements[pool.uuids[targetIdx]] = pool.n
  pool.alive[targetIdx] = 1 // restore — target didn't score but is still in the event
}

/**
 * Runs `iterations` simulations from `currentRound` up to (and including) the
 * next cut seed, returning one `SharedRecord` per iteration. Only the first
 * round's placements are recorded — the scenarios are always phrased in terms
 * of "how this seed finishes."
 * @param fixedTargetUuid if set, that player DNFs the current round every iteration.
 */
export function runBatchSimulation(
  players: SimPlayer[],
  currentRound: number,
  cuts: EliminationCut[],
  iterations = 20000,
  fixedTargetUuid?: string,
): SharedRecord[] {
  const nextCutEntry = cuts.find((c) => c.afterSeed >= currentRound)
  if (!nextCutEntry) return []

  const n = players.length
  const stats = calculateLobbyStats(players)
  const pool = createSimPool(players, stats)
  const targetIdx = fixedTargetUuid !== undefined ? (pool.uuidToIdx.get(fixedTargetUuid) ?? -1) : -1
  const records: SharedRecord[] = []

  for (let iter = 0; iter < iterations; iter++) {
    pool.points.set(pool.basePoints)
    pool.alive.fill(1)

    const placements: Record<string, number> = {}

    for (let r = currentRound; r <= nextCutEntry.afterSeed; r++) {
      if (r === currentRound) {
        if (targetIdx !== -1) simulateFirstRoundForcedDnf(pool, r, targetIdx, placements)
        else simulateFirstRound(pool, r, placements)
      } else {
        simulateRound(pool, r)
      }
      const cut = cuts.find((c) => c.afterSeed === r)
      if (cut) applyPoolElimination(pool, cut)
    }

    const survivedByUuid: Record<string, boolean> = {}
    for (let i = 0; i < n; i++) survivedByUuid[pool.uuids[i]] = pool.alive[i] === 1
    records.push({ placements, survivedByUuid })
  }

  return records
}

/**
 * Adapts a shared batch to one target — computes their natural survival rate
 * (`baseProbability`), picks the focus set, and hands off to the miner. Returns
 * no scenarios if the focus set is empty (the target always survives, or in
 * `threatMode` never fails).
 */
export function derivePlayerScenarios(
  targetUuid: string,
  records: SharedRecord[],
  players: SimPlayer[],
  options?: {
    maxDangerous?: number
    maxDepth?: number
    maxScenarios?: number
    threatMode?: boolean
  },
): { scenarios: SurvivalScenario[]; baseProbability: number } {
  const naturalSurvived = records.filter((r) => r.survivedByUuid[targetUuid]).length
  const focusCount = options?.threatMode ? records.length - naturalSurvived : naturalSurvived
  if (focusCount === 0) return { scenarios: [], baseProbability: 0 }

  const baseP = naturalSurvived / records.length
  const n = players.length
  const opponents = players.filter((p) => p.uuid !== targetUuid)

  const adapted = records.map((r) => ({
    placements: r.placements,
    survived: r.survivedByUuid[targetUuid],
  }))

  const scenarios = buildScenariosFromRecords(
    adapted,
    opponents,
    n,
    baseP,
    options?.maxDangerous ?? 5,
    options?.maxDepth ?? 3,
    options?.maxScenarios ?? 8,
    options?.threatMode ?? false,
  )

  return { scenarios, baseProbability: baseP }
}
