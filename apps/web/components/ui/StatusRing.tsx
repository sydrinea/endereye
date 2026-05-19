import type { Status } from './StatusBadge'

const SIZE = 60
const STROKE = 5
const R = SIZE / 2 - STROKE / 2 - 2
const CX = SIZE / 2
const CY = SIZE / 2
const CIRCUMFERENCE = 2 * Math.PI * R

const ringColor: Record<Status, string> = {
  qualified:     '#38bdf8',
  safe:          '#4ade80',
  'near-safe':   '#a3e635',
  'coin-flip':   '#facc15',
  'at-risk':     '#fb923c',
  'must-clutch': '#f87171',
  out:           '#52525b',
}

interface Segment {
  status: Status
  count: number
}

interface Props {
  statuses: Segment[]
  total: number
}

export function StatusRing({ statuses, total }: Props) {
  let cumulativeLen = 0

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      {/* Track */}
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#27272a" strokeWidth={STROKE} />
      {/* Segments */}
      {statuses.map(({ status, count }) => {
        const segLen = (count / total) * CIRCUMFERENCE
        const offset = -cumulativeLen
        cumulativeLen += segLen
        return (
          <circle
            key={status}
            cx={CX} cy={CY} r={R}
            fill="none"
            stroke={ringColor[status]}
            strokeWidth={STROKE}
            strokeDasharray={`${segLen} ${CIRCUMFERENCE}`}
            strokeDashoffset={offset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${CX} ${CY})`}
          />
        )
      })}
      {/* Center: total alive count */}
      <text
        x={CX} y={CY}
        textAnchor="middle" dominantBaseline="middle"
        fill="#a1a1aa" fontSize="16"
        fontFamily="var(--font-minecraft), sans-serif"
      >
        {total}
      </text>
    </svg>
  )
}
