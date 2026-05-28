import type { EliminationCut } from './config'
import { type SimPlayer, calculateLobbyStats, createSimPool } from './player-model'
import { getAvailableScores } from './scoring'
import { rankInplace, simulateRoundInplace, applyEliminationInplace } from './monte-carlo'

export interface PlacementConstraint {
  uuid: string
  minPlace: number
  maxPlace?: number
}

export interface SurvivalScenario {
  constraints: PlacementConstraint[]
  survivalProbability: number
  frequency: number
}

export interface SharedRecord {
  placements: Record<string, number>
  survivedByUuid: Record<string, boolean>
}

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

function isFeasible(constraints: PlacementConstraint[]): boolean {
  const bounds = constraints.map((c) => c.maxPlace ?? Infinity).sort((a, b) => a - b)
  return bounds.every((t, i) => t >= i + 1)
}

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

// Simulate the first round in-place and record each alive player's placement (1-based).
function simulateFirstRoundInplace(
  pool: ReturnType<typeof createSimPool>,
  round: number,
  placements: Record<string, number>,
): void {
  const count = rankInplace(pool, round)
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

export function runBatchSimulation(
  players: SimPlayer[],
  currentRound: number,
  cuts: EliminationCut[],
  iterations = 20000,
): SharedRecord[] {
  const nextCutEntry = cuts.find((c) => c.afterSeed >= currentRound)
  if (!nextCutEntry) return []

  const n = players.length
  const stats = calculateLobbyStats(players)
  const pool = createSimPool(players, stats)
  const records: SharedRecord[] = []

  for (let iter = 0; iter < iterations; iter++) {
    pool.points.set(pool.basePoints)
    pool.alive.fill(1)

    const placements: Record<string, number> = {}

    for (let r = currentRound; r <= nextCutEntry.afterSeed; r++) {
      if (r === currentRound) {
        simulateFirstRoundInplace(pool, r, placements)
      } else {
        simulateRoundInplace(pool, r)
      }
      const cut = cuts.find((c) => c.afterSeed === r)
      if (cut) applyEliminationInplace(pool, cut)
    }

    const survivedByUuid: Record<string, boolean> = {}
    for (let i = 0; i < n; i++) survivedByUuid[pool.uuids[i]] = pool.alive[i] === 1
    records.push({ placements, survivedByUuid })
  }

  return records
}

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

export function runScenarioAnalysis(
  targetUuid: string,
  players: SimPlayer[],
  currentRound: number,
  cuts: EliminationCut[],
  iterations = 20000,
  fixedTargetLast = false,
  threatMode = false,
): { scenarios: SurvivalScenario[]; baseProbability: number } {
  const nextCutEntry = cuts.find((c) => c.afterSeed >= currentRound)
  if (!nextCutEntry) return { scenarios: [], baseProbability: 0 }

  const n = players.length
  const stats = calculateLobbyStats(players)
  const pool = createSimPool(players, stats)
  const targetIdx = pool.uuidToIdx.get(targetUuid) ?? -1
  if (targetIdx === -1) return { scenarios: [], baseProbability: 0 }

  type SimRecord = { placements: Record<string, number>; survived: boolean }
  const records: SimRecord[] = []

  for (let iter = 0; iter < iterations; iter++) {
    pool.points.set(pool.basePoints)
    pool.alive.fill(1)

    const placements: Record<string, number> = {}

    for (let r = currentRound; r <= nextCutEntry.afterSeed; r++) {
      if (r === currentRound) {
        if (fixedTargetLast) {
          // Force target to DNF: exclude from ranking, give them last place and 0 points
          pool.alive[targetIdx] = 0
          const count = rankInplace(pool, r)
          let completerCount = 0
          for (let k = 0; k < count; k++) if (pool.rankVals[k] !== -Infinity) completerCount++
          const scores = getAvailableScores(completerCount)
          let scoreIdx = 0
          for (let k = 0; k < count; k++) {
            const idx = pool.rankIdx[k]
            pool.points[idx] += pool.rankVals[k] !== -Infinity ? (scores[scoreIdx++] ?? 0) : 0
            placements[pool.uuids[idx]] = k + 1
          }
          placements[targetUuid] = n
          pool.alive[targetIdx] = 1 // restore — target didn't score but is still in the event
        } else {
          simulateFirstRoundInplace(pool, r, placements)
        }
      } else {
        simulateRoundInplace(pool, r)
      }
      const cut = cuts.find((c) => c.afterSeed === r)
      if (cut) applyEliminationInplace(pool, cut)
    }

    records.push({ placements, survived: pool.alive[targetIdx] === 1 })
  }

  const naturalSurvived = records.filter((r) => r.survived).length
  if (naturalSurvived === 0) return { scenarios: [], baseProbability: 0 }

  const baseP = naturalSurvived / iterations
  const opponents = players.filter((p) => p.uuid !== targetUuid)
  const scenarios = buildScenariosFromRecords(records, opponents, n, baseP, 5, 3, 8, threatMode)
  return { scenarios, baseProbability: baseP }
}
