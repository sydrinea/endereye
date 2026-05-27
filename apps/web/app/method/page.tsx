import { Footer } from '@/components/layout'
import { CalibrationChart, ScenarioPathChart, SeedBrierChart } from './AccuracyCharts'
import { Breadcrumbs } from '@/components/ui'
import { ArrowRight, Info } from 'lucide-react'
import { buildMeta } from '@/lib/og-metadata'
import backtest from '@/public/method/backtest.json'
import scenarios from '@/public/method/scenarios.json'
import { Mono } from '@/components/ui'
import Link from 'next/link'

export const metadata = buildMeta({
  title: 'Methodology | endereye',
  description: 'Learn how the site models survival odds and where its predictions come from',
  imagePath: '/api/og?type=default',
})

function marginOfErrorColor(moePercent: number): string {
  if (moePercent <= 0.01) return 'text-safe'
  if (moePercent <= 0.025) return 'text-near-safe'
  if (moePercent <= 0.05) return 'text-coin-flip'
  if (moePercent <= 0.1) return 'text-at-risk'

  return 'text-must-clutch'
}

function brierScoreColor(brierScore: number): string {
  if (brierScore < 0.05) return 'text-safe'
  if (brierScore < 0.1) return 'text-near-safe'
  if (brierScore < 0.15) return 'text-coin-flip'
  if (brierScore < 0.25) return 'text-at-risk'

  return 'text-must-clutch'
}

function Stat({
  label,
  value,
  variant = 'stderr',
  pct = false,
  tooltip,
}: {
  label: string
  value: number
  pct?: boolean
  variant: 'brier' | 'stderr'
  tooltip?: string
}) {
  const semanticColor = {
    brier: brierScoreColor,
    stderr: marginOfErrorColor,
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`${semanticColor[variant](value)} text-2xl font-bold font-mono`}>
        {pct ? `±${(value * 100).toFixed(1).toLocaleString()}` : value.toLocaleString()}
        {pct ? '%' : ''}
      </span>

      {/* Tooltip Wrapper */}
      <div className="relative flex items-center gap-1.5 group cursor-help">
        <span className="text-xs text-zinc-500 uppercase tracking-wide">{label}</span>

        {tooltip && (
          <>
            <Info className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300 transition-colors" />

            {/* Tooltip Body */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2.5 bg-zinc-800 text-zinc-300 text-xs text-left normal-case tracking-normal rounded-lg border border-zinc-700 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              {tooltip}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl text-zinc-200 border-b border-zinc-800 pb-2">{title}</h2>
      {children}
    </section>
  )
}

export default function MethodPage() {
  return (
    <>
      <main className="flex flex-col items-center px-6 py-12 gap-12">
        <div className="w-full max-w-2xl flex flex-col gap-10">
          {/* Header */}
          <div className="flex flex-col gap-3">
            <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Methodology' }]} />
            <h1 className="font-display text-3xl text-zinc-100">Methodology</h1>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Endereye uses Monte Carlo simulation to estimate each player&apos;s probability of
              surviving the next elimination round, and to surface the specific conditions observed
              most often that determine the outcome.
            </p>
            <p className="text-zinc-400 text-sm leading-relaxed">
              In a 60+ player lobby, simulating exact permutations becomes computationally
              impossible. The{' '}
              <strong className="text-zinc-300 font-medium">&apos;Safe&apos;</strong> and{' '}
              <strong className="text-zinc-300 font-medium">&apos;Needs #&apos;</strong> labels
              bypass player variance by using point calculations to surface guaranteed survival
              thresholds.
            </p>
          </div>

          {/* How it works */}
          <Section title="Summary">
            <p className="text-zinc-400 text-sm leading-relaxed">
              Each time a seed completes, the model runs {(20_000).toLocaleString()} simulated
              playthroughs of the remaining seeds. In each simulation, player performance is sampled
              from a model built on Elo rating and season ladder completion stats (average time,
              best time). The fraction of simulations in which a player survives the next
              elimination becomes their displayed survival probability.
            </p>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Survival and threat paths are derived from the same simulation batch. After all
              simulations run, the model identifies which opponent placement patterns most reliably
              separate &quot;survived&quot; outcomes from &quot;eliminated&quot; outcomes for each
              player, and surfaces the most frequent ones.
            </p>
          </Section>

          <Section title="Predictive Accuracy">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
              <Stat
                label="Overall Survival Brier"
                value={backtest.metrics.survivalBrier}
                variant="brier"
                tooltip="Measures predictive accuracy from 0.0 (perfect) to 1.0. Lower is better."
              />
              <Stat
                label="Pre-Event Win Brier"
                value={backtest.metrics.seed0WinBrier}
                variant="brier"
                tooltip="Accuracy of predicting the overall tournament winners before Seed 1 begins. Lower is better."
              />
              <div className="col-span-full pt-4 border-t border-zinc-800/50">
                <Mono className="text-zinc-600 text-xs">
                  n = {backtest.metrics.totalPredictions.toLocaleString()} historical predictions
                  analyzed
                </Mono>
              </div>
            </div>
          </Section>

          <Section title="Invariants">
            {/* Top-level stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
              <Stat
                label="Safe violations"
                value={
                  backtest.safeAudit.filter((a) => a.status === 'safe' && a.survived === false)
                    .length
                }
                variant="brier"
                tooltip="Times the model guaranteed a player was mathematically safe, but they were actually eliminated. Must remain 0."
              />

              <Stat
                label="Clinch violations"
                value={
                  backtest.clinchHistory.filter(
                    (a) =>
                      typeof a.clinchPlace === 'number' &&
                      a.actualPlace &&
                      a.actualPlace <= a.clinchPlace &&
                      !a.survived,
                  ).length
                }
                variant="brier"
                tooltip="Clinch place is the exact placement mathematically guaranteed to secure survival. A violation occurs if a player hits this safety threshold but is still eliminated. Must remain 0."
              />
            </div>
          </Section>

          {/* Calibration */}
          <Section title="Probability Calibration">
            <p className="text-zinc-400 text-sm leading-relaxed">
              A well-calibrated model should be right as often as it says it will be: when it
              assigns 70% survival odds, the player should survive roughly 70% of the time. The
              chart below shows predicted vs. actual survival rates across all historical LCQ and
              MSS events. Grey bars are the predicted rate; coloured bars are actual outcomes. Blue
              means well-calibrated; green means the model was conservative; red means it was
              overconfident.
            </p>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <CalibrationChart data={backtest.metrics.calibrationBuckets} />
            </div>
          </Section>

          {/* Scenario path accuracy */}
          <Section title="Scenario Path Accuracy">
            <p className="text-zinc-400 text-sm leading-relaxed">
              To validate survival and threat paths, I check historical events against the
              model&apos;s predictions. For each player the model expected to survive who was
              actually eliminated (threat cohort) or vice versa (survival cohort), I check whether
              the opponent the model flagged as pivotal actually placed as predicted.
            </p>
            <p className="text-zinc-400 text-sm leading-relaxed">
              The grey bar shows what hit rate you&apos;d get by picking that opponent randomly. The
              blue bar is the model&apos;s actual hit rate.
            </p>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <ScenarioPathChart data={scenarios} />
              <div className="flex gap-6 mt-3 px-1">
                <p className="text-xs text-zinc-600">
                  Threat paths: n={scenarios.threat.n} surprise eliminations across all events
                </p>
                <p className="text-xs text-zinc-600">
                  Survival paths: n={scenarios.survival.n} clutch survivals across all events
                </p>
              </div>
            </div>
          </Section>

          <Section title="Accuracy by Round (Brier Score)">
            <p className="text-zinc-400 text-sm leading-relaxed">
              As the tournament progresses, the model&apos;s accuracy changes because the pool gets
              smaller. This chart tracks the average Brier error as we approach the final seed.
            </p>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 pt-6">
              <SeedBrierChart data={backtest.metrics.perSeedBrier} />
            </div>
          </Section>

          {/* Limitations */}
          <Section title="Limitations">
            <ul className="text-zinc-400 text-sm leading-relaxed flex flex-col gap-2 list-disc list-inside">
              <li>
                The model does not account for player momentum, fatigue, or meta-game dynamics
                within an event.
              </li>
              <li>
                Elo and completion time metrics are based on the season ladder. A player having an
                unusually good or bad day are not reflected.
              </li>
              <li>
                Scenario path validation is based on a small number of historical events. Sample
                sizes will grow as more seasons are archived.
              </li>
              <li>
                DNF probability is estimated from historical completion rates and does not account
                for known circumstances like technical issues or scheduling conflicts.
              </li>
            </ul>
          </Section>

          <Section title="Raw Data">
            <RawDataCard
              label="Accuracy Backtest"
              href="/method/backtest.json"
              updated={backtest.generatedAt}
            />
            <RawDataCard
              label="Survival/Threat Scenarios Backtest"
              href="/method/scenarios.json"
              updated={scenarios.generatedAt}
            />
          </Section>
        </div>
      </main>
      <Footer />
    </>
  )
}
export function RawDataCard({
  label,
  href,
  updated,
}: {
  label: string
  href: string
  updated: string
}) {
  const formattedDate = new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(updated))

  return (
    <Link href={href} target="_blank" className="group w-full">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 transition-colors group-hover:border-zinc-700">
        <div className="flex flex-col min-w-0 gap-0.5">
          <span className="text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors truncate">
            {label}
          </span>
          <span className="text-xs text-zinc-500 truncate">Updated {formattedDate}</span>
        </div>

        <span className="inline-flex items-center gap-1 text-zinc-600 group-hover:text-zinc-400 transition-colors text-xs shrink-0">
          View <ArrowRight size={12} />
        </span>
      </div>
    </Link>
  )
}
