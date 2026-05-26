import './env'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import {
  buildEvent,
  buildEventFromApiResponse,
  enrichEventPlayers,
  fetchMatch,
} from '@endereye/core'
import type { Match, EventKind, EventPlayer, BracketEntry, ApiEventData } from '@endereye/core'

const API_BASE = 'https://api.mcsrranked.com'

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
  endpoint: string
  qualifyCount?: number
  noBonus?: boolean
}

interface ApiInitData {
  matches: number[]
  brackets: Array<{
    uuid: string
    bonus: number
    completions: Array<{ place: number; score: number } | null>
  }>
}

async function resolveConfig(prefixArg: string | undefined): Promise<R2EventConfig> {
  if (prefixArg) {
    const configs = await getR2Object<R2EventConfig[]>('config/events.json')
    const found = configs?.find((c) => c.prefix === prefixArg)
    if (found) return found
    return {
      slug: prefixArg,
      label: prefixArg,
      kind: 'lcq',
      season: 11,
      prefix: prefixArg,
      endpoint: '',
    }
  }
  const configs = await getR2Object<R2EventConfig[]>('config/events.json')
  if (!configs || configs.length === 0) {
    console.error('No events found in config/events.json and no --prefix specified.')
    process.exit(1)
  }
  const lcq = configs.find((c) => c.kind === 'lcq')
  if (!lcq) {
    const list = configs.map((c) => `  ${c.slug} → --prefix ${c.prefix}`).join('\n')
    console.error(`No MSS event found. Available events:\n${list}`)
    process.exit(1)
  }
  return lcq
}

async function main() {
  const args = process.argv.slice(2)
  const prefixIdx = args.indexOf('--prefix')
  const prefixArg = prefixIdx !== -1 ? args[prefixIdx + 1] : undefined
  const dryRun = args.includes('--dry-run')
  const refetch = args.includes('--refetch')
  const init = args.includes('--init')
  const apiOnly = args.includes('--api-only')

  const config = await resolveConfig(prefixArg)
  const { prefix, kind, season, qualifyCount, endpoint } = config

  console.log(
    `Patching: ${prefix} (kind=${kind}, season=${season})${apiOnly ? ' [API-ONLY]' : init ? ' [INIT]' : ''}${refetch ? ' [REFETCH]' : ''}${dryRun ? ' [DRY RUN]' : ''}`,
  )

  const [existingEvent, existingPlayers] = await Promise.all([
    getR2Object<StoredEvent>(`${prefix}.event.json`),
    getR2Object<EventPlayer[]>(`${prefix}.players.json`),
  ])

  let event: ReturnType<typeof buildEvent>
  let apiBrackets: ApiInitData['brackets'] | undefined
  let refetchedMatches: Match[] | undefined

  if (apiOnly) {
    if (!endpoint) {
      console.error(`Cannot run --api-only: no endpoint configured for prefix "${prefix}".`)
      process.exit(1)
    }
    console.log(`Fetching tournament data from ${API_BASE}/${endpoint}...`)
    const apiRes = await fetch(`${API_BASE}/${endpoint}`).then(
      (r) => r.json() as Promise<{ status: string; data: ApiEventData }>,
    )
    if (apiRes.status !== 'success') {
      console.error('Tournament API returned non-success status:', apiRes.status)
      process.exit(1)
    }
    apiBrackets = apiRes.data.brackets
    event = buildEventFromApiResponse(apiRes.data)
    console.log(`Built from API: ${event.brackets.length} players, ${event.currentRound - 1} seeds`)
  } else {
    const storedMatches = await getR2Object<Match[]>(`${prefix}.raw.json`)

    const bonusMap = new Map<string, number>()
    let rawMatches: Match[]

    if (init || !storedMatches || storedMatches.length === 0) {
      if (!endpoint) {
        console.error(
          `Cannot init: no endpoint configured for prefix "${prefix}". Add it to config/events.json.`,
        )
        process.exit(1)
      }
      console.log(`Fetching tournament data from ${API_BASE}/${endpoint}...`)
      const apiRes = await fetch(`${API_BASE}/${endpoint}`).then(
        (r) => r.json() as Promise<{ status: string; data: ApiInitData }>,
      )
      if (apiRes.status !== 'success') {
        console.error('Tournament API returned non-success status:', apiRes.status)
        process.exit(1)
      }
      const { matches: matchIds, brackets: fetchedBrackets } = apiRes.data
      apiBrackets = fetchedBrackets
      for (const b of apiBrackets) bonusMap.set(b.uuid, b.bonus)
      console.log(`Fetching ${matchIds.length} match(es) from MCSR API...`)
      rawMatches = await Promise.all(matchIds.map((id) => fetchMatch(id)))
      console.log(`Fetched: ${rawMatches.map((m) => m.id).join(', ')}`)
      if (!dryRun) {
        await putR2Object(`${prefix}.raw.json`, rawMatches)
        console.log(`Wrote ${prefix}.raw.json`)
      }
    } else {
      rawMatches = storedMatches
      if (refetch) {
        console.log(`Re-fetching ${storedMatches.length} match(es) from MCSR API...`)
        rawMatches = await Promise.all(storedMatches.map((m) => fetchMatch(m.id)))
        refetchedMatches = rawMatches
        console.log(`Re-fetched: ${rawMatches.map((m) => m.id).join(', ')}`)
      }
      if (existingEvent) {
        for (const b of existingEvent.brackets) bonusMap.set(b.uuid, b.bonus)
      }
    }

    console.log(`Raw matches: ${rawMatches.length}`)
    event = buildEvent(rawMatches, bonusMap)
    console.log(`Rebuilt bracket players: ${event.brackets.length}`)
  }

  console.log(`Existing bracket players: ${existingEvent?.brackets.length ?? 0}`)

  const scoreOverrides: Record<string, Record<string, number>> = {}
  if (apiBrackets) {
    const computedByUuid = new Map(event.brackets.map((b) => [b.uuid, b]))
    for (const ab of apiBrackets) {
      const computed = computedByUuid.get(ab.uuid)
      if (!computed) continue
      for (let i = 0; i < ab.completions.length; i++) {
        const apiC = ab.completions[i]
        const compC = computed.completions[i]
        if (!apiC || !compC) continue
        if (apiC.score !== compC.score) {
          if (!scoreOverrides[ab.uuid]) scoreOverrides[ab.uuid] = {}
          scoreOverrides[ab.uuid][String(i)] = apiC.score
        }
      }
    }
    const overrideCount = Object.keys(scoreOverrides).length
    if (overrideCount > 0)
      console.log(`Score overrides: ${overrideCount} player(s) with API-corrected scores`)
    else console.log('Scores match API — no overrides needed')
  }

  const existingUuids = new Set((existingPlayers ?? []).map((p) => p.uuid))
  const newUuids = event.players.filter((p) => !existingUuids.has(p.uuid))

  if (newUuids.length > 0) {
    console.log(`New players to enrich: ${newUuids.map((p) => p.uuid).join(', ')}`)
  }

  if (!dryRun) {
    const writes: Promise<void>[] = [
      putR2Object(`${prefix}.event.json`, { ...event, qualifyCount }),
      ...(refetchedMatches ? [putR2Object(`${prefix}.raw.json`, refetchedMatches)] : []),
      ...(Object.keys(scoreOverrides).length > 0
        ? [putR2Object(`${prefix}.overrides.json`, scoreOverrides)]
        : []),
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
