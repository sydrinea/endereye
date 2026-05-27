'use client'

import { useState } from 'react'
import { SurvivalOddsChart } from '@/app/views/charts/SurvivalOddsChart'
import { ClinchSlackTrajectoryChart } from '@/app/views/charts/ClinchSlackTrajectoryChart'
import { getDominantFinalists, getClutchFinalists, DEEP_RUNS_KEY } from '@/lib/finals-stats'
import type { FinalistsChartData, FinalistEntry } from '@/lib/finals-stats'

type PresetKey = 'dominant' | 'clutch'

const PRESETS: Array<{ key: PresetKey; label: string }> = [
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

function pillClass(active: boolean) {
  return `inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
    active ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
  }`
}

function filterData(
  data: Array<Record<string, number | string>>,
  visible: FinalistEntry[],
): Array<Record<string, number | string>> {
  const labels = new Set(visible.map((f) => f.seriesLabel))
  return data.map((row) => {
    const filtered: Record<string, number | string> = { seed: row['seed'] }
    for (const label of labels) {
      if (row[label] !== undefined) filtered[label] = row[label]
    }
    if (row[DEEP_RUNS_KEY] !== undefined) filtered[DEEP_RUNS_KEY] = row[DEEP_RUNS_KEY]
    return filtered
  })
}

export function FinalistsPanel({ data }: { data: FinalistsChartData }) {
  const { finalists, survivalData, slackData, cutSeeds, events } = data

  const [activePreset, setActivePreset] = useState<PresetKey | null>(null)
  const [activeEventSlugs, setActiveEventSlugs] = useState<Set<string>>(new Set())

  const dominantKeys = getDominantFinalists(finalists, survivalData)
  const clutchKeys = getClutchFinalists(finalists, survivalData)

  const presetCounts: Record<PresetKey, number> = {
    dominant: dominantKeys.size,
    clutch: clutchKeys.size,
  }

  function togglePreset(key: PresetKey) {
    setActivePreset((prev) => (prev === key ? null : key))
    setActiveEventSlugs(new Set())
  }

  function toggleEvent(slug: string) {
    setActiveEventSlugs((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
    setActivePreset(null)
  }

  const visibleFinalists =
    activeEventSlugs.size > 0
      ? finalists.filter((f) => activeEventSlugs.has(f.eventSlug))
      : activePreset === 'dominant'
        ? finalists.filter((f) => dominantKeys.has(f.key))
        : activePreset === 'clutch'
          ? finalists.filter((f) => clutchKeys.has(f.key))
          : finalists

  const players = visibleFinalists.map((f) => ({ nickname: f.seriesLabel, color: f.color }))
  const filteredSurvival = filterData(survivalData, visibleFinalists) as Array<
    Record<string, number>
  >
  const filteredSlack = filterData(slackData, visibleFinalists)

  return (
    <div className="flex flex-col gap-8">
      {/* Filter bar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-600 mr-1">Focus</span>
          <button
            onClick={() => {
              setActivePreset(null)
              setActiveEventSlugs(new Set())
            }}
            className={pillClass(activePreset === null && activeEventSlugs.size === 0)}
          >
            All
            <span
              className={
                activePreset === null && activeEventSlugs.size === 0
                  ? 'text-zinc-400'
                  : 'text-zinc-700'
              }
            >
              {finalists.length}
            </span>
          </button>
          {PRESETS.map((preset) => {
            const active = activePreset === preset.key && activeEventSlugs.size === 0
            return (
              <button
                key={preset.key}
                onClick={() => togglePreset(preset.key)}
                className={pillClass(active)}
              >
                {preset.label}
                <span className={active ? 'text-zinc-400' : 'text-zinc-700'}>
                  {presetCounts[preset.key]}
                </span>
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-600 mr-1">Event</span>
          {events.map((ev) => {
            const active = activeEventSlugs.has(ev.slug)
            return (
              <button
                key={ev.slug}
                onClick={() => toggleEvent(ev.slug)}
                className={pillClass(active)}
              >
                {ev.label}
              </button>
            )
          })}
        </div>
      </div>

      <Section
        title="Survival Odds Trajectory"
        description="How each finalist's probability of surviving the next cut evolved across the event. Lines represent individual finalist runs; bands show the distribution when many series are visible."
      >
        <SurvivalOddsChart
          data={filteredSurvival}
          players={players}
          cutSeeds={cutSeeds}
          entityLabel="players"
          overlays={[{ key: DEEP_RUNS_KEY, color: '#71717a' }]}
        />
      </Section>

      <Section
        title="Clinch Slack Trajectory"
        description="Margin above or below the score needed to clinch survival at each cut, across all seasons. Above zero means they had breathing room; below means they were relying on others."
      >
        <ClinchSlackTrajectoryChart
          data={filteredSlack}
          players={players}
          entityLabel="players"
          overlays={[{ key: DEEP_RUNS_KEY, color: '#71717a' }]}
        />
      </Section>
    </div>
  )
}
