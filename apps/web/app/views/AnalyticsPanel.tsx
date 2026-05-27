'use client'

import { useEffect, useRef, useState } from 'react'
import type { EventContext } from '@endereye/core'
import type { SeedSnapshot, WorkerMessage } from './analytics.worker'
import { Spinner } from './Spinner'
import { SurvivalOddsChart } from './charts/SurvivalOddsChart'
import { ClinchSlackChart } from './charts/ClinchSlackChart'
import { SeedSwingChart } from './charts/SeedSwingChart'
import { DnfImpactChart } from './charts/DnfImpactChart'
import { ClinchSlackTrajectoryChart } from './charts/ClinchSlackTrajectoryChart'
import { SeedResultsGrid } from './charts/SeedResultsGrid'
import {
  buildColorMap,
  getAlivePreset,
  getFinalCutPreset,
  getDominantPreset,
  getClutchPreset,
  buildSurvivalTrajectory,
  buildClinchSlackSeries,
  buildClinchSlackTrajectory,
  buildSeedSwings,
  buildDnfImpact,
  buildSeedResultsGrid,
} from '@/lib/analytics-stats'

type PresetKey = 'alive' | 'final-cut' | 'dominant' | 'clutch'

const PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: 'alive', label: 'Still Alive' },
  { key: 'final-cut', label: 'Reached Final Cut' },
  { key: 'dominant', label: 'Dominant' },
  { key: 'clutch', label: 'Clutch' },
]

function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-lg shadow-black/40">
      <div>
        <h3 className="text-sm font-display font-medium text-zinc-200">{title}</h3>
        <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
      </div>
      {children}
    </div>
  )
}

export function AnalyticsPanel({
  eventData,
  filteredNicknames,
  viewSeed,
}: {
  eventData: EventContext
  filteredNicknames: string[]
  viewSeed: number
}) {
  const isOnFinalSeed = viewSeed >= 10
  const [activePreset, setActivePreset] = useState<PresetKey | null>(() =>
    isOnFinalSeed ? null : 'alive',
  )

  const [result, setResult] = useState<{
    eventData: EventContext
    snapshots: SeedSnapshot[]
  } | null>(null)
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null)
  const snapshots = result?.eventData === eventData ? result.snapshots : null

  const eventKeyRef = useRef(eventData)
  useEffect(() => {
    if (eventKeyRef.current !== eventData) {
      eventKeyRef.current = eventData
      setActivePreset(eventData.currentRound > 10 ? null : 'alive')
    }
  }, [eventData])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProgress(null)
    const worker = new Worker(new URL('./analytics.worker.ts', import.meta.url))
    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data
      if (msg.type === 'progress') {
        setProgress({ completed: msg.completed, total: msg.total })
      } else {
        setResult({ eventData, snapshots: msg.snapshots })
        worker.terminate()
      }
    }
    worker.postMessage(eventData)
    return () => worker.terminate()
  }, [eventData])

  function togglePreset(key: PresetKey) {
    setActivePreset((prev) => (prev === key ? null : key))
  }

  if (!snapshots) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3 w-64">
          <span className="text-sm text-zinc-500">Running simulations…</span>
          {progress ? (
            <>
              <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-zinc-400 h-full rounded-full transition-all duration-150"
                  style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                />
              </div>
              <span className="text-xs text-zinc-600">
                {progress.completed} / {progress.total} seeds
              </span>
            </>
          ) : (
            <Spinner size={24} color="neutral" />
          )}
        </div>
      </div>
    )
  }

  const { players } = eventData
  const colorByUuid = buildColorMap(players)
  const displaySnapshots = snapshots.filter((s) => s.seed <= viewSeed)

  const aliveSet = getAlivePreset(displaySnapshots)
  const finalCutSet = getFinalCutPreset(snapshots, players)
  const dominantSet = getDominantPreset(snapshots, players)
  const clutchSet = getClutchPreset(snapshots, players)

  const PRESET_SETS: Record<PresetKey, Set<string>> = {
    alive: aliveSet,
    'final-cut': finalCutSet,
    dominant: dominantSet,
    clutch: clutchSet,
  }

  const presetCounts: Record<PresetKey, number> = {
    alive: aliveSet.size,
    'final-cut': finalCutSet.size,
    dominant: dominantSet.size,
    clutch: clutchSet.size,
  }

  const presetUuids: Set<string> | null = activePreset === null ? null : PRESET_SETS[activePreset]
  const nicknameFilter = filteredNicknames.length > 0 ? new Set(filteredNicknames) : null
  const visiblePlayers = players.filter((p) => {
    if (presetUuids && !presetUuids.has(p.uuid)) return false
    if (nicknameFilter && !nicknameFilter.has(p.nickname)) return false
    return true
  })

  const survival = buildSurvivalTrajectory(displaySnapshots, visiblePlayers, colorByUuid)
  const slackData = buildClinchSlackSeries(displaySnapshots, visiblePlayers)
  const slackTrajectoryData = buildClinchSlackTrajectory(displaySnapshots, visiblePlayers)
  const swingData = buildSeedSwings(displaySnapshots)
  const dnfImpact = buildDnfImpact(displaySnapshots, visiblePlayers)
  const seedResultRows = buildSeedResultsGrid(displaySnapshots, visiblePlayers, colorByUuid)
  const resultGridSeeds = displaySnapshots.map((s) => s.seed)

  const slackPlayers = visiblePlayers.map((p) => ({
    nickname: p.nickname,
    color: colorByUuid.get(p.uuid) ?? '#71717a',
  }))

  return (
    <div className="flex flex-col gap-10 pt-2 pb-8">
      <PresetBar activePreset={activePreset} onToggle={togglePreset} counts={presetCounts} />

      <Section
        title="Survival Odds Trajectory"
        description="How each player's probability of surviving the next cut evolved over the course of the event."
      >
        <SurvivalOddsChart
          data={survival.data}
          players={survival.players}
          cutSeeds={survival.cutSeeds}
        />
      </Section>

      <Section
        title="Clinch Slack"
        description="Points scored above (+) or below (−) the score the model said you needed to guarantee survival at each cut, looked at retrospectively. Positive means you had a buffer; negative means you fell short of the clinch threshold but may have survived anyway."
      >
        <ClinchSlackChart
          data={slackData}
          players={slackPlayers}
          visibleCount={visiblePlayers.length}
        />
      </Section>

      <Section
        title="Slack Trajectory"
        description="Tracks margin of error over time. Players consistently above the line clinched their survival at each cut; players below needed others to underperform."
      >
        <ClinchSlackTrajectoryChart data={slackTrajectoryData} players={slackPlayers} />
      </Section>

      <Section
        title="Seed Swings"
        description="Average rank change across all surviving players after each seed — a measure of how much the bracket reshuffled."
      >
        <SeedSwingChart data={swingData} />
      </Section>

      <Section
        title="DNF Impact"
        description="How much survival probability each player lost on seeds they didn't complete. Stacked bars show contributions from multiple DNF events."
      >
        <DnfImpactChart
          data={dnfImpact.data}
          seedKeys={dnfImpact.seedKeys}
          seedColors={dnfImpact.seedColors}
          seedLabels={dnfImpact.seedLabels}
        />
      </Section>

      <Section
        title="Seed-by-Seed Results"
        description="Raw placement and score each player earned per seed. Green = top 5, yellow = mid-pack, red = bottom half."
      >
        <SeedResultsGrid rows={seedResultRows} seeds={resultGridSeeds} />
      </Section>
    </div>
  )
}

function PresetBar({
  activePreset,
  onToggle,
  counts,
}: {
  activePreset: PresetKey | null
  onToggle: (key: PresetKey) => void
  counts: Record<PresetKey, number>
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-zinc-600 mr-1">Focus</span>
      {PRESETS.map((preset) => {
        const active = activePreset === preset.key
        const count = counts[preset.key]
        return (
          <button
            key={preset.key}
            onClick={() => onToggle(preset.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
              active ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {preset.label}
            <span
              className={active ? 'text-zinc-400' : 'text-zinc-700'}
              style={{ visibility: count !== undefined ? 'visible' : 'hidden', minWidth: '1ch' }}
            >
              {count ?? 0}
            </span>
          </button>
        )
      })}
    </div>
  )
}
