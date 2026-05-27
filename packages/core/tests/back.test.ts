import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { computeHistoricalData, calculatePoints } from '../lib/core/context'
import { computePlayerOdds } from '../lib/core/odds'
import type { EventContext, EventPlayer } from '../lib/context/event'
import type { EventKind } from '../lib/api/types'
import { dataTable, delta, pct, rocAuc } from '../lib/utils'
import process from 'node:process'

try {
  const envPath = path.join(process.cwd(), 'apps/web/.env.local')
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '')
    if (!(key in process.env)) process.env[key] = val
  }
} catch {
  /* rely on env vars already in shell */
}

const ELITE_THRESHOLD = 1900
const VARIANCE_BOUND = 0.025

// ── Types ──────────────────────────────────────────────────────────────────────

type BootstrapPair = { custom: number; baseline: number; actual: number }

interface WinProbEntry {
  season: number
  event: string
  uuid: string
  nickname: string
  elo: number
  winProb: number
  won: boolean
}

interface ClinchEntry {
  season: number
  event: string
  uuid: string
  nickname: string
  seed: number
  clinchScore: number
  clinchPlace: number | 'DNF'
  actualPlace: number | null
  survived: boolean
}

interface SafeEntry {
  season: number
  event: string
  uuid: string
  nickname: string
  seed: number
  status: string
  survived: boolean
}

interface BacktestResults {
  totalPredictions: number
  brierScoreSum: number
  missingTruthCount: number
  clinchViolations: number
  safeViolations: number
  pointsDiscrepancies: number
  totalClinchSlack: number
  clinchSlackMeasurements: number
  seed0WinBrierSum: number
  seed0TotalPredictions: number
  maxObservedShift: number
  stabilityViolations: number
  stepBuckets: Array<{ count: number; sum: number; actual: number }>
  seedBrierData: Array<{ sum: number; count: number }>
  seed0WinBuckets: Array<{ count: number; sum: number; actual: number }>
  seed0RocPairs: Array<{
    name: string
    event: string
    season: number
    prob: number
    actual: number
    elo: number
  }>
  bootstrapPairs: BootstrapPair[]
  seed0PlayerTracker: Array<
    Array<{ name: string; season: number; kind: EventKind; prob: number; won: boolean }>
  >
  winProbabilities: WinProbEntry[]
  clinchHistory: ClinchEntry[]
  safeAudit: SafeEntry[]
}

// ── R2 ────────────────────────────────────────────────────────────────────────

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})
const BUCKET = process.env.R2_BUCKET_NAME!

async function getR2Object<T>(key: string): Promise<T | null> {
  try {
    const res = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
    const text = await res.Body?.transformToString()
    if (!text) return null
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

interface R2EventConfig {
  slug: string
  kind: EventKind
  season: number
  prefix: string
  published?: boolean
}

interface StoredEvent {
  currentRound: number
  matches: number[]
  brackets: EventContext['brackets']
  qualifyCount?: number
}

async function loadEvents(): Promise<{ kind: EventKind; season: number; data: EventContext }[]> {
  const configs = await getR2Object<R2EventConfig[]>('config/events.json')
  if (!configs) throw new Error('Could not load config/events.json from R2')

  const published = configs.filter(
    (c) => c.published !== false && (c.kind === 'lcq' || c.kind === 'mss'),
  )

  const results = await Promise.all(
    published.map(async (config) => {
      const [eventData, players] = await Promise.all([
        getR2Object<StoredEvent>(`${config.prefix}.event.json`),
        getR2Object<EventPlayer[]>(`${config.prefix}.players.json`),
      ])
      if (!eventData || !players) {
        console.warn(`Skipping ${config.prefix}: missing R2 data`)
        return null
      }
      const data: EventContext = {
        kind: config.kind,
        season: config.season,
        players,
        brackets: eventData.brackets,
        matches: eventData.matches,
        currentRound: eventData.currentRound,
        qualifyCount: eventData.qualifyCount,
      }
      return { kind: config.kind, season: config.season, data }
    }),
  )

  return results
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => a.season - b.season || a.kind.localeCompare(b.kind))
}

// ── Core accumulation ─────────────────────────────────────────────────────────

function runBacktest(
  events: { kind: EventKind; season: number; data: EventContext }[],
): BacktestResults {
  let totalPredictions = 0
  let brierScoreSum = 0
  let missingTruthCount = 0
  let clinchViolations = 0
  let safeViolations = 0
  let pointsDiscrepancies = 0
  let totalClinchSlack = 0
  let clinchSlackMeasurements = 0
  let seed0WinBrierSum = 0
  let seed0TotalPredictions = 0
  let maxObservedShift = 0
  let stabilityViolations = 0

  const stepBuckets = Array.from({ length: 10 }, () => ({ count: 0, sum: 0, actual: 0 }))
  const seedBrierData = Array.from({ length: 10 }, () => ({ sum: 0, count: 0 }))
  const seed0WinBuckets = Array.from({ length: 10 }, () => ({ count: 0, sum: 0, actual: 0 }))
  const seed0RocPairs: BacktestResults['seed0RocPairs'] = []
  const bootstrapPairs: BootstrapPair[] = []
  const seed0PlayerTracker: BacktestResults['seed0PlayerTracker'] = Array.from(
    { length: 10 },
    () => [],
  )
  const winProbabilities: WinProbEntry[] = []
  const clinchHistory: ClinchEntry[] = []
  const safeAudit: SafeEntry[] = []

  for (const { kind, season, data } of events) {
    const nicknameMap = new Map(data.players.map((p) => [p.uuid, p.nickname]))
    const finalState = computeHistoricalData(data, 10)
    const finalTruthMap = new Map(finalState.brackets.map((b) => [b.uuid, b]))

    for (let s = 0; s < 10; s++) {
      const state = computeHistoricalData(data, s)
      const odds = computePlayerOdds(state)

      const oddsB = computePlayerOdds(state)
      for (const [uuid, p] of Object.entries(odds)) {
        if (oddsB[uuid]) {
          const shift = Math.abs(p.survivalProbability - oddsB[uuid].survivalProbability)
          if (shift > maxObservedShift) maxObservedShift = shift
          if (shift > VARIANCE_BOUND) stabilityViolations++
        }
      }

      const nextCutSeed = [3, 5, 7, 8, 9, 10].find((c) => c > s) ?? 10
      const truthAtCut = computeHistoricalData(data, nextCutSeed)
      const truthMap = new Map(truthAtCut.brackets.map((b) => [b.uuid, b]))
      const aliveTruth = truthAtCut.brackets
        .filter((b) => !b.eliminated)
        .sort((a, b) => b.point - a.point)
      const actualCutThreshold = aliveTruth[aliveTruth.length - 1]?.point ?? 0

      for (const [uuid, p] of Object.entries(odds)) {
        const truth = truthMap.get(uuid)
        if (!truth) {
          missingTruthCount++
          continue
        }

        const nickname = nicknameMap.get(uuid) ?? uuid

        // ── Seed 0 win prediction metrics ──
        if (s === 0) {
          const finalTruth = finalTruthMap.get(uuid)
          const actuallyWon = finalTruth && !finalTruth.eliminated ? 1 : 0
          const bucket = Math.min(Math.floor(p.winProbability * 10), 9)
          seed0WinBuckets[bucket].count++
          seed0WinBuckets[bucket].sum += p.winProbability
          seed0WinBuckets[bucket].actual += actuallyWon
          seed0WinBrierSum += (p.winProbability - actuallyWon) ** 2
          seed0TotalPredictions++

          const player = data.players.find((pl) => pl.uuid === uuid)
          const elo = player?.eloRate ?? 1700
          seed0RocPairs.push({
            name: nickname,
            event: kind.toUpperCase(),
            season,
            prob: p.winProbability,
            actual: actuallyWon,
            elo,
          })
          bootstrapPairs.push({ custom: p.winProbability, baseline: elo, actual: actuallyWon })
          seed0PlayerTracker[bucket].push({
            name: nickname,
            season,
            kind,
            prob: p.winProbability,
            won: actuallyWon === 1,
          })
          winProbabilities.push({
            season,
            event: kind.toUpperCase(),
            uuid,
            nickname,
            elo,
            winProb: p.winProbability,
            won: actuallyWon === 1,
          })
        }

        // ── Point calculation audit ──
        if (s === 9) {
          const raw = data.brackets.find((b) => b.uuid === uuid)!
          if (calculatePoints(raw, 10) !== raw.point) pointsDiscrepancies++
        }

        // ── Clinch audit ──
        if (p.clinchScore !== null) {
          const completion = data.brackets.find((b) => b.uuid === uuid)?.completions[s]
          const actualPlace = completion?.place ?? null
          const survived = !truth.eliminated

          clinchHistory.push({
            season,
            event: kind.toUpperCase(),
            uuid,
            nickname,
            seed: s,
            clinchScore: p.clinchScore,
            clinchPlace: p.clinchPlace as number | 'DNF',
            actualPlace,
            survived,
          })

          if (
            typeof p.clinchPlace === 'number' &&
            completion &&
            completion.place <= p.clinchPlace &&
            truth.eliminated
          ) {
            clinchViolations++
          }
          if (p.clinchScore > 0) {
            const playerAtS = state.brackets.find((b) => b.uuid === uuid)!
            totalClinchSlack += p.clinchScore - Math.max(0, actualCutThreshold - playerAtS.point)
            clinchSlackMeasurements++
          }
        }

        // ── Safe audit ──
        if (p.status === 'safe' || p.status === 'qualified') {
          safeAudit.push({
            season,
            event: kind.toUpperCase(),
            uuid,
            nickname,
            seed: s,
            status: p.status,
            survived: !truth.eliminated,
          })
          if (truth.eliminated) safeViolations++
        }

        // ── Survival Brier ──
        const playerAtCurrentSeed = state.brackets.find((b) => b.uuid === uuid)

        if (playerAtCurrentSeed?.eliminated) {
          continue
        }

        const actualSurvival = truth.eliminated ? 0 : 1
        const bucket = Math.min(Math.floor(p.survivalProbability * 10), 9)
        stepBuckets[bucket].count++
        stepBuckets[bucket].sum += p.survivalProbability
        stepBuckets[bucket].actual += actualSurvival
        brierScoreSum += (p.survivalProbability - actualSurvival) ** 2
        totalPredictions++
        seedBrierData[s].sum += (p.survivalProbability - actualSurvival) ** 2
        seedBrierData[s].count++
      }
    }
  }

  return {
    totalPredictions,
    brierScoreSum,
    missingTruthCount,
    clinchViolations,
    safeViolations,
    pointsDiscrepancies,
    totalClinchSlack,
    clinchSlackMeasurements,
    seed0WinBrierSum,
    seed0TotalPredictions,
    maxObservedShift,
    stabilityViolations,
    stepBuckets,
    seedBrierData,
    seed0WinBuckets,
    seed0RocPairs,
    bootstrapPairs,
    seed0PlayerTracker,
    winProbabilities,
    clinchHistory,
    safeAudit,
  }
}

// ── Test ──────────────────────────────────────────────────────────────────────

const OUTPUT_DIR = path.join(__dirname, '../../../apps/web/public/method')

describe('LCQ/MSS Backtest', () => {
  it('historical calibration', async () => {
    const events = await loadEvents()
    const r = runBacktest(events)

    // ── Data integrity — must pass before model metrics are meaningful ──
    expect(r.totalPredictions, 'No predictions — R2 data missing?').toBeGreaterThan(0)
    expect(r.seed0TotalPredictions, 'Seed-0 win tracking empty').toBeGreaterThan(0)
    expect(r.missingTruthCount, 'Players missing from truth map — UUID mismatch?').toBe(0)
    expect(r.pointsDiscrepancies, 'calculatePoints mismatch with raw bracket data').toBe(0)

    // ── Internal consistency — catches double-counts or missed players ──
    const seedBrierTotal = r.seedBrierData.reduce((s, d) => s + d.count, 0)
    expect(seedBrierTotal, 'perSeedBrier counts do not sum to totalPredictions').toBe(
      r.totalPredictions,
    )

    const bucketTotal = r.stepBuckets.reduce((s, b) => s + b.count, 0)
    expect(bucketTotal, 'calibrationBucket counts do not sum to totalPredictions').toBe(
      r.totalPredictions,
    )

    const seedBrierSumTotal = r.seedBrierData.reduce((s, d) => s + d.sum, 0)
    expect(
      Math.abs(seedBrierSumTotal - r.brierScoreSum),
      'perSeedBrier sums diverge from overall brierScoreSum',
    ).toBeLessThan(1e-9)

    // ── Model quality ──
    expect(
      r.brierScoreSum / r.totalPredictions,
      'Survival Brier worse than random baseline (0.25)',
    ).toBeLessThan(0.25)
    expect(r.clinchViolations, 'No clinch violations').toBe(0)
    expect(r.safeViolations, 'No safe violations').toBe(0)
    expect(r.stabilityViolations, `MC shift exceeded ${(VARIANCE_BOUND * 100).toFixed(2)}%`).toBe(0)

    // ── AUC + bootstrap ──
    const customAuc = rocAuc(r.seed0RocPairs)
    const baselineAuc = rocAuc(
      r.bootstrapPairs.map((p) => ({ prob: p.baseline, actual: p.actual })),
    )

    const diffs: number[] = []
    let baselineBetter = 0
    for (let i = 0; i < 1000; i++) {
      const sample = Array.from(
        { length: r.bootstrapPairs.length },
        () => r.bootstrapPairs[Math.floor(Math.random() * r.bootstrapPairs.length)],
      )
      const d =
        rocAuc(sample.map((p) => ({ prob: p.custom, actual: p.actual }))) -
        rocAuc(sample.map((p) => ({ prob: p.baseline, actual: p.actual })))
      diffs.push(d)
      if (d <= 0) baselineBetter++
    }
    diffs.sort((a, b) => a - b)

    expect(customAuc, 'AUC must exceed 0.88').toBeGreaterThan(0.88)

    // ── Logging ──
    console.log(
      '\n' +
        dataTable(
          ['Check', 'Result', 'Status'],
          [
            [
              'Clinch Violations',
              r.clinchViolations,
              r.clinchViolations === 0 ? 'PASSED' : 'FAILED',
            ],
            ['Safe Violations', r.safeViolations, r.safeViolations === 0 ? 'PASSED' : 'FAILED'],
            [
              'Point Discrepancies',
              r.pointsDiscrepancies,
              r.pointsDiscrepancies === 0 ? 'CLEAN' : 'ERROR',
            ],
            ['Missing Truth', r.missingTruthCount, r.missingTruthCount === 0 ? 'CLEAN' : 'ERROR'],
            [
              'Avg Clinch Slack',
              `${r.clinchSlackMeasurements > 0 ? (r.totalClinchSlack / r.clinchSlackMeasurements).toFixed(2) : 0} pts`,
              '',
            ],
            [
              'Max MC Shift',
              `${(r.maxObservedShift * 100).toFixed(2)}%`,
              r.maxObservedShift <= VARIANCE_BOUND ? 'PASSED' : 'WARN',
            ],
            [
              'MC Stability Vio.',
              r.stabilityViolations,
              r.stabilityViolations === 0 ? 'PASSED' : 'FAILED',
            ],
          ],
        ),
    )

    console.log(
      '\n' +
        dataTable(
          ['Metric', 'Value'],
          [
            ['Custom AUC', customAuc.toFixed(4)],
            ['Baseline AUC', baselineAuc.toFixed(4)],
            ['Lift', delta(customAuc - baselineAuc)],
            ['Seed 0 Win Brier', (r.seed0WinBrierSum / r.seed0TotalPredictions).toFixed(4)],
            ['p-value', (baselineBetter / 1000).toFixed(4)],
            ['95% CI Lift', `[${diffs[25].toFixed(4)}, ${diffs[975].toFixed(4)}]`],
          ],
        ),
    )

    console.log(
      '\n' +
        dataTable(
          ['Range', 'Expected', 'Actual', 'Diff', 'Sample'],
          r.stepBuckets.map((b, i) => [
            `${i * 10}-${(i + 1) * 10}%`,
            pct(b.sum / b.count),
            pct(b.actual / b.count),
            delta(b.actual / b.count - b.sum / b.count),
            b.count,
          ]),
        ),
    )

    console.log(
      '\n' +
        dataTable(
          ['Seed', 'Brier Score', 'Sample'],
          r.seedBrierData.map((d, i) => [
            `${i} → ${i + 1}`,
            d.count > 0 ? (d.sum / d.count).toFixed(4) : 'N/A',
            d.count,
          ]),
        ),
    )
    console.log(`Overall Survival Brier: ${(r.brierScoreSum / r.totalPredictions).toFixed(4)}`)

    const seasons = [...new Set(r.seed0RocPairs.map((p) => p.season))].sort((a, b) => a - b)
    const kinds = [...new Set(r.seed0RocPairs.map((p) => p.event.toLowerCase() as EventKind))]
    for (const s of seasons) {
      const seasonPairs = r.seed0RocPairs.filter((p) => p.season === s)
      console.log(
        '\n' +
          dataTable(
            ['Event', 'Custom AUC', 'Baseline AUC', 'Lift', 'Sample'],
            kinds.map((kind) => {
              const pairs = seasonPairs.filter((p) => p.event === kind.toUpperCase())
              const elite = pairs.filter((p) => p.elo > ELITE_THRESHOLD)
              const w = elite.filter((p) => p.actual === 1).length
              const l = elite.filter((p) => p.actual === 0).length
              if (w === 0 || l === 0)
                return [kind.toUpperCase(), 'N/A', 'N/A', 'N/A', `W:${w}/L:${l}`]
              const c = rocAuc(elite)
              const b = rocAuc(elite.map((p) => ({ prob: p.elo, actual: p.actual })))
              return [kind.toUpperCase(), c.toFixed(4), b.toFixed(4), delta(c - b), `W:${w}/L:${l}`]
            }),
          ),
      )
    }

    // ── Write JSON output ──
    const output = {
      generatedAt: new Date().toISOString(),
      metrics: {
        customAuc,
        baselineAuc,
        lift: customAuc - baselineAuc,
        pValue: baselineBetter / 1000,
        ci95: [diffs[25], diffs[975]],
        survivalBrier: r.brierScoreSum / r.totalPredictions,
        seed0WinBrier: r.seed0WinBrierSum / r.seed0TotalPredictions,
        totalPredictions: r.totalPredictions,
        avgClinchSlack:
          r.clinchSlackMeasurements > 0 ? r.totalClinchSlack / r.clinchSlackMeasurements : null,
        maxMcShift: r.maxObservedShift,
        calibrationBuckets: r.stepBuckets.map((b, i) => ({
          range: `${i * 10}-${(i + 1) * 10}%`,
          expected: b.count > 0 ? b.sum / b.count : null,
          actual: b.count > 0 ? b.actual / b.count : null,
          count: b.count,
        })),
        perSeedBrier: r.seedBrierData.map((d, i) => ({
          seed: i,
          brier: d.count > 0 ? d.sum / d.count : null,
          count: d.count,
        })),
      },
      winProbabilities: r.winProbabilities,
      clinchHistory: r.clinchHistory,
      safeAudit: r.safeAudit,
    }

    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
    fs.writeFileSync(path.join(OUTPUT_DIR, 'backtest.json'), JSON.stringify(output, null, 2))
  }, 0)
})
