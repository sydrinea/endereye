'use client'

import { useState } from 'react'
import { Pencil, GitBranch, ShieldAlert } from 'lucide-react'
import {
  PlayerAvatar,
  RankDelta,
  StatusBadge,
  SurvivalPill,
  TableCell,
  TableRow,
} from '@/components/ui'
import type { Status } from '@/components/ui'
import { Spinner } from './Spinner'

export type PillData = { type: 'needs'; rank: number } | { type: 'to-cut'; deficit: number }

export interface OverrideEntry {
  seed: number
  original: number
  override: number
}

export interface HypoRowData {
  survivalPct: number
  status: Status
  pill?: PillData
  /** 1-based place assigned this seed, or 0 if unassigned. */
  place: number
  projectedPts: number
}

export interface StandingsRowData {
  rank: number
  delta: number | null
  nickname: string
  pts: number
  bonus: number
  status: Status
  survivalPct: number
  pill?: PillData
  overrides?: OverrideEntry[]
  qualifiedLabel?: string
  phasePoints?: number
  uuid?: string
  hypo?: HypoRowData
}

const dimmedFg: Record<Status, string> = {
  qualified: 'text-qualified/60',
  safe: 'text-safe/60',
  'near-safe': 'text-near-safe/60',
  'coin-flip': 'text-coin-flip/60',
  'at-risk': 'text-at-risk/60',
  'must-clutch': 'text-must-clutch/60',
  out: 'text-zinc-600',
}

export const statusAccent: Record<Status, string | undefined> = {
  qualified: 'var(--color-qualified)',
  safe: 'var(--color-safe)',
  'near-safe': 'var(--color-near-safe)',
  'coin-flip': 'var(--color-coin-flip)',
  'at-risk': 'var(--color-at-risk)',
  'must-clutch': 'var(--color-must-clutch)',
  out: undefined,
}

function PlacePicker({
  n,
  selected,
  onPick,
  status,
  className = '',
}: {
  n: number
  selected: number
  onPick: (place: number) => void
  status: Status
  className?: string
}) {
  const accent = statusAccent[status] ?? 'var(--color-coin-flip)'
  return (
    <div
      className={`flex flex-wrap gap-1 ${className}`}
      onClick={(e) => e.stopPropagation()}
      role="group"
      aria-label="Assign finishing place"
    >
      {Array.from({ length: n }, (_, i) => i + 1).map((p) => {
        const active = selected === p
        return (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className="w-6 h-6 rounded text-[11px] font-medium font-display transition-colors cursor-pointer"
            style={{
              color: accent,
              background: `color-mix(in srgb, ${accent} ${active ? '28%' : '10%'}, transparent)`,
              border: `1px solid color-mix(in srgb, ${accent} ${active ? '55%' : '24%'}, transparent)`,
            }}
          >
            {p}
          </button>
        )
      })}
    </div>
  )
}

const statusDotColor: Record<Status, string> = {
  qualified: 'bg-qualified',
  safe: 'bg-safe',
  'near-safe': 'bg-near-safe',
  'coin-flip': 'bg-coin-flip',
  'at-risk': 'bg-at-risk',
  'must-clutch': 'bg-must-clutch',
  out: 'bg-zinc-600',
}

function SurvivalPathsButton({
  onClick,
  status,
}: {
  onClick: () => Promise<void>
  status: Status
}) {
  const [pending, setPending] = useState(false)
  const [hovered, setHovered] = useState(false)
  const accent = statusAccent[status]
  const threatMode = status === 'safe' || status === 'qualified' || status === 'near-safe'

  async function handle(e: React.MouseEvent) {
    e.stopPropagation()
    if (pending) return
    setPending(true)
    await onClick()
    setPending(false)
  }

  return (
    <button
      onClick={handle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors cursor-pointer shrink-0"
      style={{
        color: accent,
        background: `color-mix(in srgb, ${accent} ${hovered ? '20%' : '12%'}, transparent)`,
        border: `1px solid color-mix(in srgb, ${accent} ${hovered ? '45%' : '28%'}, transparent)`,
      }}
    >
      {pending ? (
        <Spinner size={11} colorValue={accent ?? undefined} />
      ) : threatMode ? (
        <ShieldAlert size={11} />
      ) : (
        <GitBranch size={11} />
      )}
      {threatMode ? 'Threat Paths' : 'Survival Paths'}
    </button>
  )
}

export function StandingsRow({
  row,
  onSelectScenarios,
  assignMode = false,
  fieldSize = 0,
  onAssign,
}: {
  row: StandingsRowData
  onSelectScenarios?: () => Promise<void>
  assignMode?: boolean
  fieldSize?: number
  onAssign?: (place: number) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const h = row.hypo
  const survPct = h ? h.survivalPct : row.survivalPct
  const pill = h ? h.pill : row.pill
  const dispStatus: Status = h ? h.status : row.status
  const survClass = h ? `${dimmedFg[dispStatus]} italic` : dimmedFg[dispStatus]
  const showPicker = assignMode && fieldSize > 0 && !!onAssign
  const ptsChanged = !!h && h.projectedPts !== row.pts
  const dispPts = ptsChanged ? h!.projectedPts : row.pts

  return (
    <TableRow accentColor={statusAccent[dispStatus]} onClick={() => setExpanded((e) => !e)}>
      {/* Desktop layout */}
      <TableCell className="hidden lg:block">
        <div className="flex flex-col gap-0.5">
          <span className="font-display text-zinc-300">{row.rank}</span>
          <RankDelta delta={row.delta} />
        </div>
      </TableCell>

      <TableCell className="hidden lg:block">
        <div className="flex items-center gap-3 flex-wrap">
          <PlayerAvatar nickname={row.nickname} />
          <span className="font-display text-zinc-100">{row.nickname}</span>
          {showPicker && (
            <PlacePicker
              n={fieldSize}
              selected={h?.place ?? 0}
              onPick={(p) => onAssign!(p)}
              status={dispStatus}
            />
          )}
        </div>
      </TableCell>

      <TableCell className="hidden lg:block text-right">
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-1.5">
            {row.overrides && row.overrides.length > 0 && (
              <div className="relative group">
                <Pencil size={11} className="text-zinc-500 cursor-default" />
                <div className="absolute bottom-full right-0 mb-1.5 hidden group-hover:block z-10 pointer-events-none">
                  <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-2 text-xs text-zinc-300 whitespace-nowrap shadow-lg">
                    {row.overrides.map((o) => (
                      <div key={o.seed}>
                        Seed {o.seed}: {o.original} → {o.override}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <span
              className={`font-display text-xl leading-none ${ptsChanged ? 'text-amber-300' : 'text-zinc-100'}`}
              title={ptsChanged ? `Official: ${row.pts}` : undefined}
            >
              {dispPts}
            </span>
          </div>
          {row.bonus > 0 && (
            <span className="text-xs text-zinc-500 mt-0.5">+{row.bonus} bonus</span>
          )}
        </div>
      </TableCell>

      <TableCell className="hidden lg:block">
        <div className="flex flex-col">
          <StatusBadge
            status={dispStatus}
            label={dispStatus === 'qualified' ? row.qualifiedLabel : undefined}
          />
          <span
            className={`text-xs mt-0.5 ${survClass}`}
            title={h ? `Official: ${row.survivalPct}% Survive` : undefined}
          >
            {h ? '~' : ''}
            {survPct}% Survive
          </span>
        </div>
      </TableCell>

      <TableCell className="hidden lg:flex justify-end items-center gap-2">
        {pill && (
          <span className="inline-flex shrink-0">
            <SurvivalPill {...pill} />
          </span>
        )}
        {onSelectScenarios && (
          <SurvivalPathsButton onClick={onSelectScenarios} status={dispStatus} />
        )}
      </TableCell>

      {/* Mobile layout — spans all columns */}
      <TableCell className="lg:hidden col-span-full">
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center w-5 shrink-0">
            <span className="font-display text-zinc-400">{row.rank}</span>
            <RankDelta delta={row.delta} />
          </div>
          <PlayerAvatar nickname={row.nickname} size="sm" />
          <span className="font-display text-zinc-100 flex-1 truncate">{row.nickname}</span>
          <span
            className={`font-display shrink-0 ${ptsChanged ? 'text-amber-300' : 'text-zinc-100'}`}
          >
            {dispPts}
          </span>
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDotColor[dispStatus]}`}
          />
        </div>

        {showPicker && (
          <PlacePicker
            n={fieldSize}
            selected={h?.place ?? 0}
            onPick={(p) => onAssign!(p)}
            status={dispStatus}
            className="mt-2 pl-8"
          />
        )}

        {/* Expandable detail */}
        <div
          className={`grid transition-all duration-200 ${expanded ? 'grid-rows-[1fr] mt-3' : 'grid-rows-[0fr]'}`}
        >
          <div className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-0.5 pl-8">
              <StatusBadge
                status={dispStatus}
                label={dispStatus === 'qualified' ? row.qualifiedLabel : undefined}
              />
              <span
                className={`text-xs transition-colors duration-300 ${survClass}`}
                title={h ? `Official: ${row.survivalPct}% Survive` : undefined}
              >
                {h ? '~' : ''}
                {survPct}% Survive
              </span>
              {row.bonus > 0 && <span className="text-xs text-zinc-500">+{row.bonus} bonus</span>}
              {pill && <SurvivalPill {...pill} />}
              {onSelectScenarios && (
                <SurvivalPathsButton onClick={onSelectScenarios} status={dispStatus} />
              )}
            </div>
          </div>
        </div>
      </TableCell>
    </TableRow>
  )
}
