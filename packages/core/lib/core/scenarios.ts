import type { EliminationCut } from './config'
import { type SimPlayer, type LobbyStats, calculateLobbyStats } from './player-model'
import { getAvailableScores, applyElimination } from './scoring'
import { rankPlayers, simulateRound } from './monte-carlo'

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

function simulateAndRecordFirstRound(
  alive: SimPlayer[],
  round: number,
  stats: LobbyStats,
): { newAlive: SimPlayer[]; placements: Record<string, number> } {
  const ranked = rankPlayers(alive, round, stats)
  const completers = ranked.filter((r) => r.val !== -Infinity)
  const scores = getAvailableScores(completers.length)

  const placements: Record<string, number> = {}
  ranked.forEach((entry, place) => {
    placements[alive[entry.idx].uuid] = place + 1
  })

  let completerRank = 0
  const earned = new Map<number, number>()
  for (const entry of ranked) {
    earned.set(entry.idx, entry.val === -Infinity ? 0 : (scores[completerRank++] ?? 0))
  }

  const newAlive = alive.map((p, i) => ({ ...p, point: p.point + (earned.get(i) ?? 0) }))
  return { newAlive, placements }
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
            (sc) => sc.uuid === oc.uuid && sc.minPlace === oc.minPlace && sc.maxPlace === oc.maxPlace,
          ),
        ),
    )
  })

  return deduped.slice(0, maxScenarios)
}

export function runBatchSimulation(
  players: SimPlayer[],
  currentRound: number,
  cuts: EliminationCut[],
  iterations = 20000,
): SharedRecord[] {
  const nextCutEntry = cuts.find((c) => c.afterSeed >= currentRound)
  if (!nextCutEntry) return []

  const stats = calculateLobbyStats(players)
  const records: SharedRecord[] = []

  for (let i = 0; i < iterations; i++) {
    let alive = players.map((p) => ({ ...p }))
    let placements: Record<string, number> = {}

    for (let r = currentRound; r <= nextCutEntry.afterSeed; r++) {
      if (alive.length === 0) break
      if (r === currentRound) {
        const result = simulateAndRecordFirstRound(alive, r, stats)
        alive = result.newAlive
        placements = result.placements
      } else {
        alive = simulateRound(alive, r, stats)
      }
      const cut = cuts.find((c) => c.afterSeed === r)
      if (cut) alive = applyElimination(alive, cut)
    }

    const aliveSet = new Set(alive.map((p) => p.uuid))
    const survivedByUuid: Record<string, boolean> = {}
    for (const p of players) survivedByUuid[p.uuid] = aliveSet.has(p.uuid)
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

  const stats = calculateLobbyStats(players)
  const n = players.length

  type SimRecord = { placements: Record<string, number>; survived: boolean }
  const records: SimRecord[] = []

  for (let i = 0; i < iterations; i++) {
    let alive = players.map((p) => ({ ...p }))
    let placements: Record<string, number> = {}

    for (let r = currentRound; r <= nextCutEntry.afterSeed; r++) {
      if (alive.length === 0) break
      if (r === currentRound) {
        if (fixedTargetLast) {
          // Target DNFs — distribute scores to the other completers only
          const tIdx = alive.findIndex((p) => p.uuid === targetUuid)
          const others = alive.filter((_, i) => i !== tIdx)
          const otherRanked = rankPlayers(others, r, stats)
          const otherCompleters = otherRanked.filter((e) => e.val !== -Infinity)
          const otherScores = getAvailableScores(otherCompleters.length)
          placements[targetUuid] = n
          otherRanked.forEach((entry, place) => {
            placements[others[entry.idx].uuid] = place + 1
          })
          const earnedByUuid = new Map<string, number>()
          let completerRank = 0
          for (const entry of otherRanked) {
            earnedByUuid.set(
              others[entry.idx].uuid,
              entry.val === -Infinity ? 0 : (otherScores[completerRank++] ?? 0),
            )
          }
          alive = alive.map((p) => ({
            ...p,
            point: p.uuid === targetUuid ? p.point : p.point + (earnedByUuid.get(p.uuid) ?? 0),
          }))
        } else {
          const result = simulateAndRecordFirstRound(alive, r, stats)
          alive = result.newAlive
          placements = result.placements
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
  if (naturalSurvived === 0) return { scenarios: [], baseProbability: 0 }

  const baseP = naturalSurvived / iterations
  const opponents = players.filter((p) => p.uuid !== targetUuid)

  const scenarios = buildScenariosFromRecords(records, opponents, n, baseP, 5, 3, 8, threatMode)

  return { scenarios, baseProbability: baseP }
}
