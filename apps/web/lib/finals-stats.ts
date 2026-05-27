import {
  computeHistoricalData,
  computePlayerOdds,
  ELIMINATION_SCHEDULE,
  QUALIFY_COUNT,
  MAX_SCORE_PER_SEED,
  mean,
} from '@endereye/core'
import type { EventContext } from '@endereye/core'
import type { EventConfig } from './events-config'
import { PLAYER_COLORS, CLINCH_CUT_SEEDS } from './analytics-stats'

export interface FinalistEntry {
  key: string // "{uuid}_{eventSlug}"
  seriesLabel: string // "{nickname} (LCQ S10)" — used as chart data key
  uuid: string
  nickname: string
  eventSlug: string
  eventLabel: string
  color: string
}

export interface FinalistsChartData {
  finalists: FinalistEntry[]
  survivalData: Array<Record<string, number>>
  slackData: Array<Record<string, number | string>>
  cutSeeds: number[]
  events: Array<{ slug: string; label: string; color: string }>
}

export const DEEP_RUNS_KEY = 'Deep Runs Avg'
const DEEP_RUN_THRESHOLD_SEED = 5

export function computeFinalistsData(
  loadedEvents: Array<{ config: EventConfig; context: EventContext }>,
): FinalistsChartData {
  const allFinalists: FinalistEntry[] = []
  const allEvents: Array<{ slug: string; label: string; color: string }> = []
  const survivalBySeries = new Map<string, Record<number, number>>()
  const slackBySeries = new Map<string, Record<number, number>>()

  // Cross-event accumulators for deep runners (survived seed 7, didn't qualify)
  const deepRunSurvivalBySeed = new Map<number, number[]>()
  const deepRunSlackBySeed = new Map<number, number[]>()

  for (let ei = 0; ei < loadedEvents.length; ei++) {
    const { config, context } = loadedEvents[ei]
    const color = PLAYER_COLORS[ei % PLAYER_COLORS.length]

    const qualifyCount = context.qualifyCount ?? QUALIFY_COUNT
    const baseLast = ELIMINATION_SCHEDULE[ELIMINATION_SCHEDULE.length - 1]
    const effectiveSchedule = ELIMINATION_SCHEDULE.map((cut) =>
      cut === baseLast && 'keepTop' in cut ? { ...cut, keepTop: qualifyCount } : cut,
    )
    const lastSeed = Math.max(...effectiveSchedule.map((c) => c.afterSeed))

    const finalState = computeHistoricalData(context, lastSeed)
    const finalistUuids = new Set(
      finalState.brackets.filter((b) => !b.eliminated).map((b) => b.uuid),
    )
    if (finalistUuids.size === 0) continue

    // Players alive after seed 7 who didn't qualify
    const deepRunState = computeHistoricalData(context, DEEP_RUN_THRESHOLD_SEED)
    const deepRunnerUuids = new Set(
      deepRunState.brackets
        .filter((b) => !b.eliminated && !finalistUuids.has(b.uuid))
        .map((b) => b.uuid),
    )

    const nicknameMap = new Map(context.players.map((p) => [p.uuid, p.nickname]))
    allEvents.push({ slug: config.slug, label: config.label, color })

    for (const uuid of finalistUuids) {
      const nickname = nicknameMap.get(uuid) ?? uuid
      const key = `${uuid}_${config.slug}`
      allFinalists.push({
        key,
        seriesLabel: `${nickname} (${config.label})`,
        uuid,
        nickname,
        eventSlug: config.slug,
        eventLabel: config.label,
        color,
      })
      survivalBySeries.set(key, {})
      slackBySeries.set(key, {})
    }

    const totalSeeds = context.currentRound - 1
    let prevOdds: ReturnType<typeof computePlayerOdds> | null = null

    for (let seed = 1; seed <= totalSeeds; seed++) {
      const state = computeHistoricalData(context, seed)
      const playerOdds = computePlayerOdds(state)

      for (const uuid of finalistUuids) {
        const key = `${uuid}_${config.slug}`
        const odds = playerOdds[uuid]
        if (!odds) continue
        survivalBySeries.get(key)![seed] = Math.round(odds.survivalProbability * 100)
      }

      for (const uuid of deepRunnerUuids) {
        const odds = playerOdds[uuid]
        if (!odds) continue
        const arr = deepRunSurvivalBySeed.get(seed) ?? []
        arr.push(odds.survivalProbability * 100)
        deepRunSurvivalBySeed.set(seed, arr)
      }

      // Clinch slack at cut seeds: compare actual score earned this seed against
      // the clinch score the model required *before* this seed
      if (CLINCH_CUT_SEEDS.includes(seed) && prevOdds) {
        for (const uuid of finalistUuids) {
          const key = `${uuid}_${config.slug}`
          const clinch = prevOdds[uuid]?.clinchScore ?? MAX_SCORE_PER_SEED
          const bracket = state.brackets.find((b) => b.uuid === uuid)
          const actual = bracket?.completions[seed - 1]?.score ?? 0
          slackBySeries.get(key)![seed] = actual - clinch
        }

        for (const uuid of deepRunnerUuids) {
          const clinch = prevOdds[uuid]?.clinchScore ?? MAX_SCORE_PER_SEED
          const bracket = state.brackets.find((b) => b.uuid === uuid)
          const actual = bracket?.completions[seed - 1]?.score ?? 0
          const arr = deepRunSlackBySeed.get(seed) ?? []
          arr.push(actual - clinch)
          deepRunSlackBySeed.set(seed, arr)
        }
      }

      prevOdds = playerOdds
    }
  }

  // Build unified survivalData: one row per seed, columns keyed by seriesLabel
  const allSeeds = [
    ...new Set(Array.from(survivalBySeries.values()).flatMap((m) => Object.keys(m).map(Number))),
  ].sort((a, b) => a - b)

  const survivalData = allSeeds.map((seed) => {
    const row: Record<string, number> = { seed }
    for (const f of allFinalists) {
      const val = survivalBySeries.get(f.key)?.[seed]
      if (val !== undefined) row[f.seriesLabel] = val
    }
    const deepVals = deepRunSurvivalBySeed.get(seed)
    if (deepVals?.length) {
      row[DEEP_RUNS_KEY] = Math.round(mean(deepVals))
    }
    return row
  })

  // Build unified slackData: one row per cut seed
  const cutSeeds = CLINCH_CUT_SEEDS.filter((s) => allSeeds.includes(s))
  const slackData = cutSeeds.map((seed) => {
    const row: Record<string, number | string> = { seed }
    for (const f of allFinalists) {
      const val = slackBySeries.get(f.key)?.[seed]
      if (val !== undefined) row[f.seriesLabel] = val
    }
    const deepVals = deepRunSlackBySeed.get(seed)
    if (deepVals?.length) {
      row[DEEP_RUNS_KEY] = Math.round(mean(deepVals))
    }
    return row
  })

  return { finalists: allFinalists, survivalData, slackData, cutSeeds, events: allEvents }
}

export function getDominantFinalists(
  finalists: FinalistEntry[],
  survivalData: Array<Record<string, number>>,
): Set<string> {
  const seed5Row = survivalData.find((r) => r.seed === 5)
  if (!seed5Row) return new Set()
  return new Set(finalists.filter((f) => (seed5Row[f.seriesLabel] ?? 0) >= 85).map((f) => f.key))
}

export function getClutchFinalists(
  finalists: FinalistEntry[],
  survivalData: Array<Record<string, number>>,
): Set<string> {
  const lateRows = survivalData.filter((r) => r.seed >= 5)
  return new Set(
    finalists
      .filter((f) => lateRows.some((row) => (row[f.seriesLabel] ?? 100) < 60))
      .map((f) => f.key),
  )
}
