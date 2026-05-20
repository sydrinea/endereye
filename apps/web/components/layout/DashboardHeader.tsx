import { StatusBar } from '@/components/ui'
import { SeedSelector } from './SeedSelector'
import type { Status } from '@/components/ui'

interface StatusCounts {
  qualified?: number
  safe?: number
  nearSafe?: number
  coinFlip?: number
  atRisk?: number
  mustClutch?: number
}

interface Props {
  event: string
  seeds: number[]
  currentSeed: number
  alive: number
  counts: StatusCounts
}

const statusKeys: Array<{ key: keyof StatusCounts; status: Status }> = [
  { key: 'qualified', status: 'qualified' },
  { key: 'safe', status: 'safe' },
  { key: 'nearSafe', status: 'near-safe' },
  { key: 'coinFlip', status: 'coin-flip' },
  { key: 'atRisk', status: 'at-risk' },
  { key: 'mustClutch', status: 'must-clutch' },
]

export function DashboardHeader({ event, seeds, currentSeed, alive, counts }: Props) {
  const segments = statusKeys
    .filter(({ key }) => (counts[key] ?? 0) > 0)
    .map(({ key, status }) => ({ status, count: counts[key]! }))

  return (
    <header className="w-full border-b border-zinc-800 px-4 lg:px-8 py-2 lg:py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 lg:gap-4 min-w-0">
          <div className="flex items-center gap-2 lg:gap-3 shrink-0">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 lg:px-3 lg:py-1 rounded-full bg-safe/10 border border-safe/30 text-safe text-xs lg:text-sm font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-safe animate-pulse" />
              Live
            </span>
            <span className="text-zinc-300 text-sm lg:text-xl font-serif font-semibold">
              {event}
            </span>
          </div>
          <SeedSelector seeds={seeds} currentSeed={currentSeed} />
        </div>

        <div className="flex shrink-0">
          <StatusBar statuses={segments} total={alive} />
        </div>
      </div>
    </header>
  )
}
