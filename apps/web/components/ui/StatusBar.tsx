import type { Status } from './StatusBadge'

const barColor: Record<Status, string> = {
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

export function StatusBar({ statuses, total }: Props) {
  return (
    <div className="flex h-1.5 lg:h-2.5 w-28 lg:w-48 rounded-full overflow-hidden gap-px bg-zinc-800">
      {statuses.map(({ status, count }) => (
        <div
          key={status}
          style={{ width: `${(count / total) * 100}%`, backgroundColor: barColor[status] }}
        />
      ))}
    </div>
  )
}
