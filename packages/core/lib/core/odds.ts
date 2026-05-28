import type { BracketEntry } from '../api/types'
import { EventContext } from '../context/event'
import { ELIMINATION_SCHEDULE, EliminationCut, QUALIFY_COUNT } from './config'
import type { SimPlayer } from './simulation'
import {
  calculateLobbyStats,
  canStillWinDeterministic,
  derivePlayerScenarios,
  getClinchScore,
  getPlayerPower,
  isSafeAtNextCutDeterministic,
  runBatchSimulation,
  runMonteCarlo,
  runScenarioAnalysis,
  toSimPlayer,
} from './simulation'
import type { MCResult } from './monte-carlo'
export type { PlacementConstraint, SurvivalScenario } from './simulation'

export type PlayerStatus = 'qualified' | 'safe' | 'danger' | 'eliminated'

export interface PlayerOdds {
  uuid: string
  winProbability: number
  survivalProbability: number
  canStillWin: boolean
  isSafeAtNextCut: boolean
  clinchScore: number | null
  clinchPlace: number | 'DNF' | null
  cutDelta: number
  status: PlayerStatus
  power: number
}

function getCutThreshold(cut: EliminationCut, sorted: SimPlayer[]): number {
  if ('rule' in cut)
    return cut.rule === 'zero_out'
      ? 1
      : (sorted[Math.min(Math.ceil(sorted.length / 2) - 1, sorted.length - 1)]?.point ?? 0)
  return sorted[Math.min(cut.keepTop - 1, sorted.length - 1)]?.point ?? 0
}

function deriveStatus(
  bracket: BracketEntry,
  isSafe: boolean,
  isOver: boolean,
  isQualified = false,
): PlayerStatus {
  if (bracket.eliminated) return 'eliminated'
  if (isOver) return isQualified ? 'qualified' : 'eliminated'
  if (isSafe) return 'safe'
  return 'danger'
}

function computeActiveOdds(
  uuid: string,
  alivePlayers: SimPlayer[],
  currentRound: number,
  mcResults: Record<string, { winProbability: number; survivalProbability: number }>,
  qualifyCount: number,
  cuts: EliminationCut[],
): Pick<
  PlayerOdds,
  | 'canStillWin'
  | 'isSafeAtNextCut'
  | 'clinchScore'
  | 'clinchPlace'
  | 'winProbability'
  | 'survivalProbability'
> {
  const canStillWin = canStillWinDeterministic(uuid, alivePlayers, currentRound, cuts, qualifyCount)
  const nextCut = cuts.find((c) => c.afterSeed >= currentRound)
  const atCutlineSeed = nextCut?.afterSeed === currentRound
  const isZeroOutCut = nextCut !== undefined && 'rule' in nextCut && nextCut.rule === 'zero_out'
  const isSafeAtNextCut =
    (atCutlineSeed || isZeroOutCut) &&
    canStillWin &&
    isSafeAtNextCutDeterministic(uuid, alivePlayers, currentRound, cuts)
  const clinch = getClinchScore(uuid, alivePlayers, currentRound, cuts)
  const mc = mcResults[uuid]
  return {
    canStillWin,
    isSafeAtNextCut,
    clinchScore: clinch?.score ?? null,
    clinchPlace: clinch?.place ?? null,
    winProbability: mc?.winProbability ?? 0,
    survivalProbability: mc?.survivalProbability ?? 0,
  }
}

function computeFinishedOdds(
  bracket: BracketEntry,
): Pick<
  PlayerOdds,
  | 'canStillWin'
  | 'isSafeAtNextCut'
  | 'clinchScore'
  | 'clinchPlace'
  | 'winProbability'
  | 'survivalProbability'
> {
  const qualified = !bracket.eliminated
  return {
    canStillWin: true,
    isSafeAtNextCut: true,
    clinchScore: null,
    clinchPlace: null,
    winProbability: qualified ? 1 : 0,
    survivalProbability: qualified ? 1 : 0,
  }
}

export function computeMCResults(
  ctx: EventContext,
  iterations = 20000,
): Record<string, MCResult> {
  const { currentRound, brackets, players } = ctx
  const qualifyCount = ctx.qualifyCount ?? QUALIFY_COUNT
  const baseLast = ELIMINATION_SCHEDULE[ELIMINATION_SCHEDULE.length - 1]
  const effectiveSchedule = ELIMINATION_SCHEDULE.map((cut) =>
    cut === baseLast && 'keepTop' in cut ? { ...cut, keepTop: qualifyCount } : cut,
  )
  const lastSeed = Math.max(...effectiveSchedule.map((c) => c.afterSeed))
  const isOver = currentRound > lastSeed
  const playerLookup = new Map(players.map((p) => [p.uuid, p]))
  const alivePlayers = brackets
    .filter((b) => !b.eliminated)
    .map((b) => toSimPlayer(playerLookup.get(b.uuid)!, b.point))
  if (isOver || currentRound < 1 || alivePlayers.length === 0) return {}
  return runMonteCarlo(alivePlayers, currentRound, effectiveSchedule, qualifyCount, iterations)
}

export function computePlayerOdds(
  ctx: EventContext,
  externalMCResults?: Record<string, MCResult>,
): Record<string, PlayerOdds> {
  const { currentRound, brackets, players } = ctx
  const qualifyCount = ctx.qualifyCount ?? QUALIFY_COUNT
  const baseLast = ELIMINATION_SCHEDULE[ELIMINATION_SCHEDULE.length - 1]
  const effectiveSchedule = ELIMINATION_SCHEDULE.map((cut) =>
    cut === baseLast && 'keepTop' in cut ? { ...cut, keepTop: qualifyCount } : cut,
  )
  const lastSeed = Math.max(...effectiveSchedule.map((c) => c.afterSeed))
  const isOver = currentRound > lastSeed

  const playerLookup = new Map(players.map((p) => [p.uuid, p]))
  const alivePlayers = brackets
    .filter((b) => !b.eliminated)
    .map((b) => toSimPlayer(playerLookup.get(b.uuid)!, b.point))

  const sortedAlive = [...alivePlayers].sort((a, b) => b.point - a.point)
  const nextCut = effectiveSchedule.find((c) => c.afterSeed >= currentRound)
  const cutThresholdPoint =
    nextCut && alivePlayers.length > 0 ? getCutThreshold(nextCut, sortedAlive) : 0

  const mcResults =
    externalMCResults !== undefined
      ? externalMCResults
      : !isOver && currentRound >= 1 && alivePlayers.length > 0
        ? runMonteCarlo(alivePlayers, currentRound, effectiveSchedule, qualifyCount)
        : {}

  const qualifiedUuids = isOver
    ? new Set(
        [...alivePlayers]
          .sort((a, b) => b.point - a.point)
          .slice(0, qualifyCount)
          .map((p) => p.uuid),
      )
    : null

  const lobbyStats = calculateLobbyStats(alivePlayers)

  return Object.fromEntries(
    brackets.map((bracket) => {
      const simPlayer = toSimPlayer(playerLookup.get(bracket.uuid)!, bracket.point)
      const power = getPlayerPower(simPlayer, currentRound, lobbyStats)

      const computed = bracket.eliminated
        ? {
            canStillWin: false,
            isSafeAtNextCut: false,
            clinchScore: null,
            clinchPlace: null,
            winProbability: 0,
            survivalProbability: 0,
          }
        : isOver
          ? computeFinishedOdds(bracket)
          : computeActiveOdds(
              bracket.uuid,
              alivePlayers,
              currentRound,
              mcResults,
              qualifyCount,
              effectiveSchedule,
            )

      return [
        bracket.uuid,
        {
          uuid: bracket.uuid,
          cutDelta: bracket.point - cutThresholdPoint,
          status: deriveStatus(
            bracket,
            computed.isSafeAtNextCut,
            isOver,
            qualifiedUuids?.has(bracket.uuid),
          ),
          power,
          ...computed,
        },
      ]
    }),
  )
}

function buildAlivePlayers(ctx: EventContext, effectiveSchedule: EliminationCut[]) {
  const { currentRound, brackets, players } = ctx
  const lastSeed = Math.max(...effectiveSchedule.map((c) => c.afterSeed))
  if (currentRound > lastSeed) return null
  const playerLookup = new Map(players.map((p) => [p.uuid, p]))
  return brackets
    .filter((b) => !b.eliminated)
    .map((b) => toSimPlayer(playerLookup.get(b.uuid)!, b.point))
}

export function computeSurvivalScenarios(
  ctx: EventContext,
  targetUuid: string,
): import('./simulation').SurvivalScenario[] {
  const qualifyCount = ctx.qualifyCount ?? QUALIFY_COUNT
  const baseLast = ELIMINATION_SCHEDULE[ELIMINATION_SCHEDULE.length - 1]
  const effectiveSchedule = ELIMINATION_SCHEDULE.map((cut) =>
    cut === baseLast && 'keepTop' in cut ? { ...cut, keepTop: qualifyCount } : cut,
  )
  const alivePlayers = buildAlivePlayers(ctx, effectiveSchedule)
  if (!alivePlayers?.find((p) => p.uuid === targetUuid)) return []
  return runScenarioAnalysis(
    targetUuid,
    alivePlayers,
    ctx.currentRound,
    effectiveSchedule,
  ).scenarios
}

// Opaque handle — do not construct directly; use buildScenarioRecords / deriveScenariosFromRecords
export interface ScenarioRecords {
  _records: import('./simulation').SharedRecord[]
  _players: SimPlayer[]
}

export function buildScenarioRecords(ctx: EventContext): ScenarioRecords | null {
  const qualifyCount = ctx.qualifyCount ?? QUALIFY_COUNT
  const baseLast = ELIMINATION_SCHEDULE[ELIMINATION_SCHEDULE.length - 1]
  const effectiveSchedule = ELIMINATION_SCHEDULE.map((cut) =>
    cut === baseLast && 'keepTop' in cut ? { ...cut, keepTop: qualifyCount } : cut,
  )
  const alivePlayers = buildAlivePlayers(ctx, effectiveSchedule)
  if (!alivePlayers || alivePlayers.length === 0) return null
  const records = runBatchSimulation(alivePlayers, ctx.currentRound, effectiveSchedule)
  return { _records: records, _players: alivePlayers }
}

export function deriveScenariosFromRecords(
  targetUuid: string,
  prepared: ScenarioRecords,
  options?: { threatMode?: boolean },
): { scenarios: import('./simulation').SurvivalScenario[]; baseProbability: number } {
  return derivePlayerScenarios(targetUuid, prepared._records, prepared._players, options)
}

export function computeFailureScenarios(
  ctx: EventContext,
  targetUuid: string,
  threatMode = false,
): { scenarios: import('./simulation').SurvivalScenario[]; dnfSurvivalProbability: number } {
  const qualifyCount = ctx.qualifyCount ?? QUALIFY_COUNT
  const baseLast = ELIMINATION_SCHEDULE[ELIMINATION_SCHEDULE.length - 1]
  const effectiveSchedule = ELIMINATION_SCHEDULE.map((cut) =>
    cut === baseLast && 'keepTop' in cut ? { ...cut, keepTop: qualifyCount } : cut,
  )
  const alivePlayers = buildAlivePlayers(ctx, effectiveSchedule)
  if (!alivePlayers?.find((p) => p.uuid === targetUuid))
    return { scenarios: [], dnfSurvivalProbability: 0 }
  const { scenarios, baseProbability } = runScenarioAnalysis(
    targetUuid,
    alivePlayers,
    ctx.currentRound,
    effectiveSchedule,
    20000,
    true,
    threatMode,
  )
  return { scenarios, dnfSurvivalProbability: baseProbability }
}
