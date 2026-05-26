import './env'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

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

interface Completion {
  place: number
  score: number
}

interface StoredBracket {
  ranks: number[]
  uuid: string
  completions: Array<Completion | null>
  point: number
  bonus: number
  eliminated: boolean
}

interface StoredEvent {
  currentRound: number
  matches: number[]
  brackets: StoredBracket[]
  players: { uuid: string; country: string | null }[]
  qualifyCount?: number
}

interface ApiBracket {
  rank: number
  prevRank: number
  uuid: string
  completions: Array<Completion | null>
  point: number
  bonus: number
  eliminated: boolean
}

interface ApiPlayer {
  uuid: string
  nickname: string
}

interface ApiData {
  currentRound: number
  matches: number[]
  brackets: ApiBracket[]
  players: ApiPlayer[]
}

interface R2EventConfig {
  slug: string
  label: string
  kind: 'lcq' | 'mss'
  prefix: string
  endpoint: string
}

const API_BASE = 'https://api.mcsrranked.com'

async function resolveConfig(arg: string | undefined): Promise<R2EventConfig> {
  const configs = await getR2Object<R2EventConfig[]>('config/events.json')
  if (arg) {
    const found = configs?.find((c) => c.prefix === arg)
    if (found) return found
    console.error(`No event found in config with prefix: ${arg}`)
    process.exit(1)
  }
  if (!configs || configs.length === 0) {
    console.error('No events found in config/events.json and no --prefix specified.')
    process.exit(1)
  }
  const mss = configs.find((c) => c.kind === 'mss')
  if (!mss) {
    const prefixes = configs.map((c) => `  ${c.slug} → --prefix ${c.prefix}`).join('\n')
    console.error(`No MSS event found. Available events:\n${prefixes}`)
    process.exit(1)
  }
  return mss
}

function diffCompletions(
  r2: Array<Completion | null>,
  api: Array<Completion | null>,
  diffs: string[],
) {
  const len = Math.max(r2.length, api.length)
  for (let i = 0; i < len; i++) {
    const r = r2[i] ?? null
    const a = api[i] ?? null
    if (r === null && a === null) continue
    if (r === null || a === null) {
      diffs.push(
        `  completions[${i}]: R2=${r === null ? 'null' : `place=${r.place}`}  API=${a === null ? 'null' : `place=${a.place}`}`,
      )
      continue
    }
    if (r.place !== a.place) diffs.push(`  completions[${i}].place: R2=${r.place}  API=${a.place}`)
    if (r.score !== a.score) diffs.push(`  completions[${i}].score: R2=${r.score}  API=${a.score}`)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const prefixIdx = args.indexOf('--prefix')
  const prefixArg = prefixIdx !== -1 ? args[prefixIdx + 1] : undefined

  const config = await resolveConfig(prefixArg)
  const { prefix, label, endpoint } = config

  console.log(`=== Bracket Validation: ${label} ===`)
  console.log(`R2 prefix: ${prefix}\n`)

  const [r2Event, rawOverrides, apiRes] = await Promise.all([
    getR2Object<StoredEvent>(`${prefix}.event.json`),
    getR2Object<Record<string, Record<string, number>>>(`${prefix}.overrides.json`),
    fetch(`${API_BASE}/${endpoint}`).then(
      (r) => r.json() as Promise<{ status: string; data: ApiData }>,
    ),
  ])

  if (!r2Event) {
    console.error(`R2 object not found: ${prefix}.event.json`)
    process.exit(1)
  }

  if (rawOverrides) {
    for (const bracket of r2Event.brackets) {
      const overrides = rawOverrides[bracket.uuid]
      if (!overrides) continue
      for (const [seedIndexStr, overrideScore] of Object.entries(overrides)) {
        const i = Number(seedIndexStr)
        const c = bracket.completions[i]
        if (c) bracket.completions[i] = { ...c, score: overrideScore }
      }
      bracket.point =
        bracket.bonus + bracket.completions.reduce((sum, c) => sum + (c?.score ?? 0), 0)
    }
    console.log(`Applied overrides for ${Object.keys(rawOverrides).length} player(s)\n`)
  }
  if (apiRes.status !== 'success') {
    console.error('API returned non-success status:', apiRes.status)
    process.exit(1)
  }

  const api = apiRes.data
  const nicknames = new Map(api.players.map((p) => [p.uuid, p.nickname]))

  let ok = 0
  let bad = 0

  // currentRound
  if (r2Event.currentRound === api.currentRound) {
    console.log(`✓ currentRound: ${r2Event.currentRound}`)
    ok++
  } else {
    console.log(`✗ currentRound: R2=${r2Event.currentRound}  API=${api.currentRound}`)
    bad++
  }

  const r2Matches = [...r2Event.matches].sort((a, b) => a - b)
  const apiMatches = [...api.matches].sort((a, b) => a - b)
  if (JSON.stringify(r2Matches) === JSON.stringify(apiMatches)) {
    console.log(`✓ matches: [${r2Matches.join(', ')}]`)
    ok++
  } else {
    const onlyR2 = r2Matches.filter((m) => !apiMatches.includes(m))
    const onlyApi = apiMatches.filter((m) => !r2Matches.includes(m))
    console.log(`✗ matches differ`)
    if (onlyR2.length) console.log(`  only in R2:  [${onlyR2.join(', ')}]`)
    if (onlyApi.length) console.log(`  only in API: [${onlyApi.join(', ')}]`)
    bad++
  }

  const r2ByUuid = new Map(r2Event.brackets.map((b) => [b.uuid, b]))
  const apiByUuid = new Map(api.brackets.map((b) => [b.uuid, b]))
  const allUuids = new Set([...r2ByUuid.keys(), ...apiByUuid.keys()])

  console.log(`\nChecking ${allUuids.size} players...`)

  for (const uuid of allUuids) {
    const r2b = r2ByUuid.get(uuid)
    const apib = apiByUuid.get(uuid)
    const name = nicknames.get(uuid) ?? uuid

    if (!r2b) {
      console.log(`✗ ${name}: missing from R2`)
      bad++
      continue
    }
    if (!apib) {
      console.log(`✗ ${name}: missing from API`)
      bad++
      continue
    }

    const diffs: string[] = []
    if (r2b.point !== apib.point) diffs.push(`  point: R2=${r2b.point}  API=${apib.point}`)
    if (r2b.bonus !== apib.bonus) diffs.push(`  bonus: R2=${r2b.bonus}  API=${apib.bonus}`)
    if (r2b.eliminated !== apib.eliminated)
      diffs.push(`  eliminated: R2=${r2b.eliminated}  API=${apib.eliminated}`)
    diffCompletions(r2b.completions, apib.completions, diffs)

    if (diffs.length === 0) {
      console.log(`✓ ${name} (${r2b.point} pts)`)
      ok++
    } else {
      console.log(`✗ ${name}:`)
      diffs.forEach((d) => console.log(d))
      bad++
    }
  }

  console.log(`\n=== Result: ${ok} OK, ${bad} differences ===`)
  process.exit(bad > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
