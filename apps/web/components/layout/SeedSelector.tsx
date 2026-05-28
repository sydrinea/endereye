'use client'

import { useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Dropdown } from '@/components/ui'

interface Props {
  seeds: number[]
  currentSeed: number
  basePath: string
}

export function SeedSelector({ seeds, currentSeed, basePath }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const sortedSeeds = [...seeds].sort((a, b) => a - b)
  const latestSeed = sortedSeeds[sortedSeeds.length - 1]

  // Extract tab suffix (/analytics or /players) from current path, ignoring player detail pages
  const seedSegmentMatch = pathname.match(/\/seed\/\d+(\/(?:analytics|players))?/)
  const tabSuffix = seedSegmentMatch?.[1] ?? ''
  const options = [
    ...sortedSeeds
      .slice()
      .reverse()
      .map((s) => ({ value: String(s), label: `After Seed ${s}` })),
    { value: '0', label: 'Initial Rankings' },
  ]

  return (
    <div className="relative flex items-center gap-2">
      <Dropdown
        options={options}
        value={String(currentSeed)}
        onChange={(v) =>
          startTransition(() => {
            const isLatest = Number(v) === latestSeed
            if (isLatest && tabSuffix === '') {
              router.push(basePath)
            } else {
              const targetSeed = isLatest ? latestSeed : Number(v)
              router.push(`${basePath}/seed/${targetSeed}${tabSuffix}`)
            }
          })
        }
      />
      {isPending && (
        <svg
          className="animate-spin shrink-0"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
        >
          <circle
            cx="8"
            cy="8"
            r="6"
            stroke="var(--color-accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="28"
            strokeDashoffset="21"
            opacity="0.9"
          />
        </svg>
      )}
    </div>
  )
}
