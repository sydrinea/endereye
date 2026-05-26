import {
  buildPlayerViews,
  buildScenarioRecords,
  computeFailureScenarios,
  computeHistoricalData,
  computePlayerOdds,
} from '@endereye/core'
import type { EventContext, PlayerView, ScenarioRecords, SurvivalScenario } from '@endereye/core'

export type StandingsRequest =
  | { type: 'standings'; eventData: EventContext; seed: number }
  | { type: 'failure'; eventData: EventContext; seed: number; uuid: string; threatMode: boolean }

export type StandingsResponse =
  | { type: 'standings'; seed: number; views: PlayerView[]; scenarioRecords: ScenarioRecords | null }
  | {
      type: 'failure'
      uuid: string
      failureScenarios: SurvivalScenario[]
      dnfSurvivalProbability: number
    }

self.onmessage = (e: MessageEvent<StandingsRequest>) => {
  const msg = e.data
  if (msg.type === 'standings') {
    const ctx = computeHistoricalData(msg.eventData, msg.seed)
    const odds = computePlayerOdds(ctx)
    const views = buildPlayerViews(ctx, odds)
    const scenarioRecords = buildScenarioRecords(ctx)
    self.postMessage({
      type: 'standings',
      seed: msg.seed,
      views,
      scenarioRecords,
    } satisfies StandingsResponse)
  } else {
    const ctx = computeHistoricalData(msg.eventData, msg.seed)
    const { scenarios: failureScenarios, dnfSurvivalProbability } = computeFailureScenarios(
      ctx,
      msg.uuid,
      msg.threatMode,
    )
    self.postMessage({
      type: 'failure',
      uuid: msg.uuid,
      failureScenarios,
      dnfSurvivalProbability,
    } satisfies StandingsResponse)
  }
}
