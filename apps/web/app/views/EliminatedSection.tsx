'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Table, TableRow, TableCell } from '@/components/ui'
import { PlayerAvatar } from '@/components/ui'
import type { StandingsRowData } from './StandingsRow'

const COLS = '4rem 1fr 8rem'

export function EliminatedSection({ rows }: { rows: StandingsRowData[] }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-1 text-sm text-zinc-500 hover:text-zinc-400 transition-colors"
      >
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
        <span>{rows.length} eliminated</span>
      </button>

      <div className={`grid transition-all duration-200 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <Table cols={COLS}>
            {rows.map(row => (
              <TableRow key={row.nickname}>
                {/* Desktop */}
                <TableCell className="hidden lg:block">
                  <span className="font-display text-zinc-600">{row.rank}</span>
                </TableCell>
                <TableCell className="hidden lg:block">
                  <div className="flex items-center gap-3 opacity-50">
                    <PlayerAvatar nickname={row.nickname} />
                    <span className="font-display text-zinc-400">{row.nickname}</span>
                  </div>
                </TableCell>
                <TableCell className="hidden lg:block text-right">
                  <div className="flex flex-col items-end">
                    <span className="font-display text-zinc-600">{row.pts}</span>
                    {row.phasePoints != null && (
                      <span className="text-xs text-zinc-500 mt-0.5">+{row.phasePoints} phase pts</span>
                    )}
                  </div>
                </TableCell>

                {/* Mobile */}
                <TableCell className="lg:hidden col-span-full">
                  <div className="flex items-center gap-3 opacity-50">
                    <span className="font-display text-zinc-600 w-5 shrink-0">{row.rank}</span>
                    <PlayerAvatar nickname={row.nickname} size="sm" />
                    <span className="font-display text-zinc-400 flex-1 truncate">{row.nickname}</span>
                    <div className="flex flex-col items-end shrink-0">
                      <span className="font-display text-zinc-600">{row.pts}</span>
                      {row.phasePoints != null && (
                        <span className="text-xs text-zinc-500">+{row.phasePoints} phase pts</span>
                      )}
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </Table>
        </div>
      </div>
    </div>
  )
}
