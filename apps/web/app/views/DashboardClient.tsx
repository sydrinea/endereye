'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { use, useState } from 'react'
import { computeHistoricalData, buildPlayerViews } from '@endereye/core'
import type { PlayerView, EventData } from '@endereye/core'
import { DashboardHeader, CutBanner, Surface } from '@/components/layout'
import { Table } from '@/components/ui'
import { StandingsRow } from './StandingsRow'
import { EliminatedSection } from './EliminatedSection'
import type { StandingsRowData } from './StandingsRow'
import type { Status } from '@/components/ui'

const CUT_SEEDS = [3, 5, 7, 8, 9, 10]
const COLS = '4rem 1fr 8rem 14rem 10rem'
const ALL_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

function mapStatus(view: PlayerView): Status {
  if (view.status === 'qualified') return 'qualified'
  if (view.status === 'eliminated') return 'out'
  if (view.status === 'safe') return 'safe'
  const p = view.survivalProbability
  if (p >= 0.75) return 'near-safe'
  if (p >= 0.45) return 'coin-flip'
  if (p >= 0.15) return 'at-risk'
  return 'must-clutch'
}

function mapPill(view: PlayerView): StandingsRowData['pill'] {
  if (view.status === 'qualified' || view.status === 'eliminated') return undefined
  if (view.clinchPlace !== null && view.clinchPlace !== 'DNF') {
    return { type: 'needs', rank: view.clinchPlace as number }
  }
  if (view.cutDelta < 0) {
    return { type: 'to-cut', deficit: Math.abs(view.cutDelta) }
  }
  return undefined
}

function toRowData(view: PlayerView): StandingsRowData {
  const delta =
    view.prevRank != null && view.prevRank !== view.rank ? view.prevRank - view.rank : null
  const status = mapStatus(view)
  const pct =
    status === 'safe' || status === 'qualified' ? view.winProbability : view.survivalProbability
  return {
    rank: view.rank,
    delta,
    nickname: view.nickname,
    pts: view.point,
    bonus: view.bonus,
    status,
    survivalPct: Math.round(pct * 100),
    pill: mapPill(view),
  }
}

export function DashboardClient({
  eventData,
  seed,
  eventLabel = 'S10 LCQ',
  live = true,
  backHref,
}: {
  eventData: EventData
  seed: number
  eventLabel?: string
  live?: boolean
  backHref?: string
}) {
  const [state, setState] = useState(() => ({
    seed,
    promise: new Promise<PlayerView[]>((resolve) => {
      setTimeout(() => {
        const historical = computeHistoricalData(eventData, seed)
        const views = buildPlayerViews(historical)
        resolve(views)
      }, 0)
    }),
  }))

  let promise = state.promise
  if (state.seed !== seed) {
    promise = new Promise<PlayerView[]>((resolve) => {
      setTimeout(() => {
        const historical = computeHistoricalData(eventData, seed)
        const views = buildPlayerViews(historical)
        resolve(views)
      }, 0)
    })
    setState({ seed, promise })
  }

  const views = use(promise)

  const rows = views.filter((v) => v.status !== 'eliminated').map(toRowData)
  const eliminatedRows = views.filter((v) => v.status === 'eliminated').map(toRowData)

  const nextCut = CUT_SEEDS.find((s) => s > seed)
  const cutKeep =
    nextCut === 5
      ? Math.ceil(rows.length / 2)
      : nextCut === 7
        ? 10
        : nextCut === 8
          ? 8
          : nextCut === 9
            ? 6
            : nextCut === 10
              ? 4
              : undefined

  const aboveCut = cutKeep != null ? rows.slice(0, cutKeep) : rows
  const belowCut = cutKeep != null ? rows.slice(cutKeep) : []

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
          <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            <ArrowLeft size={14} />Back
          </Link>
        </div>
      )}
      <DashboardHeader
        event={eventLabel}
        seeds={ALL_SEEDS}
        currentSeed={seed}
        alive={rows.length}
        counts={counts}
        live={live}
      />
      <Surface width="xl">
        <div className="flex flex-col gap-2">
          <Table cols={COLS}>
            {aboveCut.map((row) => (
              <StandingsRow key={row.nickname} row={row} />
            ))}
          </Table>

          {belowCut.length > 0 && (
            <>
              <CutBanner label="Next Elimination" detail={cutLabel} />
              <Table cols={COLS}>
                {belowCut.map((row) => (
                  <StandingsRow key={row.nickname} row={row} />
                ))}
              </Table>
            </>
          )}

          {eliminatedRows.length > 0 && <EliminatedSection rows={eliminatedRows} />}
        </div>
      </Surface>
    </>
  )
}
