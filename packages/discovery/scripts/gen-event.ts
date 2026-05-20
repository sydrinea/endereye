import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { MatchListSchema } from '@endereye/core'
import { fetchEventMatches, fetchPhaseLeaderboard } from '@endereye/core'
import { buildEvent, computeBonusMap } from '@endereye/core'

const DATA_DIR = join(__dirname, '../data')

interface GenEventConfig {
  kind: 'lcq' | 'mss'
  season: number
  matchIdBounds: { after: number; before: number }
}

const EVENTS: GenEventConfig[] = [
  {
    kind: 'lcq',
    season: 10,
    matchIdBounds: { after: 9750329, before: 9784987 },
  },
]

async function genEvent(cfg: GenEventConfig) {
  const rawPath = join(DATA_DIR, `${cfg.kind}/${cfg.season}.json`)
  const outPath = join(DATA_DIR, `${cfg.kind}/${cfg.season}.event.json`)

  if (!existsSync(rawPath)) {
    console.log(`Fetching matches for ${cfg.kind} s${cfg.season}...`)
    const data = await fetchEventMatches(cfg.matchIdBounds)
    await writeFile(rawPath, JSON.stringify(data, null, 2), 'utf-8')
    console.log(`Wrote ${data.length} matches to ${rawPath}`)
  }

  const seedMatches = MatchListSchema.parse(JSON.parse(await readFile(rawPath, 'utf-8')))
  const leaderboard = await fetchPhaseLeaderboard(cfg.season)
  const bonusMap = computeBonusMap(seedMatches, leaderboard)
  const event = buildEvent(seedMatches, bonusMap)

  await writeFile(outPath, JSON.stringify(event, null, 2), 'utf-8')
  console.log(
    `Wrote event to ${outPath} (currentRound: ${event.currentRound}, brackets: ${event.brackets.length})`,
  )
}

async function main() {
  for (const cfg of EVENTS) {
    await genEvent(cfg)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
