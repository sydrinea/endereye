export type Status =
  | 'qualified'
  | 'safe'
  | 'near-safe'
  | 'coin-flip'
  | 'at-risk'
  | 'must-clutch'
  | 'out'

const fg: Record<Status, string> = {
  qualified: 'text-qualified',
  safe: 'text-safe',
  'near-safe': 'text-near-safe',
  'coin-flip': 'text-coin-flip',
  'at-risk': 'text-at-risk',
  'must-clutch': 'text-must-clutch',
  out: 'text-zinc-500',
}

const labels: Record<Status, string> = {
  qualified: 'Qualified',
  safe: 'Safe',
  'near-safe': 'Near Safe',
  'coin-flip': 'Coin Flip',
  'at-risk': 'At Risk',
  'must-clutch': 'Must Clutch',
  out: 'Out',
}

interface Props {
  status: Status
}

export function StatusBadge({ status }: Props) {
  return <span className={`font-display text-base ${fg[status]}`}>{labels[status]}</span>
}
