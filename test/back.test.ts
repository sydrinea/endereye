import fs from 'node:fs'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  computeHistoricalData,
  calculatePoints,
  createEventData,
  EventData,
} from '../src/core/context'
import type { EventKind } from '../src/api/types.ts'
import { dataTable, delta, pct, rocAuc } from './utils'
import process from 'node:process'

const SEASONS = [7, 8, 9, 10]
const KINDS: EventKind[] = ['lcq', 'mss']
const CACHE_DIR = path.join(process.cwd(), 'archive', 'events')
const ELITE_THRESHOLD = 1900

// ── Accumulators ──────────────────────────────────────────────────────────────
let totalPredictions = 0
let brierScoreSum = 0
let clinchViolations = 0
let safeViolations = 0
let pointsDiscrepancies = 0
let totalClinchSlack = 0
let clinchSlackMeasurements = 0
let seed0WinBrierSum = 0
let seed0TotalPredictions = 0

const stepBuckets = Array.from({ length: 10 }, () => ({ count: 0, sum: 0, actual: 0 }))
const seedBrierData = Array.from({ length: 10 }, () => ({ sum: 0, count: 0 }))
const seed0WinBuckets = Array.from({ length: 10 }, () => ({ count: 0, sum: 0, actual: 0 }))
const seed0RocPairs: {
  name: string
  event: string
  season: number
  prob: number
  actual: number
  elo: number
}[] = []
const bootstrapPairs: { custom: number; baseline: number; actual: number }[] = []
const seed0PlayerTracker: Array<
  Array<{ name: string; season: number; kind: EventKind; prob: number; won: boolean }>
> = Array.from({ length: 10 }, () => [])

// ── Cache helpers ─────────────────────────────────────────────────────────────
function cachePath(kind: EventKind, season: number): string {
  return path.join(CACHE_DIR, `${kind}_s${season}.json`)
}

async function loadCached(kind: EventKind, season: number): Promise<EventData> {
  const file = cachePath(kind, season)
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8')) as EventData

  // fetch and cache for future runs
  const data = await createEventData(kind, season)
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data))
  return data
}

// ── Load all events ──────────────────────────────────────────────────────
const loadEvents = async () => {
  const events: { kind: EventKind; season: number; data: EventData }[] = []
  for (const kind of KINDS) {
    for (const season of SEASONS) {
      events.push({ kind, season, data: await loadCached(kind, season) })
    }
  }
  return events
}

// ── Suite ─────────────────────────────────────────────────────────────────────
describe('LCQ/MSS Backtest', async () => {
  for (const { kind, season, data } of await loadEvents()) {
    describe(`${kind.toUpperCase()} S${season}`, () => {
      const finalState = computeHistoricalData(data, 10)
      const finalTruthMap = new Map(finalState.brackets.map((b) => [b.uuid, b]))

      for (let s = 0; s < 10; s++) {
        it(`Seed ${s} → ${s + 1}`, () => {
          const state = computeHistoricalData(data, s)
          const nextCutSeed = [3, 5, 7, 8, 9, 10].find((c) => c > s) ?? 10
          const truthAtCut = computeHistoricalData(data, nextCutSeed)
          const truthMap = new Map(truthAtCut.brackets.map((b) => [b.uuid, b]))
          const aliveTruth = truthAtCut.brackets
            .filter((b) => !b.eliminated)
            .sort((a, b) => b.point - a.point)
          const actualCutThreshold = aliveTruth[aliveTruth.length - 1]?.point ?? 0

          for (const [uuid, p] of Object.entries(state.playerOdds)) {
            const truth = truthMap.get(uuid)
            if (!truth) continue

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
                name: player?.nickname ?? uuid,
                event: kind.toUpperCase(),
                season,
                prob: p.winProbability,
                actual: actuallyWon,
                elo,
              })
              bootstrapPairs.push({ custom: p.winProbability, baseline: elo, actual: actuallyWon })
              seed0PlayerTracker[bucket].push({
                name: player?.nickname ?? uuid,
                season,
                kind,
                prob: p.winProbability,
                won: actuallyWon === 1,
              })
            }

            // ── Point calculation audit ──
            if (s === 9) {
              const raw = data.brackets.find((b) => b.uuid === uuid)!
              if (calculatePoints(raw, 10) !== raw.point) pointsDiscrepancies++
            }

            // ── Clinch audit ──
            if (p.clinchScore !== null && typeof p.clinchPlace === 'number') {
              const completion = data.brackets.find((b) => b.uuid === uuid)?.completions[s]
              if (completion && completion.place <= p.clinchPlace && truth.eliminated)
                clinchViolations++
              if (p.clinchScore > 0) {
                const playerAtS = state.brackets.find((b) => b.uuid === uuid)!
                totalClinchSlack +=
                  p.clinchScore - Math.max(0, actualCutThreshold - playerAtS.point)
                clinchSlackMeasurements++
              }
            }

            // ── Safe audit ──
            if ((p.status === 'safe' || p.status === 'qualified') && truth.eliminated) {
              safeViolations++
              expect(truth.eliminated, `safe violation: ${uuid} eliminated while marked safe`).toBe(
                false,
              )
            }

            // ── Survival Brier ──
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
        })
      }
    })
  }

  afterAll(() => {
    // ── Deterministic audit ──
    console.log(
      '\n' +
        dataTable(
          ['Check', 'Result', 'Status'],
          [
            ['Clinch Violations', clinchViolations, clinchViolations === 0 ? 'PASSED' : 'FAILED'],
            ['Safe Violations', safeViolations, safeViolations === 0 ? 'PASSED' : 'FAILED'],
            [
              'Point Discrepancies',
              pointsDiscrepancies,
              pointsDiscrepancies === 0 ? 'CLEAN' : 'ERROR',
            ],
            [
              'Avg Clinch Slack',
              `${clinchSlackMeasurements > 0 ? (totalClinchSlack / clinchSlackMeasurements).toFixed(2) : 0} pts`,
              '',
            ],
          ],
        ),
    )

    // ── AUC + bootstrap ──
    const customAuc = rocAuc(seed0RocPairs)
    const baselineAuc = rocAuc(bootstrapPairs.map((p) => ({ prob: p.baseline, actual: p.actual })))

    const diffs: number[] = []
    let baselineBetter = 0
    for (let i = 0; i < 1000; i++) {
      const sample = Array.from(
        { length: bootstrapPairs.length },
        () => bootstrapPairs[Math.floor(Math.random() * bootstrapPairs.length)],
      )
      const d =
        rocAuc(sample.map((r) => ({ prob: r.custom, actual: r.actual }))) -
        rocAuc(sample.map((r) => ({ prob: r.baseline, actual: r.actual })))
      diffs.push(d)
      if (d <= 0) baselineBetter++
    }
    diffs.sort((a, b) => a - b)

    console.log(
      '\n' +
        dataTable(
          ['Metric', 'Value'],
          [
            ['Custom AUC', customAuc.toFixed(4)],
            ['Baseline AUC', baselineAuc.toFixed(4)],
            ['Lift', delta(customAuc - baselineAuc)],
            ['Seed 0 Win Brier', (seed0WinBrierSum / seed0TotalPredictions).toFixed(4)],
            ['p-value', (baselineBetter / 1000).toFixed(4)],
            ['95% CI Lift', `[${diffs[25].toFixed(4)}, ${diffs[975].toFixed(4)}]`],
          ],
        ),
    )

    // ── Calibration table ──
    console.log(
      '\n' +
        dataTable(
          ['Range', 'Expected', 'Actual', 'Diff', 'Sample'],
          stepBuckets.map((b, i) => [
            `${i * 10}-${(i + 1) * 10}%`,
            pct(b.sum / b.count),
            pct(b.actual / b.count),
            delta(b.actual / b.count - b.sum / b.count),
            b.count,
          ]),
        ),
    )

    // ── Brier per seed ──
    console.log(
      '\n' +
        dataTable(
          ['Seed', 'Brier Score', 'Sample'],
          seedBrierData.map((d, i) => [
            `${i} → ${i + 1}`,
            d.count > 0 ? (d.sum / d.count).toFixed(4) : 'N/A',
            d.count,
          ]),
        ),
    )
    console.log(`Overall Survival Brier: ${(brierScoreSum / totalPredictions).toFixed(4)}`)

    // ── Per-season expert analysis ──
    for (const s of SEASONS) {
      const seasonPairs = seed0RocPairs.filter((p) => p.season === s)
      console.log(
        '\n' +
          dataTable(
            ['Event', 'Custom AUC', 'Baseline AUC', 'Lift', 'Sample'],
            KINDS.map((kind) => {
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

    // ── Hard assertions ──
    expect(customAuc, 'AUC must exceed 0.88').toBeGreaterThan(0.88)
    expect(clinchViolations, 'No clinch violations').toBe(0)
    expect(safeViolations, 'No safe violations').toBe(0)
  })
})
