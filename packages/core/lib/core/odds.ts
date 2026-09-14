/**
 * Top-level odds orchestrator. Takes an `EventContext` (the boundary object
 * built by `events/build.ts`) and produces the per-player numbers the UI shows:
 * win / survival probability (from Monte Carlo), the deterministic
 * canStillWin / isSafe / clinch flags, projected cut delta, status, and power.
 *
 * `computePlayerOdds` is the one entry point for per-player odds — real or
 * hypothetical. The scenario functions ("what needs to happen for X") are the
 * other half of the surface.
 */
import type { BracketEntry } from '../api/types'
import { EventContext } from '../context/event'
import { byUuid } from '../utils'
import { getEffectiveSchedule, getKeepCount, type EliminationCut } from './config'
import type { SimPlayer, SurvivalScenario, SharedRecord } from './simulation'
import {
  calculateLobbyStats,
  canStillWinDeterministic,
  cutThresholdPoints,
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

/** `eliminated` and `qualified` are terminal; `safe`/`danger` apply mid-event based on the next cut. */
export type PlayerStatus = 'qualified' | 'safe' | 'danger' | 'eliminated'

export interface PlayerOdds {
  uuid: string
  /** Monte Carlo probability of finishing in the qualify positions. */
  winProbability: number
  /** Monte Carlo probability of surviving the next cut. */
  survivalProbability: number
  /** Deterministic: is a top-`qualifyCount` finish still mathematically possible. */
  canStillWin: boolean
  /** Deterministic: is survival past the next cut already guaranteed. */
  isSafeAtNextCut: boolean
  /** Worst current-seed score that clinches survival, and the place it corresponds to (`null` if n/a). */
  clinchScore: number | null
  clinchPlace: number | 'DNF' | null
  /** Projected points minus the projected cutline — positive = above the line. */
  cutDelta: number
  status: PlayerStatus
  /** Pre-noise round strength from `getPlayerPower`, surfaced for display/sorting. */
  power: number
}

/** Point total of the last surviving player at `cut`, given the field already sorted by points. */
function getCutThreshold(cut: EliminationCut, sorted: SimPlayer[]): number {
  if ('rule' in cut && cut.rule === 'zero_out') return 1
  return cutThresholdPoints(sorted, getKeepCount(cut, sorted.length))
}

/** Collapses the elimination / over / safe flags into a single display status. */
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

/**
 * Odds block for a player in a live event: the deterministic flags plus the
 * player's slice of the shared `mcResults`. `isSafeAtNextCut` is only asserted
 * when this seed is actually a cutline (or a zero-out) and the player can still
 * win — otherwise "safe" isn't a meaningful claim yet.
 */
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

/** Odds block for an event that's over: probabilities collapse to 1 (qualified) or 0. */
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

/**
 * Every non-eliminated bracket as a `SimPlayer`, whether or not the event is
 * over. `computePlayerOdds` / `computeMCResults` check `isOver` themselves;
 * `buildAlivePlayers` adds that check for the scenario callers, which want
 * `null` once the event is done.
 */
function mapAlivePlayers(ctx: EventContext): SimPlayer[] {
  const playerLookup = byUuid(ctx.players)
  return ctx.brackets
    .filter((b) => !b.eliminated)
    .map((b) => toSimPlayer(playerLookup.get(b.uuid)!, b.point))
}

function buildAlivePlayers(ctx: EventContext, isOver: boolean): SimPlayer[] | null {
  return isOver ? null : mapAlivePlayers(ctx)
}

/**
 * Runs the Monte Carlo once for the whole field and returns the raw
 * uuid → `MCResult` map. Returns `{}` for events that are over, empty, or not
 * yet started. Callers that also need the deterministic flags should use
 * `computePlayerOdds` and pass this in as `externalMCResults` to avoid
 * simulating twice.
 */
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

/**
 * Computes `PlayerOdds` for every bracket in the event — the one entry point
 * for per-player odds, real or hypothetical.
 *
 * Modes:
 * - default: run the Monte Carlo (or reuse `opts.externalMCResults`).
 * - `opts.fixed` (uuid → 1-based place): pin those players in `ctx.currentRound`
 *   and recompute. The same pins flow into both the Monte Carlo and the
 *   deterministic flags and the projected-points math, so every field agrees.
 *
 * `opts.fixed` is cleaned first: each entry must name a live player and a place
 * within the field, and no two players may claim the same place (later
 * duplicates are dropped) — otherwise the MC path and the points path could
 * resolve a collision differently.
 */
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
  const playerLookup = byUuid(players)
  const alivePlayers = mapAlivePlayers(ctx)

  // Clean + dedupe the pinned placements (see the doc comment above).
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

/**
 * Handle for one shared batch simulation. Produced by `buildScenarioRecords`
 * and queried by `deriveScenariosFromRecords`, so the expensive batch runs once
 * per seed and every player's scenarios are mined from the same records. Not
 * constructed directly.
 */
export interface ScenarioRecords {
  records: SharedRecord[]
  players: SimPlayer[]
}

/** Runs the batch simulation for the current seed. `null` if the event is over or empty. */
export function buildScenarioRecords(ctx: EventContext): ScenarioRecords | null {
  const { effectiveSchedule, isOver } = getEffectiveSchedule(ctx)
  const alivePlayers = buildAlivePlayers(ctx, isOver)
  if (!alivePlayers || alivePlayers.length === 0) return null
  const records = runBatchSimulation(alivePlayers, ctx.currentRound, effectiveSchedule)
  return { records, players: alivePlayers }
}

/**
 * Mines one player's scenarios from a prepared batch: "finishing X or better
 * (or, in `threatMode`, X or worse) leaves you surviving with probability p."
 * @param options.threatMode look at the outcomes where the target is knocked
 *   out instead of the ones where they survive.
 */
export function deriveScenariosFromRecords(
  targetUuid: string,
  prepared: ScenarioRecords,
  options?: { threatMode?: boolean },
): { scenarios: SurvivalScenario[]; baseProbability: number } {
  return derivePlayerScenarios(targetUuid, prepared.records, prepared.players, options)
}

/**
 * Scenarios conditioned on the target DNFing the current round: how the rest of
 * the field would have to fall for them to survive anyway. One-shot — forcing a
 * DNF changes the simulation itself, so unlike `buildScenarioRecords` this
 * can't share a batch across players.
 */
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
