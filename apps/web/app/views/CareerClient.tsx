'use client'

import { useEffect, useState } from 'react'
import { Surface } from '@/components/layout'
import type { CareerContext } from '@/lib/career-data'
import type { CareerEventSlice, WorkerMessage } from './career.worker'
import { SurvivalOddsChart } from './charts/SurvivalOddsChart'
import { ClinchSlackTrajectoryChart } from './charts/ClinchSlackTrajectoryChart'
import { CareerResultsGrid } from './charts/CareerResultsGrid'
import type { CareerResultRow } from './charts/CareerResultsGrid'
import { Spinner } from './Spinner'

const ALL_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const CUT_SEEDS = [3, 5, 7, 8, 9, 10]

export function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b) / values.length
}

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

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-lg font-mono font-medium text-zinc-200">{value}</span>
    </div>
  )
}

interface Progress {
  completed: number
  total: number
  label: string
}

export function CareerClient({ career }: { career: CareerContext }) {
  const [slices, setSlices] = useState<CareerEventSlice[] | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)

  useEffect(() => {
    window.scrollTo(0, 0)
    const worker = new Worker(new URL('./career.worker.ts', import.meta.url))
    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      if (e.data.type === 'progress') {
        setProgress(e.data)
      } else {
        setSlices(e.data.slices)
        worker.terminate()
      }
    }
    worker.postMessage({ uuid: career.uuid, events: career.events })
    return () => worker.terminate()
  }, [career])

  if (!slices) {
    return (
      <Surface width="xl">
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3 text-zinc-500">
            <Spinner size={32} color="neutral" />
            {progress ? (
              <>
                <span className="text-sm">{progress.label}</span>
                <div className="flex gap-1">
                  {Array.from({ length: progress.total }, (_, i) => (
                    <div
                      key={i}
                      className="h-1 w-6 rounded-full transition-colors duration-300"
                      style={{
                        backgroundColor:
                          i < progress.completed
                            ? (career.events[i]?.color ?? '#71717a')
                            : '#3f3f46',
                      }}
                    />
                  ))}
                </div>
              </>
            ) : (
              <span className="text-sm">Preparing…</span>
            )}
          </div>
        </div>
      </Surface>
    )
  }

  const qualified = slices.filter((s) => s.qualified).length
  const rankedSlices = slices.filter((s) => s.finalRank !== null)
  const avgRank =
    rankedSlices.length > 0
      ? Math.round(
          rankedSlices.reduce((sum, s) => sum + (s.finalRank ?? 0), 0) / rankedSlices.length,
        )
      : null
  const allDnfDrops = slices.flatMap((s) => s.dnfSeeds.map((d) => d.survivalDrop))
  const meanDnf = mean(allDnfDrops)

  const survivalSeasons = slices.map((s) => ({ nickname: s.label, color: s.color }))
  const survivalData = ALL_SEEDS.map((seed) => {
    const point: Record<string, number> = { seed }
    for (const s of slices) {
      const snap = s.snapshots.find((sn) => sn.seed === seed)
      if (snap !== undefined) point[s.label] = snap.survivalPct
    }
    return point
  })

  const slackSeasons = slices.map((s) => ({ nickname: s.label, color: s.color }))
  const slackData = CUT_SEEDS.map((seed) => {
    const point: Record<string, number | string> = { seed }
    for (const s of slices) {
      const snap = s.snapshots.find((sn) => sn.seed === seed)
      if (snap?.clinchSlack != null) point[s.label] = snap.clinchSlack
    }
    return point
  })

  const careerRows: CareerResultRow[] = slices.map((s) => ({
    label: s.label,
    color: s.color,
    cells: s.seedResults,
  }))

  return (
    <Surface width="xl">
      <div className="flex flex-col gap-8 pb-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatChip label="Events" value={String(slices.length)} />
          <StatChip label="Qualified" value={`${qualified} / ${slices.length}`} />
          <StatChip label="Avg Final Rank" value={avgRank !== null ? `#${avgRank}` : '—'} />
          <StatChip
            label="Mean DNF Drop"
            value={meanDnf !== null ? `−${meanDnf.toFixed(2)}%` : '—'}
          />
        </div>

        <Section
          title="Survival Odds Trajectory"
          description="How this player's probability of surviving the next cut evolved across each of their seasons."
        >
          <SurvivalOddsChart
            data={survivalData}
            players={survivalSeasons}
            cutSeeds={CUT_SEEDS}
            entityLabel="seasons"
          />
        </Section>

        <Section
          title="Clinch Slack Trajectory"
          description="Margin above or below the score needed to clinch survival at each cut, across all seasons. Above zero means they had breathing room; below means they were relying on others."
        >
          <ClinchSlackTrajectoryChart
            data={slackData}
            players={slackSeasons}
            entityLabel="seasons"
          />
        </Section>

        <Section
          title="Seed-by-Seed Results"
          description="Placement each season per seed. Green = top 5, yellow = mid-pack, red = bottom half. / means eliminated."
        >
          <CareerResultsGrid rows={careerRows} seeds={ALL_SEEDS} />
        </Section>
      </div>
    </Surface>
  )
}
