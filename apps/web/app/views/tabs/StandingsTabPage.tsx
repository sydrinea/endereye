'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
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
import { mssPhasePoints, computeCutKeep, toRowData } from '@/lib/dashboard-utils'
import { useEventShell } from '../EventShell'
import { useHypotheticalPlacements } from '../useHypotheticalPlacements'
import backtest from '@/public/method/backtest.json'

const CUT_SEEDS = [3, 5, 7, 8, 9, 10]

const SIMULATION_VARIANCE_PCT = Math.ceil(backtest.metrics.p99McShift * 1000) / 10
const COLS = '4rem 1fr 8rem 14rem 10rem'

export function StandingsTabPage() {
  const { views, eventData, seed, filteredNicknames, tryPlacements } = useEventShell()

  const scenarioRecordsRef = useRef<{ seed: number; records: ScenarioRecords | null } | null>(null)

  const [scenarioTarget, setScenarioTarget] = useState<{
    view: PlayerView
    scenarios: SurvivalScenario[]
    failureScenarios: SurvivalScenario[]
    dnfSurvivalProbability: number
  } | null>(null)

  function getScenarioRecords(): Promise<ScenarioRecords | null> {
    if (scenarioRecordsRef.current?.seed === seed) {
      return Promise.resolve(scenarioRecordsRef.current.records)
    }
    return new Promise((resolve) =>
      setTimeout(() => {
        const ctx = computeHistoricalData(eventData, seed)
        const records = buildScenarioRecords(ctx)
        scenarioRecordsRef.current = { seed, records }
        resolve(records)
      }, 0),
    )
  }

  const hypo = useHypotheticalPlacements(eventData, seed, views)
  const hypoActive = hypo.enabled && tryPlacements

  const isMss = eventData.kind === 'mss'
  const qualifiedLabel = (pts: number) => (isMss ? `${pts} Phase Points` : undefined)

  const activeViews = views.filter((v) => v.status !== 'eliminated')

  const rows = activeViews.map((v) => {
    const base = toRowData(v, eventData.overrides, qualifiedLabel(mssPhasePoints(v.rank)))
    const o = hypoActive ? hypo.overlay[v.uuid] : undefined
    return {
      ...base,
      uuid: v.uuid,
      hypo: o
        ? {
            survivalPct: o.survivalPct,
            status: o.status,
            pill: o.pill,
            place: o.place,
            projectedPts: o.projectedPts,
          }
        : undefined,
    }
  })
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
    // While a what-if is active, follow the hypothetical status/clinch so the
    // Threat/Survival Paths button appears (or disappears) with the new state.
    const overlay = hypoActive ? hypo.overlay[view.uuid] : undefined
    const effStatus: 'danger' | 'safe' | 'other' = overlay
      ? overlay.status === 'safe' ||
        overlay.status === 'near-safe' ||
        overlay.status === 'qualified'
        ? 'safe'
        : overlay.status === 'out'
          ? 'other'
          : 'danger'
      : view.status === 'danger'
        ? 'danger'
        : view.status === 'safe'
          ? 'safe'
          : 'other'
    const effClinch = overlay ? overlay.clinchPlace : view.clinchPlace
    const eligible =
      effStatus === 'danger' || (effStatus === 'safe' && typeof effClinch === 'number')
    if (!eligible) return undefined
    return () =>
      new Promise<void>((resolve) =>
        setTimeout(async () => {
          const scenarioRecords = await getScenarioRecords()
          const threatMode =
            effStatus === 'safe' || view.status === 'qualified' || view.survivalProbability >= 0.75
          const scenarios = scenarioRecords
            ? deriveScenariosFromRecords(view.uuid, scenarioRecords, { threatMode }).scenarios
            : []
          if (typeof effClinch === 'number') {
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

  // While placements are being tried, re-rank the active field by projected
  // points so the cut line reflects the hypothetical.
  const placementsSet = hypoActive && Object.keys(hypo.fixed).length > 0
  const orderedRows = placementsSet
    ? rows
        .map((r, i) => ({ r, i }))
        .sort(
          (a, b) =>
            (b.r.hypo?.projectedPts ?? b.r.pts) - (a.r.hypo?.projectedPts ?? a.r.pts) || a.i - b.i,
        )
        .map(({ r }, idx) => ({ ...r, rank: idx + 1, delta: null }))
    : rows

  // Points that decide the cut — projected under a what-if, official otherwise.
  const cutPointOf = (r: (typeof orderedRows)[number]) => r.hypo?.projectedPts ?? r.pts

  let allAboveCut: typeof orderedRows
  let allBelowCut: typeof orderedRows
  if (nextCut === 3) {
    allAboveCut = orderedRows.filter((r) => cutPointOf(r) > 0)
    allBelowCut = orderedRows.filter((r) => cutPointOf(r) === 0)
  } else if (cutKeep != null && cutKeep < orderedRows.length) {
    // Tie-aware, matching applyElimination's keepTop rule: everyone at or above
    // the keepCount-th point value survives, so ties at the line all stay in.
    const threshold = [...orderedRows].map(cutPointOf).sort((a, b) => b - a)[cutKeep - 1]
    allAboveCut = orderedRows.filter((r) => cutPointOf(r) >= threshold)
    allBelowCut = orderedRows.filter((r) => cutPointOf(r) < threshold)
  } else {
    allAboveCut = orderedRows
    allBelowCut = []
  }

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
        detail="Survival odds only reflect the next elimination round. A 'Safe' status right now does not guarantee safety for the entire event."
      />
      <Banner
        label="Simulation Variance"
        detail={
          <>
            Percentages may fluctuate by up to {SIMULATION_VARIANCE_PCT}% on refresh because of
            simulation variance.{' '}
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
            assignMode={hypoActive}
            fieldSize={hypo.fieldSize}
            onAssign={row.uuid ? (place) => hypo.assign(row.uuid!, place) : undefined}
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
                assignMode={hypoActive}
                fieldSize={hypo.fieldSize}
                onAssign={row.uuid ? (place) => hypo.assign(row.uuid!, place) : undefined}
              />
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
