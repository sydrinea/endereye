/**
 * Public surface of @endereye/core. Consumers (the web app, scripts) import
 * from here; the internal module layout behind it is:
 *
 *   api/*  →  events/build + players  →  context/event (EventContext)
 *          →  core/odds + core/context  →  UI-facing results
 *
 * `core/*` depends only on `api/types`, never on `api/fetch`.
 */
export { mean } from './utils'

export type { Match, BracketEntry, EventKind, User } from './api/types'
export { fetchCurrentSeason, fetchUser, fetchMatch, fetchPhaseLeaderboard } from './api/fetch'

export { MAX_SCORE_PER_SEED, QUALIFY_COUNT, ELIMINATION_SCHEDULE } from './core/config'
export { getAvailableScores, mssPhasePoints } from './core/simulation'
export type { MCResult, SurvivalScenario } from './core/simulation'

export type { PlayerOdds, ScenarioRecords } from './core/odds'
export {
  computeMCResults,
  computePlayerOdds,
  buildScenarioRecords,
  deriveScenariosFromRecords,
  computeFailureScenarios,
} from './core/odds'

export type { PlayerView } from './core/context'
export { computeHistoricalData, buildPlayerViews, runHeatmapSimulation } from './core/context'

export type { EventPlayer, OverrideMap, RawOverrides, EventContext } from './context/event'

export { enrichEventPlayers } from './players'
export { FetchError, AppError } from './errors'

export type { ApiEventData } from './events/build'
export { buildEvent, buildEventFromApiResponse, computeBonusMap } from './events/build'
