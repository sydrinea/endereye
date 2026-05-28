'use client'

import { useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Dropdown } from '@/components/ui'

interface Props {
  seeds: number[]
  currentSeed: number
}

export function SeedSelector({ seeds, currentSeed }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const sortedSeeds = [...seeds].sort((a, b) => a - b)
  const options = [
    ...sortedSeeds
      .slice()
      .reverse()
      .map((s) => ({ value: String(s), label: `After Seed ${s}` })),
    { value: '0', label: 'Initial Rankings' },
  ]
  const latestSeed = sortedSeeds[sortedSeeds.length - 1]

  return (
    <div className="relative flex items-center gap-2">
      <Dropdown
        options={options}
        value={String(currentSeed)}
        onChange={(v) =>
          startTransition(() =>
            Number(v) === latestSeed ? router.push(pathname) : router.push(`?seed=${v}`),
          )
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
