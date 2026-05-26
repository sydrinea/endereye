'use client'

import { useEffect, useRef, useState } from 'react'
import { X, GitBranch, ShieldAlert } from 'lucide-react'
import type { SurvivalScenario, PlayerView } from '@endereye/core'

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

function survivalColor(p: number): string {
  if (p >= 0.75) return 'text-near-safe'
  if (p >= 0.45) return 'text-coin-flip'
  if (p >= 0.15) return 'text-at-risk'
  return 'text-must-clutch'
}

function scenarioColor(normalizedFreq: number, threatMode: boolean): string {
  const v = threatMode ? normalizedFreq : 1 - normalizedFreq
  if (v < 0.2) return 'text-safe'
  if (v < 0.4) return 'text-near-safe'
  if (v < 0.6) return 'text-coin-flip'
  if (v < 0.8) return 'text-at-risk'
  return 'text-must-clutch'
}

function isThreatMode(view: PlayerView): boolean {
  return view.status === 'safe' || view.status === 'qualified' || view.survivalProbability >= 0.75
}

function ScenarioRow({
  scenario,
  nicknameOf,
  threatMode,
  normalizedFreq,
}: {
  scenario: SurvivalScenario
  nicknameOf: (uuid: string) => string
  threatMode: boolean
  normalizedFreq: number
}) {
  const freqPct = Math.round(scenario.frequency * 100)

  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-zinc-800 last:border-0">
      <div className="flex flex-col gap-1 text-sm min-w-0">
        {scenario.constraints.map((c, i) => (
          <span key={c.uuid} className="text-zinc-300">
            {i > 0 && <span className="text-zinc-500 mr-1">+</span>}
            <span className="font-medium text-zinc-100">{nicknameOf(c.uuid)}</span>
            {c.maxPlace !== undefined ? (
              <>
                {' finishes '}
                <span className="text-zinc-400">{ordinal(c.maxPlace)} or better</span>
              </>
            ) : (
              <>
                {' finishes '}
                <span className="text-zinc-400">{ordinal(c.minPlace)} or worse</span>
              </>
            )}
          </span>
        ))}
      </div>
      <div className="shrink-0">
        <span
          className={`font-mono tabular-nums font-semibold ${scenarioColor(normalizedFreq, threatMode)}`}
        >
          {freqPct}%
        </span>
      </div>
    </div>
  )
}

function SectionHeader({
  nickname,
  condition,
  survivalProbability,
}: {
  nickname: string
  condition: string
  survivalProbability?: number
}) {
  return (
    <div className="mx-5 mt-5 mb-3 px-4 py-2.5 flex items-baseline justify-between rounded-lg bg-zinc-800/60 border border-zinc-700/50 shadow-md">
      <span className="text-sm font-medium text-zinc-300">
        If <span className="font-semibold text-zinc-100">{nickname}</span> {condition}
      </span>
      {survivalProbability !== undefined && (
        <span
          className={`text-xs font-mono tabular-nums font-medium ${survivalColor(survivalProbability)}`}
        >
          {Math.round(survivalProbability * 100)}% survival
        </span>
      )}
    </div>
  )
}

function TableHeader() {
  return (
    <div className="px-5 flex justify-between items-center border-b border-zinc-800 pb-1.5">
      <span className="text-xs text-zinc-600">Scenario</span>
      <span className="text-xs text-zinc-600">% of outcomes</span>
    </div>
  )
}

type Snapshot = {
  view: PlayerView
  scenarios: SurvivalScenario[]
  failureScenarios: SurvivalScenario[]
  dnfSurvivalProbability: number
}

export function SurvivalScenariosModal({
  targetView,
  scenarios,
  failureScenarios,
  dnfSurvivalProbability,
  nicknameOf,
  onClose,
}: {
  targetView: PlayerView | null
  scenarios: SurvivalScenario[] | null
  failureScenarios: SurvivalScenario[] | null
  dnfSurvivalProbability: number
  nicknameOf: (uuid: string) => string
  onClose: () => void
}) {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [visible, setVisible] = useState(false)
  const rafRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    if (timerRef.current !== null) clearTimeout(timerRef.current)

    if (targetView && scenarios !== null && failureScenarios !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSnap({ view: targetView, scenarios, failureScenarios, dnfSurvivalProbability })
      document.body.style.overflow = 'hidden'
      rafRef.current = requestAnimationFrame(() => setVisible(true))
    } else {
      setVisible(false)
      timerRef.current = setTimeout(() => {
        setSnap(null)
        document.body.style.overflow = ''
      }, 200)
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [targetView, scenarios, failureScenarios, dnfSurvivalProbability])

  if (!snap) return null

  const {
    view,
    scenarios: snapScenarios,
    failureScenarios: snapFailure,
    dnfSurvivalProbability: snapDnfP,
  } = snap
  const showFailure = snapFailure.length > 0
  const threatView = isThreatMode(view)
  const maxCompletionFreq = Math.max(...snapScenarios.map((s) => s.frequency), 0.001)
  const maxFailureFreq = Math.max(...snapFailure.map((s) => s.frequency), 0.001)

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
      onClick={onClose}
    >
      <div
        className={`relative w-full max-w-md bg-zinc-900 border border-zinc-950 rounded-2xl shadow-2xl overflow-hidden transition-all duration-200 ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800">
          {/* Top Row: Title & Close Button */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {threatView ? (
                <ShieldAlert size={15} className="text-zinc-400" />
              ) : (
                <GitBranch size={15} className="text-zinc-400" />
              )}
              <span className="font-display text-zinc-100 text-sm">
                {threatView ? 'Threat Paths' : 'Survival Paths'}
              </span>
              <span className="text-zinc-500 text-sm">·</span>
              <span className="font-display font-medium text-zinc-300 text-sm">
                {view.nickname}
              </span>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-md border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer shrink-0"
            >
              <X size={14} />
            </button>
          </div>

          {/* Bottom Row: The Info Blurb */}
          <p className="mt-3 text-xs text-zinc-500 leading-relaxed pr-2">
            Opponent placement patterns most frequently appearing in{' '}
            {threatView ? 'elimination' : 'survival'} outcomes across 20k simulated seeds, ordered
            by frequency.
          </p>
        </div>

        <div className="max-h-112 overflow-y-auto">
          {showFailure && (
            <SectionHeader
              nickname={view.nickname}
              condition="completes"
              survivalProbability={view.survivalProbability}
            />
          )}
          {!showFailure && <div className="pt-4" />}
          <TableHeader />
          <div className="px-5">
            {snapScenarios.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-6">
                {threatView ? 'No significant threats found.' : 'No viable survival paths found.'}
              </p>
            ) : (
              snapScenarios.map((s, i) => (
                <ScenarioRow
                  key={i}
                  scenario={s}
                  nicknameOf={nicknameOf}
                  threatMode={threatView}
                  normalizedFreq={s.frequency / maxCompletionFreq}
                />
              ))
            )}
          </div>

          {showFailure && (
            <>
              <SectionHeader
                nickname={view.nickname}
                condition="DNF"
                survivalProbability={snapDnfP}
              />
              <TableHeader />
              <div className="px-5">
                {snapFailure.map((s, i) => (
                  <ScenarioRow
                    key={i}
                    scenario={s}
                    nicknameOf={nicknameOf}
                    threatMode={threatView}
                    normalizedFreq={s.frequency / maxFailureFreq}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-zinc-800">
          <p className="text-xs text-zinc-600">
            Based on 20k simulated seeds · % of {threatView ? 'elimination' : 'survival'} outcomes
            where each pattern occurred
          </p>
        </div>
      </div>
    </div>
  )
}
