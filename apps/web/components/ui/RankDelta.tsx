import { ChevronDown, ChevronUp } from 'lucide-react'

interface Props {
  delta: number | null
}

export function RankDelta({ delta }: Props) {
  if (!delta) return <span className="text-zinc-600 font-mono text-xs">—</span>
  const up = delta > 0
  const Icon = up ? ChevronUp : ChevronDown
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-mono text-xs font-medium ${up ? 'text-safe' : 'text-must-clutch'}`}
    >
      <Icon size={12} strokeWidth={2.5} />
      {Math.abs(delta)}
    </span>
  )
}
