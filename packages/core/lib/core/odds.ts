import type { BracketEntry } from '../api/types'
import { EventContext } from '../context/event'
import { ELIMINATION_SCHEDULE, EliminationCut, QUALIFY_COUNT } from './config'
import type { SimPlayer } from './simulation'
import {
  calculateLobbyStats,
  canStillWinDeterministic,
  getClinchScore,
  getPlayerPower,
  isSafeAtNextCutDeterministic,
  runMonteCarlo,
  runScenarioAnalysis,
  toSimPlayer,
} from './simulation'
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
  const isSafeAtNextCut =
    canStillWin && isSafeAtNextCutDeterministic(uuid, alivePlayers, currentRound, cuts)
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

export function computePlayerOdds(ctx: EventContext): Record<string, PlayerOdds> {
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
    !isOver && currentRound >= 1 && alivePlayers.length > 0
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

export function computeSurvivalScenarios(
  ctx: EventContext,
  targetUuid: string,
): import('./simulation').SurvivalScenario[] {
  const qualifyCount = ctx.qualifyCount ?? QUALIFY_COUNT
  const baseLast = ELIMINATION_SCHEDULE[ELIMINATION_SCHEDULE.length - 1]
  const effectiveSchedule = ELIMINATION_SCHEDULE.map((cut) =>
    cut === baseLast && 'keepTop' in cut ? { ...cut, keepTop: qualifyCount } : cut,
  )

  const { currentRound, brackets, players } = ctx
  const lastSeed = Math.max(...effectiveSchedule.map((c) => c.afterSeed))
  if (currentRound > lastSeed) return []

  const playerLookup = new Map(players.map((p) => [p.uuid, p]))
  const alivePlayers = brackets
    .filter((b) => !b.eliminated)
    .map((b) => toSimPlayer(playerLookup.get(b.uuid)!, b.point))

  const target = alivePlayers.find((p) => p.uuid === targetUuid)
  if (!target) return []

  return runScenarioAnalysis(
    targetUuid,
    alivePlayers,
    currentRound,
    effectiveSchedule,
    qualifyCount,
  )
}

export function computeFailureScenarios(
  ctx: EventContext,
  targetUuid: string,
): import('./simulation').SurvivalScenario[] {
  const qualifyCount = ctx.qualifyCount ?? QUALIFY_COUNT
  const baseLast = ELIMINATION_SCHEDULE[ELIMINATION_SCHEDULE.length - 1]
  const effectiveSchedule = ELIMINATION_SCHEDULE.map((cut) =>
    cut === baseLast && 'keepTop' in cut ? { ...cut, keepTop: qualifyCount } : cut,
  )

  const { currentRound, brackets, players } = ctx
  const lastSeed = Math.max(...effectiveSchedule.map((c) => c.afterSeed))
  if (currentRound > lastSeed) return []

  const playerLookup = new Map(players.map((p) => [p.uuid, p]))
  const alivePlayers = brackets
    .filter((b) => !b.eliminated)
    .map((b) => toSimPlayer(playerLookup.get(b.uuid)!, b.point))

  const target = alivePlayers.find((p) => p.uuid === targetUuid)
  if (!target) return []

  return runScenarioAnalysis(
    targetUuid,
    alivePlayers,
    currentRound,
    effectiveSchedule,
    qualifyCount,
    20000,
    true,
  )
}
