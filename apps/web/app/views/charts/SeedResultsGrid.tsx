'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { PlayerAvatar } from '@/components/ui'

export interface SeedResultCell {
  place: number | null
  score: number | null
  rankAfter: number | null
  rankDelta: number | null
  eliminated: boolean
}

export interface SeedResultRow {
  uuid: string
  nickname: string
  color: string
  cells: SeedResultCell[]
}

interface Props {
  rows: SeedResultRow[]
  seeds: number[]
}

const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: '6px',
  padding: '8px 12px',
  minWidth: '140px',
  fontSize: '12px',
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

function cellBg(cell: SeedResultCell): string {
  if (cell.eliminated || cell.place === null) return 'transparent'
  if (cell.place <= 5) return 'rgba(74,222,128,0.12)'
  if (cell.place <= 12) return 'rgba(250,204,21,0.12)'
  return 'rgba(248,113,113,0.12)'
}

function placeColor(cell: SeedResultCell): string {
  if (cell.eliminated) return '#3f3f46'
  if (cell.place === null) return '#3f3f46'
  if (cell.place <= 5) return '#4ade80'
  if (cell.place <= 12) return '#facc15'
  return '#f87171'
}

function placeLabel(cell: SeedResultCell): string {
  if (cell.eliminated) return '/'
  if (cell.place === null) return '---'
  return ordinal(cell.place)
}

const TOOLTIP_W = 180
const TOOLTIP_H = 96
const TOOLTIP_PAD = 8

function tooltipPos(rect: DOMRect) {
  const left = Math.max(
    TOOLTIP_PAD,
    Math.min(rect.left + rect.width / 2 - TOOLTIP_W / 2, window.innerWidth - TOOLTIP_W - TOOLTIP_PAD),
  )
  const fitsAbove = rect.top - TOOLTIP_H - TOOLTIP_PAD > 0
  const top = fitsAbove ? rect.top - TOOLTIP_PAD : rect.bottom + TOOLTIP_PAD
  const transform = fitsAbove ? 'translateY(-100%)' : 'none'
  return { left, top, transform }
}

interface TooltipState {
  rowIdx: number
  colIdx: number
  left: number
  top: number
  transform: string
}

export function SeedResultsGrid({ rows, seeds }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  if (rows.length === 0 || seeds.length === 0) return null

  // Filter out players with >50% of seeds as DNF (place null, not eliminated)
  const filtered = rows.filter((row) => {
    const playedCells = row.cells.filter((c) => !c.eliminated)
    if (playedCells.length === 0) return true
    const dnfCount = playedCells.filter((c) => c.place === null).length
    return dnfCount / playedCells.length <= 0.5
  })

  // Sort: alive first (by rankAfter of last cell), eliminated after (by elimination seed)
  const sorted = [...filtered].sort((a, b) => {
    const aLast = a.cells[a.cells.length - 1]
    const bLast = b.cells[b.cells.length - 1]
    const aElim = aLast?.eliminated ?? true
    const bElim = bLast?.eliminated ?? true
    if (aElim !== bElim) return aElim ? 1 : -1
    if (!aElim && !bElim) return (aLast?.rankAfter ?? 999) - (bLast?.rankAfter ?? 999)
    const aElimSeed = a.cells.findIndex((c) => c.eliminated)
    const bElimSeed = b.cells.findIndex((c) => c.eliminated)
    return aElimSeed - bElimSeed
  })

  if (sorted.length === 0) return null

  const compact = sorted.length > 10
  const rowHeight = compact ? 36 : 48
  const fontSize = compact ? 12 : 14
  const nameColWidth = compact ? 120 : 148

  const activeRow = tooltip ? sorted[tooltip.rowIdx] : null
  const activeCell = activeRow?.cells[tooltip?.colIdx ?? -1] ?? null
  const activeSeed = tooltip !== null ? seeds[tooltip.colIdx] : null

  return (
    <div className="relative">
      <div style={{ overflowX: 'auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `${nameColWidth}px repeat(${seeds.length}, minmax(52px, 1fr))`,
            minWidth: `${nameColWidth + seeds.length * 52}px`,
          }}
        >
          {/* Header row */}
          <div
            style={{
              position: 'sticky',
              left: 0,
              backgroundColor: '#18181b',
              boxShadow: '2px 0 8px rgba(0,0,0,0.5)',
              zIndex: 2,
              height: 28,
              borderBottom: '1px solid #27272a',
            }}
          />
          {seeds.map((s) => (
            <div
              key={s}
              style={{
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                color: '#71717a',
                borderBottom: '1px solid #27272a',
              }}
            >
              S{s}
            </div>
          ))}

          {/* Data rows */}
          {sorted.map((row, rowIdx) => [
            <div
              key={`name-${row.uuid}`}
              style={{
                position: 'sticky',
                left: 0,
                backgroundColor: '#18181b',
                zIndex: 1,
                height: rowHeight,
                display: 'flex',
                alignItems: 'center',
                paddingLeft: 8,
                paddingRight: 6,
                borderBottom: '1px solid #27272a',
                gap: 7,
              }}
            >
              <PlayerAvatar nickname={row.nickname} size="sm" />
              <span
                className="font-display"
                style={{
                  fontSize: compact ? 13 : 14,
                  color: '#a1a1aa',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {row.nickname}
              </span>
            </div>,
            ...row.cells.map((cell, colIdx) => (
              <div
                key={`${row.uuid}-${seeds[colIdx]}`}
                style={{
                  height: rowHeight,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderBottom: '1px solid #18181b',
                  cursor: 'default',
                  backgroundColor: cellBg(cell),
                }}
                onMouseEnter={(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setTooltip({ rowIdx, colIdx, ...tooltipPos(rect) })
                }}
                onMouseLeave={() => setTooltip(null)}
              >
                <span style={{ fontSize, color: placeColor(cell), fontWeight: 500 }}>
                  {placeLabel(cell)}
                </span>
              </div>
            )),
          ])}
        </div>
      </div>

      {tooltip !== null && activeCell !== null && activeSeed !== null && activeRow !== null && createPortal(
        <div
          style={{
            ...TOOLTIP_STYLE,
            position: 'fixed',
            left: tooltip.left,
            top: tooltip.top,
            transform: tooltip.transform,
            zIndex: 50,
          }}
        >
          <p style={{ color: '#a1a1aa', marginBottom: 6, fontWeight: 500 }}>
            Seed {activeSeed} — {activeRow.nickname}
          </p>
          {activeCell.eliminated ? (
            <p style={{ color: '#3f3f46' }}>Eliminated</p>
          ) : activeCell.place === null ? (
            <p style={{ color: '#52525b' }}>DNF</p>
          ) : (
            <>
              <p style={{ color: '#e4e4e7' }}>Place: {ordinal(activeCell.place)}</p>
              {activeCell.score !== null && (
                <p style={{ color: '#e4e4e7' }}>Score: +{activeCell.score} pts</p>
              )}
              {activeCell.rankAfter !== null && (
                <p style={{ color: '#e4e4e7' }}>
                  Rank: #{activeCell.rankAfter}
                  {activeCell.rankDelta !== null && activeCell.rankDelta !== 0 && (
                    <span
                      style={{
                        marginLeft: 4,
                        color: activeCell.rankDelta > 0 ? '#4ade80' : '#f87171',
                      }}
                    >
                      {activeCell.rankDelta > 0 ? '▲' : '▼'}
                      {Math.abs(activeCell.rankDelta)}
                    </span>
                  )}
                </p>
              )}
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
