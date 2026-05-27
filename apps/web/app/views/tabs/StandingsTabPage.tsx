'use client'

import Link from 'next/link'
import { Suspense, use, useState } from 'react'
import {
  buildScenarioRecords,
  computeHistoricalData,
  deriveScenariosFromRecords,
  computeFailureScenarios,
} from '@endereye/core'
import type { PlayerView, ScenarioRecords, SurvivalScenario } from '@endereye/core'
import { Banner } from '@/components/layout'
import { Table } from '@/components/ui'
import { StandingsRow } from '../StandingsRow'
import { EliminatedSection } from '../EliminatedSection'
import { SurvivalScenariosModal } from '../SurvivalScenariosModal'
import { Spinner } from '../Spinner'
import { mssPhasePoints, computeCutKeep, toRowData } from '@/lib/dashboard-utils'
import { useEventShell } from '../EventShell'

const CUT_SEEDS = [3, 5, 7, 8, 9, 10]
const COLS = '4rem 1fr 8rem 14rem 10rem'

function StandingsInner() {
  const { views, eventData, seed, filteredNicknames } = useEventShell()

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

  const scenarioRecords = use(recordsPromise)

  const [scenarioTarget, setScenarioTarget] = useState<{
    view: PlayerView
    scenarios: SurvivalScenario[]
    failureScenarios: SurvivalScenario[]
    dnfSurvivalProbability: number
  } | null>(null)

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

  const cutLabel =
    cutKeep != null && nextCut != null
      ? `Top ${cutKeep} survive · after seed ${nextCut}`
      : nextCut === 3
        ? `0-point players eliminated · after seed ${nextCut}`
        : undefined

  return (
    <>
      <Banner
        label="Disclaimer"
        detail="Survival odds only reflect the next elimination round. A 'Safe' status right now does not guarantee safety for the entire event"
      />
      <Banner
        label="Simulation Variance"
        detail={
          <>
            Percentages may fluctuate by up to 1.5% on refresh because of simulation variance.{' '}
            <Link href="/method" className="underline">
              Read the methodology
            </Link>
            .
          </>
        }
      />
      <Table cols={COLS}>
        {aboveCut.map((row) => (
          <StandingsRow key={row.nickname} row={row} onSelectScenarios={scenarioCallback(row.nickname)} />
        ))}
      </Table>

      {belowCut.length > 0 && (
        <>
          <Banner label="Next Elimination" detail={cutLabel} variant="danger" />
          <Table cols={COLS}>
            {belowCut.map((row) => (
              <StandingsRow key={row.nickname} row={row} onSelectScenarios={scenarioCallback(row.nickname)} />
            ))}
          </Table>
        </>
      )}

      {visibleEliminated.length > 0 && <EliminatedSection rows={visibleEliminated} />}

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

export function StandingsTabPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-8"><Spinner /></div>}>
      <StandingsInner />
    </Suspense>
  )
}
