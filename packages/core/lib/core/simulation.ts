/**
 * Grouping barrel for the simulation engine — player model, scoring,
 * deterministic math, Monte Carlo, and scenario mining under one import.
 *
 * `core/context.ts`, `core/odds.ts`, and `events/build.ts` import engine names
 * from here rather than reaching into individual modules. The package's public
 * `lib/index.ts` re-exports a curated subset of this.
 */
export type { SimPlayer, LobbyStats } from './player-model'
export {
  toSimPlayer,
  EMPTY_PLAYER,
  DEFAULT_LOBBY_STATS,
  calculateLobbyStats,
  getDNFProbability,
  getPlayerPower,
  getPlayerVariance,
  randomGaussian,
  createSimPool,
} from './player-model'
export { getAvailableScores, applyElimination, cutThresholdPoints, mssPhasePoints } from './scoring'
export {
  canStillWinDeterministic,
  isSafeAtNextCutDeterministic,
  getClinchScore,
} from './deterministic'
export type { MCResult } from './monte-carlo'
export { simulateRound, runMonteCarlo, runFullHeatmapSimulation } from './monte-carlo'
export type { PlacementConstraint, SurvivalScenario, SharedRecord } from './scenarios'
export { runBatchSimulation, derivePlayerScenarios } from './scenarios'
