import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { computePlayerOdds, runHeatmapSimulation, type EventKind, type EventContext, type EventPlayer, type BracketEntry } from '@endereye/core'
import { renderSurvivalHeatmap, copyPngToClipboard } from '@endereye/image'
import { computeHistoricalData, buildPlayerViews } from '@endereye/core'
import { defineCommand, runMain } from 'citty'
import { log } from './logger'

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

interface StoredEvent {
  currentRound: number
  matches: number[]
  brackets: BracketEntry[]
  players: { uuid: string; country: string | null }[]
  qualifyCount?: number
}

async function getEventContext(
  kind: EventKind,
  season: number,
  prefix: string,
  qualifyCount?: number,
): Promise<EventContext | null> {
  const [eventData, playersData] = await Promise.all([
    getR2Object<StoredEvent>(`${prefix}.event.json`),
    getR2Object<EventPlayer[]>(`${prefix}.players.json`),
  ])

  if (!eventData) {
    const defaultPlayers = await getR2Object<EventPlayer[]>(`${prefix}.players.default.json`)
    if (!defaultPlayers) return null
    return {
      kind,
      season,
      players: defaultPlayers,
      brackets: defaultPlayers.map((p, i) => ({
        uuid: p.uuid,
        ranks: [i + 1],
        completions: [],
        point: 0,
        bonus: 0,
        eliminated: false,
      })),
      matches: [],
      currentRound: 1,
      qualifyCount,
    }
  }

  return {
    kind,
    season,
    players: playersData ?? [],
    brackets: eventData.brackets,
    matches: eventData.matches,
    currentRound: eventData.currentRound,
    qualifyCount: eventData.qualifyCount ?? qualifyCount,
  }
}

const main = defineCommand({
  meta: {
    name: 'endereye',
    description: 'LCQ/MSS survival odds generator',
  },
  args: {
    season: {
      type: 'string',
      description: 'Season number',
      required: true,
      alias: 's',
    },
    event: {
      type: 'string',
      description: 'Event type: lcq or mss',
      default: 'lcq',
      alias: 'e',
    },
    prefix: {
      type: 'string',
      description: 'R2 key prefix (e.g. lcq/10)',
      required: true,
      alias: 'p',
    },
    seed: {
      type: 'string',
      description: 'After which seed to compute (0 = pre-event)',
      default: '0',
      alias: 'a',
    },
    iterations: {
      type: 'string',
      description: 'Monte Carlo iterations',
      default: '10000',
      alias: 'i',
    },
    qualifyCount: {
      type: 'string',
      description: 'Number of qualifying spots',
      alias: 'q',
    },
  },
  async run({ args }) {
    const season = Number(args.season)
    const afterSeed = Number(args.seed)
    const iterations = Number(args.iterations)
    const kind = args.event as EventKind
    const qualifyCount = args.qualifyCount ? Number(args.qualifyCount) : undefined

    log.section(`S${season} ${kind.toUpperCase()} — After Seed ${afterSeed}`)

    log.start('Fetching event data...')
    const data = await getEventContext(kind, season, args.prefix, qualifyCount)
    if (!data) throw new Error(`No event data found for prefix "${args.prefix}"`)

    log.start(`Computing historical state at seed ${afterSeed}...`)
    const state = computeHistoricalData(data, afterSeed)

    log.start(`Running Monte Carlo (${iterations.toLocaleString()} iterations)...`)

    const heatmap = runHeatmapSimulation(state, state.currentRound, iterations)

    const odds = computePlayerOdds(state)
    const players = buildPlayerViews(state, odds)
    const alive = players.filter((p) => !p.eliminated)

    log.success(`Simulation complete — ${alive.length} players surviving`)

    log.start('Rendering image...')
    const png = await renderSurvivalHeatmap({
      season,
      kind,
      currentRound: state.currentRound,
      results: heatmap,
      players: alive.map((p) => ({ uuid: p.uuid, nickname: p.nickname, eloRank: p.eloRank })),
      iterations,
    })
    copyPngToClipboard(png)
    log.success(`Copied image to clipboard`)
  },
})

runMain(main)
