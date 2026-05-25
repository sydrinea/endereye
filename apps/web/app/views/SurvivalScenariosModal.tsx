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

function isThreatMode(view: PlayerView): boolean {
  return view.status === 'safe' || view.status === 'qualified' || view.survivalProbability >= 0.75
}

function ScenarioRow({
  scenario,
  nicknameOf,
  naturalProbability,
  threatMode,
}: {
  scenario: SurvivalScenario
  nicknameOf: (uuid: string) => string
  naturalProbability: number
  threatMode: boolean
}) {
  const isDirectThreat = scenario.constraints.some((c) => c.maxPlace !== undefined)
  let pct: number
  let freqPct: number

  if (threatMode && !isDirectThreat) {
    // Old-style DNF scenarios: constraints use minPlace (opponent places badly),
    // so we display the complement (when they place well instead)
    const complementFreq = 1 - scenario.frequency
    const complementP =
      scenario.complementSurvivalProbability !== undefined
        ? scenario.complementSurvivalProbability
        : complementFreq > 0.01
          ? Math.max(
              0,
              Math.min(
                1,
                (naturalProbability - scenario.survivalProbability * scenario.frequency) /
                  complementFreq,
              ),
            )
          : 0
    pct = Math.round(complementP * 100)
    freqPct = Math.round(complementFreq * 100)
  } else {
    pct = Math.round(scenario.survivalProbability * 100)
    freqPct = Math.round(scenario.frequency * 100)
  }

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
            ) : threatMode ? (
              <>
                {' finishes '}
                <span className="text-zinc-400">{ordinal(c.minPlace - 1)} or better</span>
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
      <div className="flex flex-col items-end shrink-0 gap-0.5">
        <span className={`font-mono tabular-nums font-semibold ${survivalColor(pct / 100)}`}>
          {pct}%
        </span>
        <span className="text-xs text-zinc-500">{freqPct}% of seeds</span>
      </div>
    </div>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-5 py-2 border-t border-b border-zinc-800 bg-zinc-950/40">
      <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{label}</span>
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
  const naturalPct = Math.round(view.survivalProbability * 100)
  const showFailure = snapFailure.length > 0
  const threatView = isThreatMode(view)

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
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
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
            <span className="font-display font-medium text-zinc-300 text-sm">{view.nickname}</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        {/* Natural odds */}
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">Natural survival odds</span>
            <span className={`font-mono tabular-nums ${survivalColor(view.survivalProbability)}`}>
              {naturalPct}%
            </span>
          </div>
        </div>

        <div className="max-h-112 overflow-y-auto">
          {showFailure && <SectionHeader label={`If ${view.nickname} completes`} />}
          <div className="px-5 py-1">
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
                  naturalProbability={view.survivalProbability}
                  threatMode={threatView}
                />
              ))
            )}
          </div>

          {showFailure && (
            <>
              <SectionHeader label={`If ${view.nickname} DNF`} />
              <div className="px-5 py-1">
                {snapFailure.map((s, i) => (
                  <ScenarioRow
                    key={i}
                    scenario={s}
                    nicknameOf={nicknameOf}
                    naturalProbability={snapDnfP}
                    threatMode={threatView}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-zinc-800">
          <p className="text-xs text-zinc-600">
            {threatView
              ? 'Based on 20k simulated seeds · shows odds when opponents beat the shown placement'
              : 'Based on 20k simulated seeds · opponents must finish at or below shown placement'}
          </p>
        </div>
      </div>
    </div>
  )
}
