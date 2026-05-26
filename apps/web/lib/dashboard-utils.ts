import type { PlayerView } from '@endereye/core'
import type { OverrideMap } from '@endereye/core'
import type { Status } from '@/components/ui'
import type { StandingsRowData, PillData, OverrideEntry } from '@/app/views/StandingsRow'

export { type StandingsRowData, type PillData, type OverrideEntry }

const CUT_SEEDS = [3, 5, 7, 8, 9, 10]

export function mssPhasePoints(rank: number): number {
  if (rank <= 4) return 25
  if (rank <= 6) return 20
  if (rank <= 8) return 15
  if (rank <= 10) return 10
  return 0
}

export function survivalPct(p: number): number {
  return Math.round(p * 100)
}

export function computeCutKeep(
  seed: number,
  totalPlayers: number,
  qualifyCount: number,
): number | undefined {
  const nextCut = CUT_SEEDS.find((s) => s > seed)
  if (nextCut === 5) return Math.ceil(totalPlayers / 2)
  if (nextCut === 7) return 10
  if (nextCut === 8) return 8
  if (nextCut === 9) return 6
  if (nextCut === 10) return qualifyCount
  return undefined
}

export function mapStatus(view: PlayerView): Status {
  if (view.status === 'qualified') return 'qualified'
  if (view.status === 'eliminated') return 'out'
  if (view.status === 'safe') return 'safe'
  const p = view.survivalProbability
  if (p >= 0.75) return 'near-safe'
  if (p >= 0.45) return 'coin-flip'
  if (p >= 0.15) return 'at-risk'
  return 'must-clutch'
}

export function mapPill(view: PlayerView): PillData | undefined {
  if (view.status === 'qualified' || view.status === 'eliminated') return undefined
  if (view.clinchPlace !== null && view.clinchPlace !== 'DNF') {
    return { type: 'needs', rank: view.clinchPlace as number }
  }
  if (view.cutDelta < 0) {
    return { type: 'to-cut', deficit: Math.abs(view.cutDelta) }
  }
  return undefined
}

export function toRowData(
  view: PlayerView,
  overrideMap?: OverrideMap,
  qualifiedLabel?: string,
): StandingsRowData {
  const delta =
    view.prevRank != null && view.prevRank !== view.rank ? view.prevRank - view.rank : null

  const playerOverrides = overrideMap?.[view.uuid]
  const overrides: OverrideEntry[] | undefined = playerOverrides
    ? Object.entries(playerOverrides).map(([seedIndex, info]) => ({
        seed: Number(seedIndex) + 1,
        original: info.original,
        override: info.override,
      }))
    : undefined

  return {
    rank: view.rank,
    delta,
    nickname: view.nickname,
    pts: view.point,
    bonus: view.bonus,
    status: mapStatus(view),
    survivalPct: survivalPct(view.survivalProbability),
    pill: mapPill(view),
    overrides,
    qualifiedLabel,
  }
}
