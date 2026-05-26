'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { use, useEffect, useState } from 'react'
import {
  buildPlayerViews,
  buildScenarioRecords,
  computeHistoricalData,
  computePlayerOdds,
  deriveScenariosFromRecords,
  computeFailureScenarios,
} from '@endereye/core'
import type { PlayerView, EventContext, SurvivalScenario, ScenarioRecords } from '@endereye/core'
import { DashboardHeader, Banner, Surface } from '@/components/layout'
import { Table, PlayerFilter, Tabs } from '@/components/ui'
import { StandingsRow } from './StandingsRow'
import { EliminatedSection } from './EliminatedSection'
import { SurvivalScenariosModal } from './SurvivalScenariosModal'
import { AnalyticsPanel } from './AnalyticsPanel'
import { PlayersPanel } from './PlayersPanel'
import { mssPhasePoints, computeCutKeep, toRowData } from '@/lib/dashboard-utils'

const CUT_SEEDS = [3, 5, 7, 8, 9, 10]
const COLS = '4rem 1fr 8rem 14rem 10rem'
const ALL_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

function computeViews(eventData: EventContext, seed: number): PlayerView[] {
  const ctx = computeHistoricalData(eventData, seed)
  const odds = computePlayerOdds(ctx)
  return buildPlayerViews(ctx, odds)
}

export function DashboardClient({
  eventData,
  seed,
  eventLabel = 'S10 LCQ',
  live = true,
  backHref,
}: {
  eventData: EventContext
  seed: number
  eventLabel?: string
  live?: boolean
  backHref?: string
}) {
  const [activeTab, setActiveTab] = useState<'standings' | 'analytics' | 'players'>('standings')
  const filterKey = `endereye:filter:${eventLabel}`
  const [filteredNicknames, setFilteredNicknames] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem(filterKey)
      return stored ? (JSON.parse(stored) as string[]) : []
    } catch {
      return []
    }
  })
  useEffect(() => {
    try {
      if (filteredNicknames.length === 0) localStorage.removeItem(filterKey)
      else localStorage.setItem(filterKey, JSON.stringify(filteredNicknames))
    } catch {}
  }, [filteredNicknames, filterKey])
  const [scenarioTarget, setScenarioTarget] = useState<{
    view: PlayerView
    scenarios: SurvivalScenario[]
    failureScenarios: SurvivalScenario[]
    dnfSurvivalProbability: number
  } | null>(null)
  const [state, setState] = useState(() => ({
    seed,
    promise: new Promise<PlayerView[]>((resolve) =>
      setTimeout(() => resolve(computeViews(eventData, seed)), 0),
    ),
  }))

  let promise = state.promise
  if (state.seed !== seed) {
    promise = new Promise<PlayerView[]>((resolve) =>
      setTimeout(() => resolve(computeViews(eventData, seed)), 0),
    )
    setState({ seed, promise })
  }

  const [recordsState, setRecordsState] = useState(() => ({
    seed,
    promise: new Promise<ScenarioRecords | null>((resolve) =>
      setTimeout(() => {
        const ctx = computeHistoricalData(eventData, seed)
        resolve(buildScenarioRecords(ctx))
      }, 0),
    ),
  }))

  let recordsPromise = recordsState.promise
  if (recordsState.seed !== seed) {
    recordsPromise = new Promise<ScenarioRecords | null>((resolve) =>
      setTimeout(() => {
        const ctx = computeHistoricalData(eventData, seed)
        resolve(buildScenarioRecords(ctx))
      }, 0),
    )
    setRecordsState({ seed, promise: recordsPromise })
  }

  const views = use(promise)
  const scenarioRecords = use(recordsPromise)

  const allNicknames = views.map((v) => v.nickname)

  const isMss = eventData.kind === 'mss'
  const qualifiedLabel = (pts: number) => (isMss ? `${pts} Phase Points` : undefined)

  const activeViews = views.filter((v) => v.status !== 'eliminated')
  const rows = activeViews.map((v) =>
    toRowData(v, eventData.overrides, qualifiedLabel(mssPhasePoints(v.rank))),
  )
  const eliminatedRows = views
    .filter((v) => v.status === 'eliminated')
    .map((v) => {
      const row = toRowData(v, eventData.overrides, qualifiedLabel(mssPhasePoints(v.rank)))
      if (isMss) {
        const pts = mssPhasePoints(v.rank)
        return pts > 0 ? { ...row, phasePoints: pts } : row
      }
      return row
    })
  const viewByNickname = new Map(activeViews.map((v) => [v.nickname, v]))

  function scenarioCallback(nickname: string) {
    const view = viewByNickname.get(nickname)
    if (!view) return undefined
    const eligible =
      view.status === 'danger' || (view.status === 'safe' && typeof view.clinchPlace === 'number')
    if (!eligible) return undefined
    return () =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          const threatMode =
            view.status === 'safe' ||
            view.status === 'qualified' ||
            view.survivalProbability >= 0.75
          const scenarios = scenarioRecords
            ? deriveScenariosFromRecords(view.uuid, scenarioRecords, { threatMode }).scenarios
            : []
          if (typeof view.clinchPlace === 'number') {
            const ctx = computeHistoricalData(eventData, seed)
            const { scenarios: failureScenarios, dnfSurvivalProbability } = computeFailureScenarios(
              ctx,
              view.uuid,
              threatMode,
            )
            setScenarioTarget({ view, scenarios, failureScenarios, dnfSurvivalProbability })
          } else {
            setScenarioTarget({ view, scenarios, failureScenarios: [], dnfSurvivalProbability: 0 })
          }
          resolve()
        }, 0),
      )
  }

  function addFilter(nick: string) {
    setFilteredNicknames((prev) => (prev.includes(nick) ? prev : [...prev, nick]))
  }
  function removeFilter(nick: string) {
    setFilteredNicknames((prev) => prev.filter((n) => n !== nick))
  }

  const nextCut = CUT_SEEDS.find((s) => s > seed)
  const qualifyCount = eventData.qualifyCount ?? 4
  const cutKeep = computeCutKeep(seed, rows.length, qualifyCount)

  const allAboveCut =
    nextCut === 3 ? rows.filter((r) => r.pts > 0) : cutKeep != null ? rows.slice(0, cutKeep) : rows
  const allBelowCut =
    nextCut === 3 ? rows.filter((r) => r.pts === 0) : cutKeep != null ? rows.slice(cutKeep) : []

  const filterSet = filteredNicknames.length > 0 ? new Set(filteredNicknames) : null
  const aboveCut = filterSet ? allAboveCut.filter((r) => filterSet.has(r.nickname)) : allAboveCut
  const belowCut = filterSet ? allBelowCut.filter((r) => filterSet.has(r.nickname)) : allBelowCut
  const visibleEliminated = filterSet
    ? eliminatedRows.filter((r) => filterSet.has(r.nickname))
    : eliminatedRows

  const counts = rows.reduce(
    (acc, r) => {
      if (r.status === 'qualified') acc.qualified = (acc.qualified ?? 0) + 1
      else if (r.status === 'safe') acc.safe = (acc.safe ?? 0) + 1
      else if (r.status === 'near-safe') acc.nearSafe = (acc.nearSafe ?? 0) + 1
      else if (r.status === 'coin-flip') acc.coinFlip = (acc.coinFlip ?? 0) + 1
      else if (r.status === 'at-risk') acc.atRisk = (acc.atRisk ?? 0) + 1
      else if (r.status === 'must-clutch') acc.mustClutch = (acc.mustClutch ?? 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  const cutLabel =
    cutKeep != null && nextCut != null
      ? `Top ${cutKeep} survive · after seed ${nextCut}`
      : nextCut === 3
        ? `0-point players eliminated · after seed ${nextCut}`
        : undefined

  return (
    <>
      {backHref && (
        <div className="w-full px-4 lg:px-8 pt-4">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft size={14} />
            Back
          </Link>
        </div>
      )}
      <DashboardHeader
        event={eventLabel}
        seeds={ALL_SEEDS.slice(0, eventData.currentRound - 1)}
        currentSeed={seed}
        alive={rows.length}
        counts={counts}
        live={live}
      />
      <Surface width="xl">
        <div className="flex flex-col gap-2">
          <Tabs
            tabs={[
              { label: 'Standings', value: 'standings' },
              { label: 'Analytics', value: 'analytics' },
              { label: 'Players', value: 'players' },
            ]}
            value={activeTab}
            onChange={(v) => setActiveTab(v as 'standings' | 'analytics' | 'players')}
          />
          <PlayerFilter
            players={allNicknames}
            selected={filteredNicknames}
            onAdd={addFilter}
            onRemove={removeFilter}
          />
          <div className="border-b border-zinc-800" />

          {activeTab === 'standings' && (
            <>
              <Banner
                label="Disclaimer"
                detail="Survival odds only reflect the next elimination round. A 'Safe' status right now does not guarantee safety for the entire event"
              />
              <Banner
                label="Simulation Variance"
                detail={
                  <>
                    Percentages may fluctuate by up to 1.5% on refresh because of simulation
                    variance.{' '}
                    <Link href="/method" className="underline">
                      Read the methodology
                    </Link>
                    .
                  </>
                }
              />
              <Table cols={COLS}>
                {aboveCut.map((row) => (
                  <StandingsRow
                    key={row.nickname}
                    row={row}
                    onSelectScenarios={scenarioCallback(row.nickname)}
                  />
                ))}
              </Table>

              {belowCut.length > 0 && (
                <>
                  <Banner label="Next Elimination" detail={cutLabel} variant="danger" />
                  <Table cols={COLS}>
                    {belowCut.map((row) => (
                      <StandingsRow
                        key={row.nickname}
                        row={row}
                        onSelectScenarios={scenarioCallback(row.nickname)}
                      />
                    ))}
                  </Table>
                </>
              )}

              {visibleEliminated.length > 0 && <EliminatedSection rows={visibleEliminated} />}
            </>
          )}

          {activeTab === 'analytics' && (
            <AnalyticsPanel
              eventData={eventData}
              filteredNicknames={filteredNicknames}
              viewSeed={seed}
            />
          )}

          {activeTab === 'players' && (
            <PlayersPanel players={eventData.players} filteredNicknames={filteredNicknames} />
          )}
        </div>
      </Surface>

      <SurvivalScenariosModal
        targetView={scenarioTarget?.view ?? null}
        scenarios={scenarioTarget?.scenarios ?? null}
        failureScenarios={scenarioTarget?.failureScenarios ?? null}
        dnfSurvivalProbability={scenarioTarget?.dnfSurvivalProbability ?? 0}
        nicknameOf={(uuid) => eventData.players.find((p) => p.uuid === uuid)?.nickname ?? uuid}
        onClose={() => setScenarioTarget(null)}
      />
    </>
  )
}
