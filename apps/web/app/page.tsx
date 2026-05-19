import { CutBanner, DashboardHeader, Surface } from '@/components/layout'
import {
  Table,
  TableHeader,
  TableHeaderCell,
} from '@/components/ui'
import { StandingsRow } from './StandingsRow'
import type { StandingsRowData } from './StandingsRow'

const aboveCut: StandingsRowData[] = [
  { rank: 1, delta: 3, nickname: 'Sydrinea', pts: 201, bonus: 0, status: 'qualified', survivalPct: 100 },
  { rank: 2, delta: null, nickname: 'BadGamer', pts: 148, bonus: 0, status: 'safe', survivalPct: 99 },
  { rank: 3, delta: 15, nickname: 'Aquacorde', pts: 123, bonus: 12, status: 'safe', survivalPct: 98 },
  { rank: 4, delta: -1, nickname: 'nhb_', pts: 122, bonus: 8, status: 'safe', survivalPct: 98 },
  { rank: 5, delta: null, nickname: 'HDMICables', pts: 102, bonus: 2, status: 'near-safe', survivalPct: 99, pill: { type: 'needs', rank: 9 } },
  { rank: 6, delta: 13, nickname: 'okshey', pts: 96, bonus: 11, status: 'near-safe', survivalPct: 87, pill: { type: 'needs', rank: 5 } },
  { rank: 7, delta: 10, nickname: 'MYKEYBOARD', pts: 87, bonus: 2, status: 'coin-flip', survivalPct: 70, pill: { type: 'needs', rank: 6 } },
  { rank: 8, delta: 1, nickname: 'vorbhfan2', pts: 84, bonus: 4, status: 'coin-flip', survivalPct: 59, pill: { type: 'needs', rank: 4 } },
]

const belowCut: StandingsRowData[] = [
  { rank: 9, delta: 5, nickname: 'Finne', pts: 78, bonus: 6, status: 'coin-flip', survivalPct: 59, pill: { type: 'needs', rank: 2 } },
  { rank: 10, delta: 6, nickname: 'retropog', pts: 75, bonus: 5, status: 'at-risk', survivalPct: 42, pill: { type: 'to-cut', deficit: 3 } },
  { rank: 11, delta: 19, nickname: 'woofdoggo_', pts: 73, bonus: 9, status: 'at-risk', survivalPct: 33, pill: { type: 'to-cut', deficit: 5 } },
  { rank: 12, delta: -4, nickname: 'Couriway', pts: 61, bonus: 3, status: 'must-clutch', survivalPct: 8, pill: { type: 'to-cut', deficit: 12 } },
]

const COLS = '4rem 1fr 8rem 14rem 10rem'

export default function Page() {
  return (
    <>
      <DashboardHeader
        event="S10 LCQ"
        afterSeed={7}
        seedsRemaining={3}
        alive={12}
        counts={{ qualified: 1, safe: 3, nearSafe: 2, coinFlip: 3, atRisk: 2, mustClutch: 1 }}
      />
      <Surface width="xl">
        <div className="flex flex-col gap-2">
          <Table cols={COLS}>
            <TableHeader>
              <TableHeaderCell>Rank</TableHeaderCell>
              <TableHeaderCell>Player</TableHeaderCell>
              <TableHeaderCell className="text-right">Pts</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell />
            </TableHeader>
            {aboveCut.map((row) => <StandingsRow key={row.rank} row={row} />)}
          </Table>

          <CutBanner label="Next Elimination" detail="Top 8 survive · after seed 8" />

          <Table cols={COLS}>
            {belowCut.map((row) => <StandingsRow key={row.rank} row={row} />)}
          </Table>
        </div>
      </Surface>
    </>
  )
}
