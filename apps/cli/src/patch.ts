import './env'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { buildEvent, enrichEventPlayers, fetchMatch } from '@endereye/core'
import type { Match, EventKind, EventPlayer, BracketEntry } from '@endereye/core'

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

async function putR2Object(key: string, value: unknown): Promise<void> {
  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: JSON.stringify(value),
      ContentType: 'application/json',
    }),
  )
}

interface StoredEvent {
  currentRound: number
  matches: number[]
  brackets: BracketEntry[]
  players: { uuid: string; country: string | null }[]
  qualifyCount?: number
}

interface R2EventConfig {
  slug: string
  label: string
  kind: 'lcq' | 'mss'
  season: number
  prefix: string
  qualifyCount?: number
  noBonus?: boolean
}

async function resolveConfig(prefixArg: string | undefined): Promise<R2EventConfig> {
  if (prefixArg) {
    const configs = await getR2Object<R2EventConfig[]>('config/events.json')
    const found = configs?.find((c) => c.prefix === prefixArg)
    if (found) return found
    // Caller gave a prefix but it's not in config — synthesize a minimal config
    return { slug: prefixArg, label: prefixArg, kind: 'mss', season: 11, prefix: prefixArg }
  }
  const configs = await getR2Object<R2EventConfig[]>('config/events.json')
  if (!configs || configs.length === 0) {
    console.error('No events found in config/events.json and no --prefix specified.')
    process.exit(1)
  }
  const mss = configs.find((c) => c.kind === 'mss')
  if (!mss) {
    const list = configs.map((c) => `  ${c.slug} → --prefix ${c.prefix}`).join('\n')
    console.error(`No MSS event found. Available events:\n${list}`)
    process.exit(1)
  }
  return mss
}

async function main() {
  const args = process.argv.slice(2)
  const prefixIdx = args.indexOf('--prefix')
  const prefixArg = prefixIdx !== -1 ? args[prefixIdx + 1] : undefined
  const dryRun = args.includes('--dry-run')
  const refetch = args.includes('--refetch')

  const config = await resolveConfig(prefixArg)
  const { prefix, kind, season, qualifyCount } = config

  console.log(`Patching: ${prefix} (kind=${kind}, season=${season})${refetch ? ' [REFETCH]' : ''}${dryRun ? ' [DRY RUN]' : ''}`)

  const [storedMatches, existingEvent, existingPlayers] = await Promise.all([
    getR2Object<Match[]>(`${prefix}.raw.json`),
    getR2Object<StoredEvent>(`${prefix}.event.json`),
    getR2Object<EventPlayer[]>(`${prefix}.players.json`),
  ])

  if (!storedMatches || storedMatches.length === 0) {
    console.error(`No raw match data found at ${prefix}.raw.json`)
    process.exit(1)
  }

  let rawMatches = storedMatches
  if (refetch) {
    console.log(`Re-fetching ${storedMatches.length} match(es) from MCSR API...`)
    rawMatches = await Promise.all(storedMatches.map((m) => fetchMatch(m.id)))
    console.log(`Re-fetched: ${rawMatches.map((m) => m.id).join(', ')}`)
  }

  // Reconstruct bonusMap from stored bracket rather than re-fetching the leaderboard
  const bonusMap = new Map<string, number>()
  if (existingEvent) {
    for (const b of existingEvent.brackets) {
      bonusMap.set(b.uuid, b.bonus)
    }
  }

  console.log(`Raw matches: ${rawMatches.length}`)
  console.log(`Existing bracket players: ${existingEvent?.brackets.length ?? 0}`)

  const event = buildEvent(rawMatches, bonusMap)

  console.log(`Rebuilt bracket players: ${event.brackets.length}`)

  const existingUuids = new Set((existingPlayers ?? []).map((p) => p.uuid))
  const newUuids = event.players.filter((p) => !existingUuids.has(p.uuid))

  if (newUuids.length > 0) {
    console.log(`New players to enrich: ${newUuids.map((p) => p.uuid).join(', ')}`)
  }

  if (!dryRun) {
    const writes: Promise<void>[] = [
      putR2Object(`${prefix}.event.json`, { ...event, qualifyCount }),
      ...(refetch ? [putR2Object(`${prefix}.raw.json`, rawMatches)] : []),
    ]

    if (newUuids.length > 0) {
      const enriched = await enrichEventPlayers(event, kind as EventKind, season)
      const mergedPlayers = [
        ...(existingPlayers ?? []).filter((p) => !newUuids.some((n) => n.uuid === p.uuid)),
        ...enriched.filter((p) => newUuids.some((n) => n.uuid === p.uuid)),
      ]
      writes.push(putR2Object(`${prefix}.players.json`, mergedPlayers))
      console.log(`Enriched ${newUuids.length} new player(s) and merged into players.json`)
    }

    await Promise.all(writes)
    console.log('Done — R2 updated.')
  } else {
    console.log('Dry run complete — no writes.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
