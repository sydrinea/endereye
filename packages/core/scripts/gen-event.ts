import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { MatchListSchema } from '../lib/api/types'
import { fetchEventMatches, fetchPhaseLeaderboard } from '../lib/api/fetch'
import { buildEvent, computeBonusMap } from '../lib/events/build'
import { EVENTS } from '../config/events'

async function main() {
  if (!existsSync('discovery/lcq/10.json')) {
    const data = await fetchEventMatches({
      before: EVENTS[0].matchIdBounds.before,
      after: EVENTS[0].matchIdBounds.after,
    })
    await writeFile('discovery/lcq/10.json', JSON.stringify(data, null, 2), 'utf-8')
  }
  const seedMatches = MatchListSchema.parse(
    JSON.parse(await readFile('discovery/lcq/10.json', 'utf-8')),
  )
  const leaderboard = await fetchPhaseLeaderboard(10)
  const bonusMap = computeBonusMap(seedMatches, leaderboard)
  await writeFile(
    'discovery/lcq/10.event.json',
    JSON.stringify(buildEvent(seedMatches, bonusMap), null, 2),
    'utf-8',
  )
}

main()
