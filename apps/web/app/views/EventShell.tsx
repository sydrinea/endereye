'use client'

import Link from 'next/link'
import { createContext, useContext, useState, useEffect, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { RotateCw, Loader2 } from 'lucide-react'
import type { PlayerView, EventContext } from '@endereye/core'
import { DashboardHeader } from '@/components/layout'
import { Breadcrumbs, PlayerFilter } from '@/components/ui'
import { mapStatus } from '@/lib/dashboard-utils'

const ALL_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

interface EventShellValue {
  eventData: EventContext
  seed: number
  views: PlayerView[]
  filteredNicknames: string[]
  addFilter: (nick: string) => void
  removeFilter: (nick: string) => void
  allNicknames: string[]
  prefix: string
}

const EventShellCtx = createContext<EventShellValue | null>(null)

export function useEventShell(): EventShellValue {
  const ctx = useContext(EventShellCtx)
  if (!ctx) throw new Error('useEventShell must be used within EventShell')
  return ctx
}

const TABS = [
  {
    label: 'Standings',
    value: 'standings',
    href: (base: string, seed: number) => `${base}/seed/${seed}`,
  },
  {
    label: 'Analytics',
    value: 'analytics',
    href: (base: string, seed: number) => `${base}/seed/${seed}/analytics`,
  },
  {
    label: 'Players',
    value: 'players',
    href: (base: string, seed: number) => `${base}/seed/${seed}/players`,
  },
]

function TabNav({ basePath, seed }: { basePath: string; seed: number }) {
  const pathname = usePathname()
  const segments = pathname.split('/')
  const lastSegment = segments.at(-1)
  const isPlayerDetail =
    segments.at(-2) === 'players' && lastSegment !== 'players' && lastSegment !== undefined
  const activeTab = isPlayerDetail
    ? 'players'
    : lastSegment === 'analytics'
      ? 'analytics'
      : lastSegment === 'players'
        ? 'players'
        : 'standings'

  return (
    <div className="flex gap-1 p-1 rounded-lg bg-zinc-900 w-fit">
      {TABS.map((tab) => (
        <Link
          key={tab.value}
          href={tab.href(basePath, seed)}
          className={`px-4 py-1.5 rounded-md text-sm font-display transition-colors ${
            activeTab === tab.value
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}

function RefreshButton({ prefix, initialRound }: { prefix: string; initialRound: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [hasUpdate, setHasUpdate] = useState(false)

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`/api/events/version?prefix=${encodeURIComponent(prefix)}`)
        const { currentRound } = await res.json()
        if (currentRound !== null && currentRound !== initialRound) {
          await fetch(pathname)
          setHasUpdate(true)
        }
      } catch {}
    }

    const id = setInterval(check, 30_000)
    return () => clearInterval(id)
  }, [prefix, initialRound, pathname])

  return (
    <button
      onClick={() => {
        setHasUpdate(false)
        startTransition(() => router.refresh())
      }}
      disabled={isPending}
      aria-label="Refresh"
      className="relative p-1.5 rounded-md transition-colors text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 cursor-pointer"
    >
      {isPending ? <Loader2 size={16} className="animate-spin" /> : <RotateCw size={16} />}
      {hasUpdate && !isPending && (
        <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-safe" />
      )}
    </button>
  )
}

export function EventShell({
  eventData,
  eventLabel,
  live,
  basePath,
  prefix,
  seed,
  views,
  children,
}: {
  eventData: EventContext
  eventLabel: string
  live: boolean
  basePath: string
  prefix: string
  seed: number
  views: PlayerView[]
  children: React.ReactNode
}) {
  const filterKey = `endereye:filter:${eventLabel}`
  const [filteredNicknames, setFilteredNicknames] = useState<string[]>([])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(filterKey)
      if (stored) {
        const parsed = JSON.parse(stored) as string[]
        setTimeout(() => setFilteredNicknames(parsed), 0)
      }
    } catch {}
  }, [filterKey])

  useEffect(() => {
    try {
      if (filteredNicknames.length === 0) localStorage.removeItem(filterKey)
      else localStorage.setItem(filterKey, JSON.stringify(filteredNicknames))
    } catch {}
  }, [filteredNicknames, filterKey])

  const activeViews = views.filter((v) => v.status !== 'eliminated')
  const counts = activeViews.reduce(
    (acc, v) => {
      const s = mapStatus(v)
      if (s === 'qualified') acc.qualified = (acc.qualified ?? 0) + 1
      else if (s === 'safe') acc.safe = (acc.safe ?? 0) + 1
      else if (s === 'near-safe') acc.nearSafe = (acc.nearSafe ?? 0) + 1
      else if (s === 'coin-flip') acc.coinFlip = (acc.coinFlip ?? 0) + 1
      else if (s === 'at-risk') acc.atRisk = (acc.atRisk ?? 0) + 1
      else if (s === 'must-clutch') acc.mustClutch = (acc.mustClutch ?? 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  function addFilter(nick: string) {
    setFilteredNicknames((prev) => (prev.includes(nick) ? prev : [...prev, nick]))
  }
  function removeFilter(nick: string) {
    setFilteredNicknames((prev) => prev.filter((n) => n !== nick))
  }

  const value: EventShellValue = {
    eventData,
    seed,
    views,
    filteredNicknames,
    addFilter,
    removeFilter,
    allNicknames: views.map((v) => v.nickname),
    prefix,
  }

  return (
    <EventShellCtx.Provider value={value}>
      <div className="sticky top-0 z-20 bg-zinc-900">
        <div className="w-full px-4 lg:px-8 pt-4">
          <Breadcrumbs
            items={[
              { label: 'Home', href: '/' },
              { label: 'Events', href: '/archive' },
              { label: eventLabel },
            ]}
          />
        </div>
        <DashboardHeader
          event={eventLabel}
          seeds={ALL_SEEDS.slice(0, eventData.currentRound - 1)}
          currentSeed={seed}
          basePath={basePath}
          alive={activeViews.length}
          counts={counts}
          live={live}
        />
        <div className="max-w-7xl mx-auto px-4 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 mt-3">
            <TabNav basePath={basePath} seed={seed} />
            <RefreshButton prefix={prefix} initialRound={eventData.currentRound} />
          </div>
          <PlayerFilter
            players={views.map((v) => v.nickname)}
            selected={filteredNicknames}
            onAdd={addFilter}
            onRemove={removeFilter}
          />
          <div className="border-b border-zinc-800" />
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 pt-2 pb-6 text-zinc-400">
        <div className="flex flex-col gap-2">{children}</div>
        <p className="mt-4 text-xs text-zinc-600">
          Match data via{' '}
          <a
            href="https://api.mcsrranked.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-400 transition-colors"
          >
            api.mcsrranked.com
          </a>
        </p>
      </div>
    </EventShellCtx.Provider>
  )
}
