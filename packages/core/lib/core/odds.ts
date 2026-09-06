import type { BracketEntry } from '../api/types'
import { EventContext } from '../context/event'
import { getEffectiveSchedule, getKeepCount, type EliminationCut } from './config'
import type { SimPlayer, SurvivalScenario, SharedRecord } from './simulation'
import {
  calculateLobbyStats,
  canStillWinDeterministic,
  derivePlayerScenarios,
  getAvailableScores,
  getClinchScore,
  getPlayerPower,
  isSafeAtNextCutDeterministic,
  runBatchSimulation,
  runMonteCarlo,
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
  if ('rule' in cut && cut.rule === 'zero_out') return 1
  const keepCount = getKeepCount(cut, sorted.length)
  return sorted[Math.min(keepCount - 1, sorted.length - 1)]?.point ?? 0
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
  fixed: Record<string, number>,
): Pick<
  PlayerOdds,
  | 'canStillWin'
  | 'isSafeAtNextCut'
  | 'clinchScore'
  | 'clinchPlace'
  | 'winProbability'
  | 'survivalProbability'
> {
  const canStillWin = canStillWinDeterministic(
    uuid,
    alivePlayers,
    currentRound,
    cuts,
    qualifyCount,
    fixed,
  )
  const nextCut = cuts.find((c) => c.afterSeed >= currentRound)
  const atCutlineSeed = nextCut?.afterSeed === currentRound
  const isZeroOutCut = nextCut !== undefined && 'rule' in nextCut && nextCut.rule === 'zero_out'
  const isSafeAtNextCut =
    (atCutlineSeed || isZeroOutCut) &&
    canStillWin &&
    isSafeAtNextCutDeterministic(uuid, alivePlayers, currentRound, cuts, null, fixed)
  const clinch = getClinchScore(uuid, alivePlayers, currentRound, cuts, fixed)
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

// Maps every non-eliminated bracket to a SimPlayer, regardless of whether the
// event is over — callers that care (computePlayerOdds, computeMCResults)
// check `isOver` themselves; `buildAlivePlayers` below layers that check on
// top for callers (the scenario functions) that want `null` once it's over.
function mapAlivePlayers(ctx: EventContext): SimPlayer[] {
  const playerLookup = new Map(ctx.players.map((p) => [p.uuid, p]))
  return ctx.brackets
    .filter((b) => !b.eliminated)
    .map((b) => toSimPlayer(playerLookup.get(b.uuid)!, b.point))
}

function buildAlivePlayers(ctx: EventContext, isOver: boolean): SimPlayer[] | null {
  return isOver ? null : mapAlivePlayers(ctx)
}

export function computeMCResults(
  ctx: EventContext,
  iterations = 20000,
): Record<string, MCResult> {
  const { currentRound } = ctx
  const { qualifyCount, effectiveSchedule, isOver } = getEffectiveSchedule(ctx)
  const alivePlayers = mapAlivePlayers(ctx)
  if (isOver || currentRound < 1 || alivePlayers.length === 0) return {}
  return runMonteCarlo(alivePlayers, currentRound, effectiveSchedule, qualifyCount, { iterations })
}

// The single entry point for computing every player's odds. `opts.fixed`
// pins some players to a known finishing place in `ctx.currentRound` (a
// client-side "what-if the seed finished like this" recompute) — this used
// to be a separate top-level function (computeHypotheticalOdds) that
// re-derived most of this same logic by hand and drifted from it: it never
// passed the pinned placements into canStillWinDeterministic, so a player
// mathematically eliminated by their own pinned placement could still show
// `canStillWin: true`. Folding it in here means both paths share one
// implementation.
export function computePlayerOdds(
  ctx: EventContext,
  opts?: {
    fixed?: Record<string, number>
    externalMCResults?: Record<string, MCResult>
    iterations?: number
  },
): Record<string, PlayerOdds> {
  const { currentRound, brackets, players } = ctx
  const { qualifyCount, effectiveSchedule, isOver } = getEffectiveSchedule(ctx)
  const playerLookup = new Map(players.map((p) => [p.uuid, p]))
  const alivePlayers = mapAlivePlayers(ctx)

  // Clean + dedupe the pinned placements: each must reference a live player
  // and a place within the field, and no two players may claim the same
  // place (previously unvalidated — the MC path and the projected-points
  // path resolved a collision differently, so cutDelta/status could disagree
  // with winProbability for the same hypothetical).
  const cleanFixed: Record<string, number> = {}
  if (opts?.fixed && !isOver && currentRound >= 1 && alivePlayers.length > 0) {
    const aliveUuids = new Set(alivePlayers.map((p) => p.uuid))
    const takenPlaces = new Set<number>()
    for (const [uuid, place] of Object.entries(opts.fixed)) {
      if (
        aliveUuids.has(uuid) &&
        place >= 1 &&
        place <= alivePlayers.length &&
        !takenPlaces.has(place)
      ) {
        cleanFixed[uuid] = place
        takenPlaces.add(place)
      }
    }
  }
  const hasFixed = Object.keys(cleanFixed).length > 0

  const seedScores = hasFixed ? getAvailableScores(alivePlayers.length) : null
  const projectedPoint = (uuid: string, basePoint: number) =>
    hasFixed && cleanFixed[uuid] !== undefined ? basePoint + seedScores![cleanFixed[uuid] - 1] : basePoint

  const sortedAlive = [...alivePlayers]
    .map((p) => (hasFixed ? { ...p, point: projectedPoint(p.uuid, p.point) } : p))
    .sort((a, b) => b.point - a.point)
  const nextCut = effectiveSchedule.find((c) => c.afterSeed >= currentRound)
  const cutThresholdPoint =
    nextCut && alivePlayers.length > 0 ? getCutThreshold(nextCut, sortedAlive) : 0

  const mcResults = hasFixed
    ? runMonteCarlo(alivePlayers, currentRound, effectiveSchedule, qualifyCount, {
        fixed: cleanFixed,
        iterations: opts?.iterations,
      })
    : opts?.externalMCResults !== undefined
      ? opts.externalMCResults
      : !isOver && currentRound >= 1 && alivePlayers.length > 0
        ? runMonteCarlo(alivePlayers, currentRound, effectiveSchedule, qualifyCount, {
            iterations: opts?.iterations,
          })
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
      const projPoint = projectedPoint(bracket.uuid, bracket.point)

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
              cleanFixed,
            )

      return [
        bracket.uuid,
        {
          uuid: bracket.uuid,
          cutDelta: projPoint - cutThresholdPoint,
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

// Handle for a shared simulation batch — do not construct directly; produced
// by buildScenarioRecords and consumed by deriveScenariosFromRecords, so a
// caller can run the (expensive) batch simulation once per seed and then
// query it once per player without re-simulating.
export interface ScenarioRecords {
  records: SharedRecord[]
  players: SimPlayer[]
}

export function buildScenarioRecords(ctx: EventContext): ScenarioRecords | null {
  const { effectiveSchedule, isOver } = getEffectiveSchedule(ctx)
  const alivePlayers = buildAlivePlayers(ctx, isOver)
  if (!alivePlayers || alivePlayers.length === 0) return null
  const records = runBatchSimulation(alivePlayers, ctx.currentRound, effectiveSchedule)
  return { records, players: alivePlayers }
}

export function deriveScenariosFromRecords(
  targetUuid: string,
  prepared: ScenarioRecords,
  options?: { threatMode?: boolean },
): { scenarios: SurvivalScenario[]; baseProbability: number } {
  return derivePlayerScenarios(targetUuid, prepared.records, prepared.players, options)
}

// Unlike buildScenarioRecords/deriveScenariosFromRecords, this can't share a
// batch across players: forcing `targetUuid` to DNF the round means the
// simulation itself is different per target, so there's nothing to build
// once and reuse. This one-shot form is the appropriate shape for that.
export function computeFailureScenarios(
  ctx: EventContext,
  targetUuid: string,
  threatMode = false,
): { scenarios: SurvivalScenario[]; dnfSurvivalProbability: number } {
  const { effectiveSchedule, isOver } = getEffectiveSchedule(ctx)
  const alivePlayers = buildAlivePlayers(ctx, isOver)
  if (!alivePlayers?.find((p) => p.uuid === targetUuid))
    return { scenarios: [], dnfSurvivalProbability: 0 }
  const records = runBatchSimulation(alivePlayers, ctx.currentRound, effectiveSchedule, 20000, targetUuid)
  const { scenarios, baseProbability } = derivePlayerScenarios(targetUuid, records, alivePlayers, {
    threatMode,
  })
  return { scenarios, dnfSurvivalProbability: baseProbability }
}
