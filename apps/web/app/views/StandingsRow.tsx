'use client'

import { useState } from 'react'
import { PlayerAvatar, RankDelta, StatusBadge, SurvivalPill, TableCell, TableRow } from '@/components/ui'
import type { Status } from '@/components/ui'

export type PillData = { type: 'needs'; rank: number } | { type: 'to-cut'; deficit: number }

export interface StandingsRowData {
  rank: number
  delta: number | null
  nickname: string
  pts: number
  bonus: number
  status: Status
  survivalPct: number
  pill?: PillData
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

const statusDotColor: Record<Status, string> = {
  qualified: 'bg-qualified',
  safe: 'bg-safe',
  'near-safe': 'bg-near-safe',
  'coin-flip': 'bg-coin-flip',
  'at-risk': 'bg-at-risk',
  'must-clutch': 'bg-must-clutch',
  out: 'bg-zinc-600',
}

export function StandingsRow({ row }: { row: StandingsRowData }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <TableRow accentColor={statusAccent[row.status]} onClick={() => setExpanded((e) => !e)}>
      {/* Desktop layout */}
      <TableCell className="hidden lg:block">
        <div className="flex flex-col gap-0.5">
          <span className="font-display text-zinc-300">{row.rank}</span>
          <RankDelta delta={row.delta} />
        </div>
      </TableCell>

      <TableCell className="hidden lg:block">
        <div className="flex items-center gap-3">
          <PlayerAvatar nickname={row.nickname} />
          <span className="font-display text-zinc-100">{row.nickname}</span>
        </div>
      </TableCell>

      <TableCell className="hidden lg:block text-right">
        <div className="flex flex-col items-end">
          <span className="font-display text-xl text-zinc-100 leading-none">{row.pts}</span>
          {row.bonus > 0 && (
            <span className="text-xs text-zinc-500 mt-0.5">+{row.bonus} bonus</span>
          )}
        </div>
      </TableCell>

      <TableCell className="hidden lg:block">
        <div className="flex flex-col">
          <StatusBadge status={row.status} />
          <span className={`text-xs mt-0.5 ${dimmedFg[row.status]}`}>
            {row.survivalPct}%{' '}
            {row.status === 'safe' || row.status === 'qualified' ? 'Win' : 'Survive'}
          </span>
        </div>
      </TableCell>

      <TableCell className="hidden lg:flex justify-end">
        {row.pill && <SurvivalPill {...row.pill} />}
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
          <span className="font-display text-zinc-100 shrink-0">{row.pts}</span>
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDotColor[row.status]}`} />
        </div>

        {/* Expandable detail */}
        <div
          className={`grid transition-all duration-200 ${expanded ? 'grid-rows-[1fr] mt-3' : 'grid-rows-[0fr]'}`}
        >
          <div className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-0.5 pl-8">
              <StatusBadge status={row.status} />
              <span className={`text-xs ${dimmedFg[row.status]}`}>
                {row.survivalPct}%{' '}
                {row.status === 'safe' || row.status === 'qualified' ? 'Win' : 'Survive'}
              </span>
              {row.bonus > 0 && <span className="text-xs text-zinc-500">+{row.bonus} bonus</span>}
              {row.pill && <SurvivalPill {...row.pill} />}
            </div>
          </div>
        </div>
      </TableCell>
    </TableRow>
  )
}
