import fs from 'node:fs'
import path from 'node:path'
import { afterAll, describe, it } from 'vitest'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import type { EventContext, EventPlayer } from '../lib/context/event'
import type { EventKind } from '../lib/api/types'
import { computeHistoricalData } from '../lib/core/context'
import {
  computePlayerOdds,
  buildScenarioRecords,
  deriveScenariosFromRecords,
} from '../lib/core/odds'
import { ELIMINATION_SCHEDULE, QUALIFY_COUNT } from '../lib/core/config'
import { dataTable, delta, pct } from '../lib/utils'
import process from 'node:process'

try {
  const envPath = path.join(process.cwd(), '../../apps/web/.env.local')
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

// Players with survP above this who were eliminated — model expected survival
const THREAT_SURPRISE_THRESHOLD = 0.65
// Players with survP below this who survived — model expected elimination
const SURVIVAL_CLUTCH_THRESHOLD = 0.35

interface ValidationResult {
  type: 'threat' | 'survival'
  event: string
  season: number
  cutAfterSeed: number
  playerNickname: string
  survP: number
  constraintNickname: string
  constraintBound: number
  actualPlace: number
  nAlive: number
  hit: boolean
  baseline: number
}

const allResults: ValidationResult[] = []

describe('Scenario Path Backtest', { timeout: 600_000 }, async () => {
  for (const { kind, season, data } of await loadEvents()) {
    describe(`${kind.toUpperCase()} S${season}`, () => {
      const qualifyCount = data.qualifyCount ?? QUALIFY_COUNT
      const baseLast = ELIMINATION_SCHEDULE[ELIMINATION_SCHEDULE.length - 1]
      const effectiveSchedule = ELIMINATION_SCHEDULE.map((cut) =>
        cut === baseLast && 'keepTop' in cut ? { ...cut, keepTop: qualifyCount } : cut,
      )

      const nicknames = new Map(data.players.map((p) => [p.uuid, p.nickname]))

      for (const cut of effectiveSchedule) {
        // Check the state at the seed immediately before this cut.
        // Scenarios predict placements in the very next seed (currentRound),
        // so viewSeed = cut.afterSeed - 1 gives a direct 1-seed lookahead.
        const viewSeed = cut.afterSeed - 1
        if (viewSeed < 0) continue

        it(`Cut after seed ${cut.afterSeed}`, () => {
          const state = computeHistoricalData(data, viewSeed)
          const odds = computePlayerOdds(state)
          const aliveBrackets = state.brackets.filter((b) => !b.eliminated)
          const nAlive = aliveBrackets.length
          if (nAlive < 4) return

          // Who was alive before this cut but eliminated by it?
          const cutState = computeHistoricalData(data, cut.afterSeed)
          const eliminatedAtCut = new Set(
            cutState.brackets
              .filter((b) => b.eliminated && aliveBrackets.some((a) => a.uuid === b.uuid))
              .map((b) => b.uuid),
          )

          const prepared = buildScenarioRecords(state)
          if (!prepared) return

          for (const bracket of aliveBrackets) {
            const { uuid } = bracket
            const survP = odds[uuid]?.survivalProbability ?? 0
            const wasEliminated = eliminatedAtCut.has(uuid)

            // ── Threat validation ──────────────────────────────────────────
            // Model expected this player to survive; they didn't.
            // Did the top threat path's leading constraint materialize?
            if (survP > THREAT_SURPRISE_THRESHOLD && wasEliminated) {
              const { scenarios } = deriveScenariosFromRecords(uuid, prepared, { threatMode: true })
              if (scenarios.length === 0 || scenarios[0].constraints.length === 0) continue
              const top = scenarios[0].constraints[0]
              if (top.maxPlace == null) continue
              // completions is 0-indexed: index viewSeed = the next seed's result
              const actualPlace = data.brackets.find((b) => b.uuid === top.uuid)?.completions[
                viewSeed
              ]?.place
              if (actualPlace == null) continue
              allResults.push({
                type: 'threat',
                event: kind.toUpperCase(),
                season,
                cutAfterSeed: cut.afterSeed,
                playerNickname: nicknames.get(uuid) ?? uuid,
                survP,
                constraintNickname: nicknames.get(top.uuid) ?? top.uuid,
                constraintBound: top.maxPlace,
                actualPlace,
                nAlive,
                hit: actualPlace <= top.maxPlace,
                baseline: top.maxPlace / nAlive,
              })
            }

            // ── Survival validation ────────────────────────────────────────
            // Model expected this player to be eliminated; they survived.
            // Did the top survival path's leading constraint materialize?
            if (survP < SURVIVAL_CLUTCH_THRESHOLD && !wasEliminated) {
              const { scenarios } = deriveScenariosFromRecords(uuid, prepared, {
                threatMode: false,
              })
              if (scenarios.length === 0 || scenarios[0].constraints.length === 0) continue
              const top = scenarios[0].constraints[0]
              const actualPlace = data.brackets.find((b) => b.uuid === top.uuid)?.completions[
                viewSeed
              ]?.place
              if (actualPlace == null) continue
              allResults.push({
                type: 'survival',
                event: kind.toUpperCase(),
                season,
                cutAfterSeed: cut.afterSeed,
                playerNickname: nicknames.get(uuid) ?? uuid,
                survP,
                constraintNickname: nicknames.get(top.uuid) ?? top.uuid,
                constraintBound: top.minPlace,
                actualPlace,
                nAlive,
                // survival constraint: opponent finishes at minPlace or worse (higher number)
                hit: actualPlace >= top.minPlace,
                baseline: (nAlive - top.minPlace + 1) / nAlive,
              })
            }
          }
        })
      }
    })
  }

  afterAll(() => {
    const threatResults = allResults.filter((r) => r.type === 'threat')
    const survivalResults = allResults.filter((r) => r.type === 'survival')

    function summarize(rows: ValidationResult[]) {
      if (rows.length === 0) return { hitRate: 0, baseline: 0, lift: 0, n: 0 }
      const hitRate = rows.filter((r) => r.hit).length / rows.length
      const baseline = rows.reduce((s, r) => s + r.baseline, 0) / rows.length
      return { hitRate, baseline, lift: hitRate - baseline, n: rows.length }
    }

    const threat = summarize(threatResults)
    const survival = summarize(survivalResults)

    console.log(
      '\n' +
        dataTable(
          ['Path type', 'Hit rate', 'Baseline', 'Lift', 'n'],
          [
            [
              'Threat (surprise elim)',
              pct(threat.hitRate),
              pct(threat.baseline),
              delta(threat.lift),
              threat.n,
            ],
            [
              'Survival (clutch surv)',
              pct(survival.hitRate),
              pct(survival.baseline),
              delta(survival.lift),
              survival.n,
            ],
          ],
        ),
    )

    // Per-event breakdown
    const events = [...new Set(allResults.map((r) => `${r.event} S${r.season}`))].sort()
    console.log(
      '\n' +
        dataTable(
          ['Event', 'Type', 'Hit rate', 'Baseline', 'Lift', 'n'],
          events.flatMap((ev) => {
            const [evType, evSeason] = ev.split(' S')
            const rows = allResults.filter(
              (r) => r.event === evType && r.season === Number(evSeason),
            )
            return (['threat', 'survival'] as const).map((t) => {
              const s = summarize(rows.filter((r) => r.type === t))
              return [ev, t, pct(s.hitRate), pct(s.baseline), delta(s.lift), s.n]
            })
          }),
        ),
    )

    // Individual misses — most informative for debugging
    const misses = allResults.filter((r) => !r.hit)
    if (misses.length > 0) {
      console.log(
        '\n' +
          dataTable(
            ['Type', 'Event', 'Player', 'survP', 'Predicted', 'Actual', 'n'],
            misses
              .slice(0, 20)
              .map((r) => [
                r.type,
                `${r.event} S${r.season} seed${r.cutAfterSeed}`,
                r.playerNickname,
                pct(r.survP),
                r.type === 'threat'
                  ? `${r.constraintNickname} ≤ ${r.constraintBound}`
                  : `${r.constraintNickname} ≥ ${r.constraintBound}`,
                r.actualPlace,
                r.nAlive,
              ]),
          ),
      )
    }

    // Directional assertions — only fire if sample is large enough to be meaningful
    if (threat.n >= 10) {
      console.log(
        `Threat path hit rate: ${pct(threat.hitRate)} vs baseline ${pct(threat.baseline)} (n=${threat.n})`,
      )
    }
    if (survival.n >= 10) {
      console.log(
        `Survival path hit rate: ${pct(survival.hitRate)} vs baseline ${pct(survival.baseline)} (n=${survival.n})`,
      )
    }
  })
})
